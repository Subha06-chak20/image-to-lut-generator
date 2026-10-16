/**
 * WebGL2 capability probe.
 *
 * The result is cached: creating a throwaway context is cheap but not free, and
 * the settings panel, the header badge and the preview all ask for it. The probe
 * context is explicitly released so it doesn't count against the browser's live
 * context budget (Chrome evicts the oldest context once too many exist, which
 * would silently blank the real preview).
 */

export interface GpuCapabilities {
  webgl2: boolean;
  renderer: string | null;
  vendor: string | null;
  maxTextureSize: number | null;
  max3dTextureSize: number | null;
  maxTextureUnits: number | null;
  maxRenderbufferSize: number | null;
}

const UNKNOWN: GpuCapabilities = {
  webgl2: false,
  renderer: null,
  vendor: null,
  maxTextureSize: null,
  max3dTextureSize: null,
  maxTextureUnits: null,
  maxRenderbufferSize: null,
};

let cached: GpuCapabilities | null = null;

function probe(): GpuCapabilities {
  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGL2RenderingContext | null = null;
  try {
    canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
    if (!gl) return UNKNOWN;

    // The unmasked strings are the only ones that name the actual adapter; the
    // plain RENDERER parameter is aggressively masked in most browsers.
    let renderer: string | null = null;
    let vendor: string | null = null;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      try {
        renderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '') || null;
        vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? '') || null;
      } catch {
        // Some browsers expose the extension but reject the parameter.
      }
    }
    if (!renderer) renderer = String(gl.getParameter(gl.RENDERER) ?? '') || null;
    if (!vendor) vendor = String(gl.getParameter(gl.VENDOR) ?? '') || null;

    const caps: GpuCapabilities = {
      webgl2: true,
      renderer,
      vendor,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) ?? null,
      max3dTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) ?? null,
      maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) ?? null,
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? null,
    };

    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return caps;
  } catch {
    return UNKNOWN;
  } finally {
    gl = null;
    canvas = null;
  }
}

export function getGpuCapabilities(): GpuCapabilities {
  if (!cached) cached = probe();
  return cached;
}

/** Human-readable summary for the settings panel. */
export function gpuDisplayName(caps: GpuCapabilities): string {
  if (!caps.webgl2) return 'Not available';
  const name = caps.renderer || 'Unknown adapter';
  return name.length > 64 ? `${name.slice(0, 61)}...` : name;
}
