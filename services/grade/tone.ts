/**
 * Tonal range controls (Highlights / Shadows / Whites / Blacks).
 *
 * These used to be *additive RGB offsets* weighted by luma, which shifts
 * exposure inside a range instead of compressing/expanding tone — that is why
 * the sliders could look crunched and could not recover a clipped sky.
 *
 * They are now a **luma-dependent gain expressed in stops**, applied equally to
 * R/G/B so the operation changes tone without shifting hue or saturation:
 *
 *   gain = 2 ^ (weightedStops)
 *
 * Zones are weighted with smooth falloffs (shadows ≈ 0..0.25, highlights ≈
 * 0.75..1) so the four controls stay independent and the transfer stays
 * monotonic. All-zero input is an exact identity.
 */

import { RGB } from '../../types';
import { clamp01, luma601 } from './curves';

export interface TonalRange {
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
}

/** Full-scale deflection at ±100 is ±1.6 stops. */
export const TONAL_MAX_STOPS = 1.6;

function square(v: number): number {
  return v * v;
}

export function applyTonalRange(rgb: RGB, t: TonalRange): RGB {
  if (t.highlights === 0 && t.shadows === 0 && t.whites === 0 && t.blacks === 0) return rgb;

  const l = clamp01(luma601(rgb.r, rgb.g, rgb.b));

  const wShadows = square(1 - l);
  const wHighlights = square(l);
  const wBlacks = square(clamp01((0.25 - l) / 0.25));
  const wWhites = square(clamp01((l - 0.75) / 0.25));

  const stops =
    ((t.shadows * wShadows +
      t.highlights * wHighlights +
      t.blacks * wBlacks +
      t.whites * wWhites) /
      100) *
    TONAL_MAX_STOPS;

  const gain = Math.pow(2, stops);
  return { r: rgb.r * gain, g: rgb.g * gain, b: rgb.b * gain };
}
