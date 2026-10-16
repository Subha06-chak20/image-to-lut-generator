import { Adjustments, RGB } from '../../types';
import { applyCurves, applyHueCurves } from './curves';
import { applyTonalRange } from './tone';
import { applyWheels } from './wheels';

/**
 * Tone + color fine-tuning operations.
 *
 * This is the original slider math, isolated so it can live inside the grade
 * pipeline, extended with the Phase 7.5 primary controls. The "intensity" mix is
 * NOT applied here — it is expressed as the transfer node's mix factor by the
 * pipeline builder.
 *
 * Order (matching how a colourist works):
 *   exposure → brightness → contrast → tonal range → wheels → curves
 *   → hue/luma curves → saturation/vibrance → hue rotate
 *
 * White balance is deliberately NOT here any more. Temperature/tint are applied
 * once, in linear light, through the Bradford adaptation in
 * `services/color/whitepoint.ts` (see `withAdjustmentWhiteBalance`).
 */
export function applyAdjust(rgb: RGB, adj: Adjustments): RGB {
  let { r, g, b } = rgb;

  // Exposure
  const exp = Math.pow(2, adj.exposure);
  r *= exp; g *= exp; b *= exp;

  // Brightness (Base Offset)
  const bri = adj.brightness / 100;
  r += bri; g += bri; b += bri;

  // Contrast
  const con = (adj.contrast + 100) / 100;
  r = (r - 0.5) * con + 0.5;
  g = (g - 0.5) * con + 0.5;
  b = (b - 0.5) * con + 0.5;

  // Highlights / Shadows / Whites / Blacks — luma-dependent gain in stops.
  ({ r, g, b } = applyTonalRange({ r, g, b }, adj));

  // Primary wheels (in the working space, or log when logWheels is on).
  if (adj.wheels) {
    ({ r, g, b } = applyWheels({ r, g, b }, adj.wheels, !!adj.logWheels));
  }

  // Master + per-channel tonal curves.
  if (adj.curves) {
    ({ r, g, b } = applyCurves({ r, g, b }, adj.curves));
  }

  // Hue vs Hue / Hue vs Sat / Lum vs Sat.
  if (adj.hueCurves) {
    ({ r, g, b } = applyHueCurves({ r, g, b }, adj.hueCurves));
  }

  // Luma calculation for targeted weights
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;

  // Saturation / Vibrance
  const sat = (adj.saturation + 100) / 100;
  const vib = adj.vibrance / 100;
  const satFactor = sat * (1 + vib * (1 - luma));
  r = luma + (r - luma) * satFactor;
  g = luma + (g - luma) * satFactor;
  b = luma + (b - luma) * satFactor;

  // Hue
  if (adj.hue !== 0) {
    const angle = (adj.hue * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rOld = r, gOld = g, bOld = b;
    r = (.299 + .701 * cosA + .168 * sinA) * rOld + (.587 - .587 * cosA + .330 * sinA) * gOld + (.114 - .114 * cosA - .497 * sinA) * bOld;
    g = (.299 - .299 * cosA - .328 * sinA) * rOld + (.587 + .413 * cosA + .035 * sinA) * gOld + (.114 - .114 * cosA + .292 * sinA) * bOld;
    b = (.299 - .3 * cosA + 1.25 * sinA) * rOld + (.587 - .588 * cosA - 1.05 * sinA) * gOld + (.114 + .886 * cosA - .203 * sinA) * bOld;
  }

  return { r, g, b };
}
