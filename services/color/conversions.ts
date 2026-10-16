/**
 * Color space conversions.
 *
 * Everything here is pure math on normalized values. RGB is treated as
 * sRGB-encoded (display referred) unless a transfer function is applied by the
 * caller. LAB uses the D65 white point to match the original implementation.
 */

import { RGB, LAB } from '../../types';
import { srgbToLinear, linearToSrgb } from './transfers';

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

/** D65 reference white (CIE 1931, 2° observer), scaled 0..100. */
export const D65 = { x: 95.047, y: 100.0, z: 108.883 };

/* ------------------------------------------------------------------ *
 * sRGB (linear) <-> XYZ
 * ------------------------------------------------------------------ */

export function rgbToXyz(rgb: RGB): XYZ {
  const r = srgbToLinear(rgb.r) * 100;
  const g = srgbToLinear(rgb.g) * 100;
  const b = srgbToLinear(rgb.b) * 100;
  // Lindbloom sRGB (D65) matrix — columns sum to the D65 white point, so
  // LAB is exactly neutral for neutral RGB and RGB<->XYZ round-trips.
  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    z: r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  };
}

export function xyzToRgb(xyz: XYZ): RGB {
  const rX = xyz.x / 100;
  const rY = xyz.y / 100;
  const rZ = xyz.z / 100;
  const r = rX * 3.2404542 + rY * -1.5371385 + rZ * -0.4985314;
  const g = rX * -0.9692660 + rY * 1.8760108 + rZ * 0.0415560;
  const b = rX * 0.0556434 + rY * -0.2040259 + rZ * 1.0572252;
  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}

/* ------------------------------------------------------------------ *
 * XYZ <-> CIE L*a*b*
 * ------------------------------------------------------------------ */

export function xyzToLab(xyz: XYZ): LAB {
  const fx = f(xyz.x / D65.x);
  const fy = f(xyz.y / D65.y);
  const fz = f(xyz.z / D65.z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz(lab: LAB): XYZ {
  const y = (lab.l + 16) / 116;
  const x = lab.a / 500 + y;
  const z = y - lab.b / 200;
  return {
    x: finv(x) * D65.x,
    y: finv(y) * D65.y,
    z: finv(z) * D65.z,
  };
}

function f(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

function finv(t: number): number {
  const t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
}

/* ------------------------------------------------------------------ *
 * Convenience round-trips
 * ------------------------------------------------------------------ */

export function rgbToLab(rgb: RGB): LAB {
  return xyzToLab(rgbToXyz(rgb));
}

export function labToRgb(lab: LAB): RGB {
  return xyzToRgb(labToXyz(lab));
}

/* ------------------------------------------------------------------ *
 * Oklab (perceptually uniform, better for hue/vibrance work)
 * ------------------------------------------------------------------ */

export function rgbToOklab(rgb: RGB): Oklab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

export function oklabToRgb(lab: Oklab): RGB {
  const l_ = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.l - 0.0894841775 * lab.a - 1.2914855480 * lab.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return { r: linearToSrgb(r), g: linearToSrgb(g), b: linearToSrgb(b) };
}
