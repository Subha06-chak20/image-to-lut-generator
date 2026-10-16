/**
 * Curve evaluation for the primary grading panel.
 *
 * Tonal curves (master + R/G/B) use monotone cubic interpolation
 * (Fritsch–Carlson), which never overshoots — important so a curve cannot
 * introduce ringing or non-monotonic banding in a LUT.
 *
 * Hue/luminance curves use wrapped piecewise-linear interpolation on a hue
 * domain of 0..360.
 *
 * Compiled curves are memoised in a WeakMap keyed by the control-point array.
 * That is safe because the UI replaces arrays immutably; do not mutate a
 * control-point array in place.
 */

import { CurvePoint, CurveSet, HueCurves, RGB } from '../../types';

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function luma601(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function hasCurve(points: CurvePoint[] | undefined): boolean {
  return !!points && points.length >= 2;
}

/* ------------------------------------------------------------------ *
 * Monotone cubic (Fritsch–Carlson)
 * ------------------------------------------------------------------ */

interface CompiledCurve {
  xs: Float64Array;
  ys: Float64Array;
  ms: Float64Array;
}

const curveCache = new WeakMap<CurvePoint[], CompiledCurve>();

function compileCurve(points: CurvePoint[]): CompiledCurve {
  const n = points.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const ms = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = points[i].x;
    ys[i] = points[i].y;
  }

  // Secant slopes.
  const d = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    d[i] = (ys[i + 1] - ys[i]) / Math.max(1e-9, xs[i + 1] - xs[i]);
  }

  // Initial tangents: one-sided at the ends, averaged inside.
  ms[0] = d[0];
  ms[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) ms[i] = (d[i - 1] + d[i]) / 2;

  // Monotonicity filter.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      ms[i] = 0;
      ms[i + 1] = 0;
      continue;
    }
    const a = ms[i] / d[i];
    const b = ms[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      ms[i] = t * a * d[i];
      ms[i + 1] = t * b * d[i];
    }
  }

  return { xs, ys, ms };
}

/**
 * Evaluate a tonal curve. Below the first point / above the last point the
 * curve is flat (endpoint values), which is the conventional behaviour.
 */
export function evalCurve(points: CurvePoint[] | undefined, x: number): number {
  if (!points || points.length < 2) return x;

  let c = curveCache.get(points);
  if (!c) {
    c = compileCurve(points);
    curveCache.set(points, c);
  }
  const { xs, ys, ms } = c;
  const n = xs.length;

  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];

  let i = 0;
  while (i < n - 2 && x > xs[i + 1]) i++;

  const h = xs[i + 1] - xs[i];
  if (h <= 0) return ys[i + 1];

  const t = (x - xs[i]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * ys[i] + h10 * h * ms[i] + h01 * ys[i + 1] + h11 * h * ms[i + 1];
}

/* ------------------------------------------------------------------ *
 * Piecewise-linear + wrapped (hue) evaluation
 * ------------------------------------------------------------------ */

export function evalPiecewiseLinear(points: CurvePoint[] | undefined, x: number): number {
  if (!points || points.length === 0) return x;
  const n = points.length;
  if (n === 1) return points[0].y;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[n - 1].x) return points[n - 1].y;

  let i = 0;
  while (i < n - 2 && x > points[i + 1].x) i++;
  const p0 = points[i];
  const p1 = points[i + 1];
  const h = p1.x - p0.x;
  if (h <= 0) return p1.y;
  return p0.y + (p1.y - p0.y) * ((x - p0.x) / h);
}

/** Linear evaluation on a circular hue domain (period 360). */
export function evalHueCurve(points: CurvePoint[] | undefined, hue: number): number {
  if (!points || points.length === 0) return hue;
  if (points.length === 1) return points[0].y;

  const n = points.length;
  const first = points[0];
  const last = points[n - 1];
  const h = ((hue % 360) + 360) % 360;

  if (h >= first.x && h <= last.x) return evalPiecewiseLinear(points, h);

  // Wrap across the seam.
  if (h < first.x) {
    const span = last.x - (first.x - 360);
    if (span <= 0) return first.y;
    const t = (h + 360 - last.x) / span;
    return last.y + (first.y - last.y) * t;
  }
  const span = last.x + 360 - first.x;
  if (span <= 0) return last.y;
  const t = (h - last.x) / span;
  return last.y + (first.y - last.y) * t;
}

/* ------------------------------------------------------------------ *
 * Application
 * ------------------------------------------------------------------ */

export function isNeutralCurves(curves: CurveSet | undefined): boolean {
  if (!curves) return true;
  return (
    !hasCurve(curves.master) && !hasCurve(curves.r) && !hasCurve(curves.g) && !hasCurve(curves.b)
  );
}

/** Apply master then per-channel tonal curves. */
export function applyCurves(rgb: RGB, curves: CurveSet): RGB {
  let { r, g, b } = rgb;
  if (hasCurve(curves.master)) {
    r = evalCurve(curves.master, r);
    g = evalCurve(curves.master, g);
    b = evalCurve(curves.master, b);
  }
  if (hasCurve(curves.r)) r = evalCurve(curves.r, r);
  if (hasCurve(curves.g)) g = evalCurve(curves.g, g);
  if (hasCurve(curves.b)) b = evalCurve(curves.b, b);
  return { r, g, b };
}

export function isNeutralHueCurves(hc: HueCurves | undefined): boolean {
  if (!hc) return true;
  return !hasCurve(hc.hueVsHue) && !hasCurve(hc.hueVsSat) && !hasCurve(hc.lumVsSat);
}

/* ------------------------------------------------------------------ *
 * HSV helpers (value-preserving, which suits grading better than HSL)
 * ------------------------------------------------------------------ */

export function rgbToHsv(rgb: RGB): { h: number; s: number; v: number } {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max > 1e-9 ? d / max : 0;
  return { h, s, v: max };
}

export function hsvToRgb(h: number, s: number, v: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }

  return { r: r + m, g: g + m, b: b + m };
}

/**
 * Hue vs Hue / Hue vs Sat / Lum vs Sat. Both hue-keyed curves are keyed on the
 * *input* hue, matching Resolve.
 */
export function applyHueCurves(rgb: RGB, hc: HueCurves): RGB {
  const doHueHue = hasCurve(hc.hueVsHue);
  const doHueSat = hasCurve(hc.hueVsSat);
  const doLumSat = hasCurve(hc.lumVsSat);
  if (!doHueHue && !doHueSat && !doLumSat) return rgb;

  const hsv = rgbToHsv(rgb);
  const inputHue = hsv.h;
  let s = hsv.s;

  if (doHueSat) s *= evalHueCurve(hc.hueVsSat, inputHue);
  if (doLumSat) {
    const luma = luma601(rgb.r, rgb.g, rgb.b);
    s *= evalPiecewiseLinear(hc.lumVsSat, luma);
  }
  s = clamp01(s);

  let h = inputHue;
  if (doHueHue) h = inputHue + evalHueCurve(hc.hueVsHue, inputHue);

  return hsvToRgb(h, s, hsv.v);
}
