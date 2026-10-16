/**
 * Transfer functions (a.k.a. "gamma" / OETF-EOTF pairs).
 *
 * All functions are pure and operate on normalized 0..1 code values unless
 * noted otherwise. They are the single source of truth for the encode/decode
 * step used across the color pipeline.
 */

/** sRGB electro-optical transfer function (encoded -> linear). */
export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** sRGB opto-electronic transfer function (linear -> encoded). */
export function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/** ITU-R BT.709 / Rec.709 OETF (encoded -> linear). */
export function rec709ToLinear(v: number): number {
  return v < 0.081 ? v / 4.5 : Math.pow((v + 0.099) / 1.099, 1 / 0.45);
}

/** ITU-R BT.709 / Rec.709 inverse OETF (linear -> encoded). */
export function linearToRec709(v: number): number {
  return v < 0.018 ? 4.5 * v : 1.099 * Math.pow(v, 0.45) - 0.099;
}

/** Pure power-law decode (encoded -> linear) for an arbitrary gamma. */
export function gammaToLinear(v: number, gamma = 2.4): number {
  return Math.pow(Math.max(0, v), gamma);
}

/** Pure power-law encode (linear -> encoded) for an arbitrary gamma. */
export function linearToGamma(v: number, gamma = 2.4): number {
  return Math.pow(Math.max(0, v), 1 / gamma);
}
