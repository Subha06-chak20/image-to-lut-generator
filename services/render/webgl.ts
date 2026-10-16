/**
 * WebGL2 grade renderer.
 *
 * Uploads the source image once, then grades it on the GPU in one of two modes:
 *
 *   LUT mode    a baked 3D LUT (RGBA16F — filterable, so hardware does the
 *               trilinear interpolation). This is the CPU-parity path and what
 *               the exported `.cube` reproduces exactly.
 *   Param mode  the grade evaluated directly from uniforms, so moving a slider
 *               costs a few uniform writes instead of a full lattice bake.
 *
 * Both modes share the context, the quad and the image texture, so switching
 * between them never re-uploads the source. Falls back to the CPU path in
 * `lutGenerator` when WebGL2 is unavailable.
 */

import { GradeParams, CURVE_ROWS, CURVE_SIZE, INVCDF_ROWS, INVCDF_SIZE } from '../gpu/gradeParams';
import { LUT3D, ParsedLUT } from '../lut/types';
import { FRAG, VERT } from './shaders';

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

/** A 1x1 opaque RGBA16F texel, so the curve samplers are always complete. */
function createUnitTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array([1, 1, 1, 1]));
  return tex;
}

export class LUTRenderer {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private vbo: WebGLBuffer;
  private imageTex: WebGLTexture;
  private lutTex: WebGLTexture;
  private curveTex: WebGLTexture;
  private invCdfTex: WebGLTexture;
  private uniformCache = new Map<string, WebGLUniformLocation | null>();
  private hasImage = false;
  private hasLut = false;
  private lutSize = 2;
  private strength = 1;
  private mix = 1;
  /** Non-null while the parameterised grade path is active. */
  private params: GradeParams | null = null;
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

    this.curveTex = createUnitTexture(gl);
    this.invCdfTex = createUnitTexture(gl);

    gl.useProgram(program);
    canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
  }

  private uniform(name: string): WebGLUniformLocation | null {
    if (!this.uniformCache.has(name)) {
      this.uniformCache.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.uniformCache.get(name) ?? null;
  }

  private static supportChecked: boolean | null = null;

  /**
   * Capability check that actually builds (and disposes) a renderer on a
   * throwaway canvas. This matters: `getContext('webgl2')` can succeed while
   * the shaders still fail to compile, and a canvas that has been bound to a
   * WebGL context can never hand out a 2D context afterwards.
   *
   * It also compiles the full grade shader, so a backend that only passes the
   * context check is never assumed usable.
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

  /** Upload a 3D LUT as a filterable RGBA16F 3D texture (LUT mode). */
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
    this.params = null;
  }

  /**
   * Switch to the parameterised grade path. Passing `null` reverts to LUT mode.
   *
   * This is the whole point of the parameter path: the per-slider cost is two
   * small table uploads (curves + inverse CDF) and a handful of uniforms, with
   * no N³ lattice evaluation anywhere.
   */
  setGradeParams(params: GradeParams | null): void {
    this.params = params;
    if (params) this.uploadGradeParams(params);
    this.render();
  }

  private uploadGradeParams(p: GradeParams): void {
    const { gl } = this;
    gl.useProgram(this.program);

    const f = (name: string, v: number) => gl.uniform1f(this.uniform(name), v);
    const i = (name: string, v: number) => gl.uniform1i(this.uniform(name), v);
    const v3 = (name: string, v: readonly number[]) =>
      gl.uniform3f(this.uniform(name), v[0], v[1], v[2]);
    /** Upload one row of a row-major 3x3 as a vec3 (see `mulMat` in the shader). */
    const row = (name: string, m: readonly number[], r: number) =>
      gl.uniform3f(this.uniform(name), m[r * 3], m[r * 3 + 1], m[r * 3 + 2]);

    i('uMode', 1);
    i('uCmEnabled', p.cmEnabled ? 1 : 0);
    i('uTonemap', p.tonemap ? 1 : 0);
    i('uInputLog', p.inputLog);
    i('uInputSpace', p.inputSpace);
    i('uWorkingSpace', p.workingSpace);
    i('uOutputSpace', p.outputSpace);
    row('uLinMat0', p.linearMat, 0);
    row('uLinMat1', p.linearMat, 1);
    row('uLinMat2', p.linearMat, 2);

    i('uEngine', p.engine);
    f('uTransferMix', p.transferMix);
    v3('uReinhardScale', p.reinhardScale);
    v3('uReinhardBias', p.reinhardBias);
    row('uMkMat0', p.mkMat, 0);
    row('uMkMat1', p.mkMat, 1);
    row('uMkMat2', p.mkMat, 2);
    v3('uMkOffset', p.mkOffset);
    v3('uRegionScale0', p.regionScale.slice(0, 3));
    v3('uRegionScale1', p.regionScale.slice(3, 6));
    v3('uRegionScale2', p.regionScale.slice(6, 9));
    v3('uRegionBias0', p.regionBias.slice(0, 3));
    v3('uRegionBias1', p.regionBias.slice(3, 6));
    v3('uRegionBias2', p.regionBias.slice(6, 9));

    f('uExposure', p.exposure);
    f('uBrightness', p.brightness);
    f('uContrast', p.contrast);
    f('uSaturation', p.saturation);
    f('uVibrance', p.vibrance);
    f('uHue', p.hue);
    gl.uniform4f(this.uniform('uTonal'), p.tonal[0], p.tonal[1], p.tonal[2], p.tonal[3]);
    i('uLogWheels', p.logWheels ? 1 : 0);
    i('uWheelsActive', p.wheelsActive ? 1 : 0);
    i('uCurvesActive', p.curvesActive ? 1 : 0);
    i('uCurveMask', p.curveMask);
    i('uHueCurvesActive', p.hueCurvesActive ? 1 : 0);
    v3('uWheelLift', p.wheelLift);
    v3('uWheelGamma', p.wheelGamma);
    v3('uWheelGain', p.wheelGain);
    v3('uWheelOffset', p.wheelOffset);

    // Operation order: an int array indexed by the loop in applyAdjustShader.
    // `getUniformLocation` with the bare name resolves to element 0, so the
    // whole array is written with a single call.
    gl.uniform1i(this.uniform('uOpCount'), p.opCount);
    gl.uniform1iv(this.uniform('uOpOrder'), new Int32Array(p.opOrder));

    // Curves + inverse CDF as filterable half-float 2D tables.
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      CURVE_SIZE,
      CURVE_ROWS,
      0,
      gl.RGBA,
      gl.FLOAT,
      p.curves,
    );

    gl.bindTexture(gl.TEXTURE_2D, this.invCdfTex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      INVCDF_SIZE,
      INVCDF_ROWS,
      0,
      gl.RGBA,
      gl.FLOAT,
      p.invCdf,
    );
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
    gl.uniform1i(this.uniform('uImage'), 0);

    if (this.params) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
      gl.uniform1i(this.uniform('uCurves'), 2);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.invCdfTex);
      gl.uniform1i(this.uniform('uInvCdf'), 3);
      gl.uniform1i(this.uniform('uMode'), 1);
    } else {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
      gl.uniform1i(this.uniform('uLut'), 1);
      gl.uniform1i(this.uniform('uMode'), 0);
    }

    // If there is no LUT, the sample still needs a valid size uniform.
    gl.uniform1f(this.uniform('uLutSize'), this.hasLut ? this.lutSize : 2);
    gl.uniform1f(this.uniform('uStrength'), this.hasLut || this.params ? this.strength : 0);
    gl.uniform1f(this.uniform('uMix'), this.mix);

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
    gl.deleteTexture(this.curveTex);
    gl.deleteTexture(this.invCdfTex);
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
    // Free the context itself so repeated GPU/CPU switching cannot exhaust the
    // browser's per-page context budget.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
