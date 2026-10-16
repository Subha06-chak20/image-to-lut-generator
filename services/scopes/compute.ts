/**
 * Scope data extraction (Phase 3).
 *
 * All scopes operate on a small, already-downsampled ImageData buffer so they
 * stay cheap enough to recompute on every grade change.
 */

export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  luma: Uint32Array;
  max: number;
}

export interface ScopeImage {
  width: number;
  height: number;
  /** Row-major intensity, length width*height. */
  data: Float32Array;
  max: number;
}

export interface Parade {
  r: ScopeImage;
  g: ScopeImage;
  b: ScopeImage;
}

export interface VectorScope {
  size: number;
  data: Float32Array;
  max: number;
}

/** A vectorscope graticule target (75% colour bars). */
export interface VectorTarget {
  label: string;
  /** Offset from centre, in normalised Cb/Cr units (-0.5..0.5). */
  u: number;
  v: number;
}

/** Reference skin-tone ("I") line angle in vectorscope degrees. */
export const SKIN_TONE_ANGLE = 123;

export interface SkinToneReading {
  /** Number of pixels that matched the skin-tone gamut. */
  count: number;
  /** Mean hue angle, 0..360 (standard vectorscope orientation). */
  angle: number;
  /** Signed deviation from the reference skin line, -180..180 degrees. */
  deviation: number;
  /** Mean chroma as a fraction of full scale (0..1). */
  chroma: number;
}

/** Normalised Cb (0..1) from 0..1 RGB — BT.601 coefficients. */
function cbOf(r: number, g: number, b: number): number {
  return -0.168736 * r - 0.331264 * g + 0.5 * b + 0.5;
}

/** Normalised Cr (0..1) from 0..1 RGB. */
function crOf(r: number, g: number, b: number): number {
  return 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5;
}

/**
 * Where 75% colour bars land on the graticule, evaluated with the same
 * coefficients as the trace so the boxes are always consistent with the data.
 */
export function colorBarTargets(): VectorTarget[] {
  const l = 0.75;
  const bars: [string, number, number, number][] = [
    ['R', l, 0, 0],
    ['Yl', l, l, 0],
    ['G', 0, l, 0],
    ['Cy', 0, l, l],
    ['B', 0, 0, l],
    ['Mg', l, 0, l],
  ];
  return bars.map(([label, r, g, b]) => ({
    label,
    u: cbOf(r, g, b) - 0.5,
    v: crOf(r, g, b) - 0.5,
  }));
}

export const COLOR_BAR_TARGETS: VectorTarget[] = colorBarTargets();

/**
 * Standard Cb/Cr vectorscope: horizontal = Cb (blue right), vertical = Cr
 * (red up). This is the orientation every other tool uses, and the one the
 * skin-tone line is defined against.
 */
export function computeVectorScope(img: ImageData, size = 256): VectorScope {
  const s = Math.max(2, Math.floor(size));
  const data = new Float32Array(s * s);
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const x = Math.round(cbOf(r, g, b) * (s - 1));
    const y = Math.round((1 - crOf(r, g, b)) * (s - 1));
    if (x >= 0 && x < s && y >= 0 && y < s) {
      data[y * s + x] += 1;
    }
  }

  return { size: s, data, max: maxOf(data) };
}

/**
 * Locate the image's skin tones and report how far they sit from the reference
 * skin line. Uses the classic Chai & Ngan YCbCr skin gamut
 * (77 <= Cb <= 127, 133 <= Cr <= 173) with a luminance gate to reject noise.
 */
export function computeSkinTone(img: ImageData): SkinToneReading | null {
  const px = img.data;
  let sumU = 0;
  let sumV = 0;
  let count = 0;

  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    if (y < 40 || y > 250) continue;

    const cb = cbOf(r / 255, g / 255, b / 255) * 255;
    const cr = crOf(r / 255, g / 255, b / 255) * 255;
    if (cb < 77 || cb > 127 || cr < 133 || cr > 173) continue;

    sumU += (cb - 127.5) / 255;
    sumV += (cr - 127.5) / 255;
    count++;
  }

  if (count < 20) return null;

  const u = sumU / count;
  const v = sumV / count;
  const angle = ((Math.atan2(v, u) * 180) / Math.PI + 360) % 360;
  let deviation = angle - SKIN_TONE_ANGLE;
  if (deviation > 180) deviation -= 360;
  if (deviation < -180) deviation += 360;

  return {
    count,
    angle,
    deviation,
    chroma: Math.min(1, Math.hypot(u, v) / 0.5),
  };
}


const BINS = 256;

function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function computeHistogram(img: ImageData): Histogram {
  const r = new Uint32Array(BINS);
  const g = new Uint32Array(BINS);
  const b = new Uint32Array(BINS);
  const l = new Uint32Array(BINS);
  const px = img.data;

  for (let i = 0; i < px.length; i += 4) {
    const R = px[i], G = px[i + 1], B = px[i + 2];
    r[R]++; g[G]++; b[B]++;
    l[Math.min(BINS - 1, Math.round(luma(R, G, B)))]++;
  }

  let max = 0;
  for (let i = 0; i < BINS; i++) {
    if (r[i] > max) max = r[i];
    if (g[i] > max) max = g[i];
    if (b[i] > max) max = b[i];
    if (l[i] > max) max = l[i];
  }
  return { r, g, b, luma: l, max: max || 1 };
}

/** Standard luma waveform (column = x position, row = luma level). */
export function computeWaveform(img: ImageData, width = 256): ScopeImage {
  const w = Math.max(1, Math.floor(width));
  const height = BINS;
  const data = new Float32Array(w * height);
  const px = img.data;
  const iw = img.width;

  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const x = p % iw;
    const col = Math.min(w - 1, Math.floor((x / iw) * w));
    const y = Math.min(height - 1, Math.round(luma(px[i], px[i + 1], px[i + 2])));
    data[(height - 1 - y) * w + col] += 1;
  }

  return { width: w, height, data, max: maxOf(data) };
}

export function computeParade(img: ImageData, width = 256): Parade {
  const w = Math.max(1, Math.floor(width));
  const r = waveChannel(img, 0, w);
  const g = waveChannel(img, 1, w);
  const b = waveChannel(img, 2, w);
  return { r, g, b };
}

function waveChannel(img: ImageData, channel: number, width: number): ScopeImage {
  const w = Math.max(1, Math.floor(width));
  const height = BINS;
  const data = new Float32Array(w * height);
  const px = img.data;
  const iw = img.width;

  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const x = p % iw;
    const col = Math.min(w - 1, Math.floor((x / iw) * w));
    const y = Math.min(height - 1, px[i + channel]);
    data[(height - 1 - y) * w + col] += 1;
  }

  return { width: w, height, data, max: maxOf(data) };
}

function maxOf(data: Float32Array): number {
  let max = 0;
  for (let i = 0; i < data.length; i++) if (data[i] > max) max = data[i];
  return max || 1;
}

/**
 * Downsample a source image into an ImageData buffer suitable for scopes.
 * Returns null when the source cannot be read (e.g. CORS-tainted canvas).
 */
export function sampleImageData(
  img: HTMLImageElement,
  maxWidth = 480,
): ImageData | null {
  try {
    const scale = Math.min(1, maxWidth / img.naturalWidth);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

/** Downsample a canvas (e.g. the graded preview) into an ImageData buffer. */
export function sampleCanvasData(source: HTMLCanvasElement, maxWidth = 480): ImageData | null {
  try {
    const scale = Math.min(1, maxWidth / source.width);
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}
