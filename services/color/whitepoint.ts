/**
 * White balance via Bradford chromatic adaptation.
 *
 * The reference illuminant is defined as the planckian white at
 * `REFERENCE_KELVIN`, so a temperature of 6504 K produces an exact identity —
 * "no change" is neutral, not approximate.
 */

import { RGB } from '../../types';
import { applyMat3, GAMUTS, GamutId, Mat3 } from './gamut';

const BRADFORD: Mat3 = [
  0.8951, 0.2664, -0.1614,
  -0.7502, 1.7135, 0.0367,
  0.0389, -0.0685, 1.0296,
];

const BRADFORD_INV: Mat3 = [
  0.9869929, -0.1470543, 0.1599627,
  0.4323053, 0.5183603, 0.0492912,
  -0.0085287, 0.0400428, 0.9684867,
];

export const REFERENCE_KELVIN = 6504;

export interface Chromaticity {
  x: number;
  y: number;
}

/**
 * Colour temperature -> CIE 1931 chromaticity (Kim et al. approximation of the
 * planckian locus, valid 1667K..25000K).
 */
export function kelvinToXy(kelvin: number): Chromaticity {
  const t = Math.max(1667, Math.min(25000, kelvin));
  const t2 = t * t;
  const t3 = t2 * t;

  let x: number;
  if (t <= 4000) {
    x = -0.2661239e9 / t3 - 0.2343589e6 / t2 + 0.8776956e3 / t + 0.179910;
  } else {
    x = -3.0258469e9 / t3 + 2.1070379e6 / t2 + 0.2226347e3 / t + 0.240390;
  }

  const x2 = x * x;
  const x3 = x2 * x;
  let y: number;
  if (t <= 2222) {
    y = -1.1063814 * x3 - 1.34811020 * x2 + 2.18555832 * x - 0.20219683;
  } else if (t <= 4000) {
    y = -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867;
  } else {
    y = 3.0817580 * x3 - 5.87338670 * x2 + 3.75112997 * x - 0.37001483;
  }

  return { x, y };
}

/** Chromaticity -> XYZ (Y = 1). */
function xyToXyz({ x, y }: Chromaticity): RGB {
  const safeY = Math.max(1e-6, y);
  return { r: x / safeY, g: 1, b: (1 - x - y) / safeY };
}

/** Bradford adaptation matrix taking XYZ under `from` to XYZ under `to`. */
export function bradfordAdaptation(from: Chromaticity, to: Chromaticity): Mat3 {
  const srcCone = applyMat3(BRADFORD, xyToXyz(from));
  const dstCone = applyMat3(BRADFORD, xyToXyz(to));
  const scale: Mat3 = [
    dstCone.r / srcCone.r, 0, 0,
    0, dstCone.g / srcCone.g, 0,
    0, 0, dstCone.b / srcCone.b,
  ];
  // A = M^-1 * D * M
  const dm: Mat3 = [
    scale[0] * BRADFORD[0], scale[0] * BRADFORD[1], scale[0] * BRADFORD[2],
    scale[4] * BRADFORD[3], scale[4] * BRADFORD[4], scale[4] * BRADFORD[5],
    scale[8] * BRADFORD[6], scale[8] * BRADFORD[7], scale[8] * BRADFORD[8],
  ];
  return [
    BRADFORD_INV[0] * dm[0] + BRADFORD_INV[1] * dm[3] + BRADFORD_INV[2] * dm[6],
    BRADFORD_INV[0] * dm[1] + BRADFORD_INV[1] * dm[4] + BRADFORD_INV[2] * dm[7],
    BRADFORD_INV[0] * dm[2] + BRADFORD_INV[1] * dm[5] + BRADFORD_INV[2] * dm[8],
    BRADFORD_INV[3] * dm[0] + BRADFORD_INV[4] * dm[3] + BRADFORD_INV[5] * dm[6],
    BRADFORD_INV[3] * dm[1] + BRADFORD_INV[4] * dm[4] + BRADFORD_INV[5] * dm[7],
    BRADFORD_INV[3] * dm[2] + BRADFORD_INV[4] * dm[5] + BRADFORD_INV[5] * dm[8],
    BRADFORD_INV[6] * dm[0] + BRADFORD_INV[7] * dm[3] + BRADFORD_INV[8] * dm[6],
    BRADFORD_INV[6] * dm[1] + BRADFORD_INV[7] * dm[4] + BRADFORD_INV[8] * dm[7],
    BRADFORD_INV[6] * dm[2] + BRADFORD_INV[7] * dm[5] + BRADFORD_INV[8] * dm[8],
  ];
}

/**
 * The Bradford adaptation matrix implied by a temperature/tint pair, in the
 * coordinates of the given gamut. Exposed so a GPU backend can upload the
 * adaptation as a matrix instead of recomputing it per pixel.
 */
export function whiteBalanceMatrix(gamut: GamutId, tempK: number, tint = 0): Mat3 {
  const source = kelvinToXy(REFERENCE_KELVIN);
  const target = kelvinToXy(tempK);
  // Tint nudges the target along the green/magenta axis (approximate).
  const tinted: Chromaticity = { x: target.x, y: target.y * (1 + (tint / 100) * 0.12) };
  return bradfordAdaptation(source, tinted);
}

/**
 * Apply a temperature/tint white balance to linear RGB in a given gamut.
 * `tint` runs -100 (magenta) .. +100 (green).
 */
export function whiteBalanceLinear(rgb: RGB, gamut: GamutId, tempK: number, tint = 0): RGB {
  const g = GAMUTS[gamut];
  const a = whiteBalanceMatrix(gamut, tempK, tint);
  const toXyz = applyMat3(g.toXYZ, rgb);
  const adapted = applyMat3(a, toXyz);
  return applyMat3(g.fromXYZ, adapted);
}
