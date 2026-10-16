/**
 * RGB gamut (primaries) definitions and linear-light gamut conversion.
 *
 * All gamuts are D65-referenced, so a conversion is a pure 3x3 matrix change in
 * linear light (no chromatic adaptation needed).
 */

import { RGB } from '../../types';

export type GamutId = 'srgb' | 'p3d65' | 'rec2020';

/** Row-major 3x3 matrix. */
export type Mat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface Gamut {
  id: GamutId;
  label: string;
  /** linear RGB -> XYZ */
  toXYZ: Mat3;
  /** XYZ -> linear RGB */
  fromXYZ: Mat3;
}

export const GAMUTS: Record<GamutId, Gamut> = {
  srgb: {
    id: 'srgb',
    label: 'sRGB / Rec.709',
    toXYZ: [
      0.4124564, 0.3575761, 0.1804375,
      0.2126729, 0.7151522, 0.0721750,
      0.0193339, 0.1191920, 0.9503041,
    ],
    fromXYZ: [
      3.2404542, -1.5371385, -0.4985314,
      -0.9692660, 1.8760108, 0.0415560,
      0.0556434, -0.2040259, 1.0572252,
    ],
  },
  p3d65: {
    id: 'p3d65',
    label: 'Display P3 (D65)',
    toXYZ: [
      0.4865709, 0.2656677, 0.1982173,
      0.2289746, 0.6917385, 0.0792869,
      0.0000000, 0.0451134, 1.0439444,
    ],
    fromXYZ: [
      2.4934969, -0.9313836, -0.4027108,
      -0.8294890, 1.7626641, 0.0236247,
      0.0358458, -0.0761724, 0.9568845,
    ],
  },
  rec2020: {
    id: 'rec2020',
    label: 'Rec.2020',
    toXYZ: [
      0.6369580, 0.1446169, 0.1688810,
      0.2627002, 0.6779981, 0.0593017,
      0.0000000, 0.0280727, 1.0609851,
    ],
    fromXYZ: [
      1.7166512, -0.3556708, -0.2533663,
      -0.6666844, 1.6164812, 0.0157685,
      0.0176399, -0.0427706, 0.9421031,
    ],
  },
};

export const GAMUT_IDS: GamutId[] = ['srgb', 'p3d65', 'rec2020'];

/** Multiply a matrix by an RGB triple (values may be out of 0..1). */
export function applyMat3(m: Mat3, v: RGB): RGB {
  return {
    r: m[0] * v.r + m[1] * v.g + m[2] * v.b,
    g: m[3] * v.r + m[4] * v.g + m[5] * v.b,
    b: m[6] * v.r + m[7] * v.g + m[8] * v.b,
  };
}

/** Convert linear-light RGB between two D65 gamuts. */
export function convertLinearGamut(rgb: RGB, from: GamutId, to: GamutId): RGB {
  if (from === to) return rgb;
  return applyMat3(GAMUTS[to].fromXYZ, applyMat3(GAMUTS[from].toXYZ, rgb));
}
