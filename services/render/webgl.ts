/**
 * WebGL2 LUT renderer.
 *
 * Uploads the image plus a 3D LUT (RGBA16F — filterable, so hardware does the
 * trilinear interpolation) and draws the graded image with a fullscreen quad.
 * Falls back to the CPU path in `lutGenerator` when WebGL2 is unavailable.
 */

import { LUT3D, ParsedLUT } from '../lut/types';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// NOTE: GLSL ES 3.00 has NO default precision for `sampler3D` (only
// `sampler2D` / `samplerCube`), so every sampler must be explicitly qualified
// or the shader fails to compile. `highp` also avoids low-precision sampling
// that would reintroduce banding.
const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uImage;
uniform highp sampler3D uLut;
uniform float uLutSize;
uniform float uStrength;
uniform float uMix;      // 0 = original, 1 = graded
in vec2 vUv;
out vec4 fragColor;

void main() {
  vec3 c = clamp(texture(uImage, vUv).rgb, 0.0, 1.0);
  float scale = (uLutSize - 1.0) / uLutSize;
  float offset = 0.5 / uLutSize;
  vec3 graded = texture(uLut, c * scale + offset).rgb;
  fragColor = vec4(mix(c, graded, uStrength * uMix), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

export class LUTRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private imageTex: WebGLTexture;
  private lutTex: WebGLTexture;
  private uImage: WebGLUniformLocation | null;
  private uLut: WebGLUniformLocation | null;
  private uLutSize: WebGLUniformLocation | null;
  private uStrength: WebGLUniformLocation | null;
  private uMix: WebGLUniformLocation | null;
  private hasImage = false;
  private hasLut = false;
  private lutSize = 2;
  private strength = 1;
  private mix = 1;
  private disposed = false;
  private contextLost = false;

  /** Notified when the browser drops the WebGL context (driver reset, tab eviction). */
  onContextLost: (() => void) | null = null;

  private handleContextLost = (e: Event) => {
    // Preventing the default is what lets the browser attempt a restore later.
    e.preventDefault();
    this.contextLost = true;
    // Drop the uploaded image so no further draw can present a stale frame.
    this.hasImage = false;
    if (!this.disposed) this.onContextLost?.();
  };

  private handleContextRestored = () => {
    // The old program/textures are gone for good; the owner must build a new
    // renderer (and re-upload), which is exactly what the lost handler sets up.
    this.contextLost = false;
  };

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) throw new Error('WebGL2 not available');
    this.gl = gl;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.imageTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.lutTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.useProgram(program);
    this.uImage = gl.getUniformLocation(program, 'uImage');
    this.uLut = gl.getUniformLocation(program, 'uLut');
    this.uLutSize = gl.getUniformLocation(program, 'uLutSize');
    this.uStrength = gl.getUniformLocation(program, 'uStrength');
    this.uMix = gl.getUniformLocation(program, 'uMix');

    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  private static supportChecked: boolean | null = null;

  /**
   * Capability check that actually builds (and disposes) a renderer on a
   * throwaway canvas. This matters: `getContext('webgl2')` can succeed while
   * the shaders still fail to compile, and a canvas that has been bound to a
   * WebGL context can never hand out a 2D context afterwards.
   */
  static isSupported(): boolean {
    if (LUTRenderer.supportChecked !== null) return LUTRenderer.supportChecked;
    let ok = false;
    try {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      const probe = new LUTRenderer(c);
      probe.dispose();
      ok = true;
    } catch {
      ok = false;
    }
    LUTRenderer.supportChecked = ok;
    return ok;
  }

  get canvasSize(): { w: number; h: number } {
    return { w: this.canvas.width, h: this.canvas.height };
  }

  /** Upload the source image and size the canvas to its natural resolution. */
  setImage(source: TexImageSource, width: number, height: number): void {
    const { gl } = this;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.hasImage = true;
  }

  /** Upload a 3D LUT as a filterable RGBA16F 3D texture. */
  setLUT(lut: ParsedLUT | null): void {
    if (!lut || lut.dimension !== 3) {
      this.hasLut = false;
      return;
    }
    const l3 = lut as LUT3D;
    const { gl } = this;
    const n = l3.size;
    const rgba = new Float32Array(n * n * n * 4);
    for (let i = 0, j = 0; i < l3.data.length; i += 3, j += 4) {
      rgba[j] = l3.data[i];
      rgba[j + 1] = l3.data[i + 1];
      rgba[j + 2] = l3.data[i + 2];
      rgba[j + 3] = 1;
    }
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA16F,
      n,
      n,
      n,
      0,
      gl.RGBA,
      gl.FLOAT,
      rgba,
    );
    this.lutSize = n;
    this.hasLut = true;
  }

  /** Overall LUT strength (0..1). */
  setStrength(v: number): void {
    this.strength = Math.max(0, Math.min(1, v));
    this.render();
  }

  /** Before/after mix for A/B compare (0 = original, 1 = graded). */
  setMix(v: number): void {
    this.mix = Math.max(0, Math.min(1, v));
    this.render();
  }

  render(): void {
    if (this.disposed || this.contextLost || !this.hasImage) return;
    const { gl } = this;
    // A context that died between frames must not be drawn through.
    if (gl.isContextLost()) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTex);
    gl.uniform1i(this.uImage, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.uniform1i(this.uLut, 1);

    // If there is no LUT, the sample still needs a valid size uniform.
    gl.uniform1f(this.uLutSize, this.hasLut ? this.lutSize : 2);
    gl.uniform1f(this.uStrength, this.hasLut ? this.strength : 0);
    gl.uniform1f(this.uMix, this.mix);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost, false);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored, false);
    const { gl } = this;
    // Losing the context already reclaimed every resource; deleting against a
    // dead context is a no-op at best and an error at worst.
    if (gl.isContextLost()) return;
    gl.deleteTexture(this.imageTex);
    gl.deleteTexture(this.lutTex);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    // Free the context itself so repeated GPU/CPU switching cannot exhaust the
    // browser's per-page context budget.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
