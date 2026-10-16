import { RGB } from '../../types';
import { ColorConfig, createColorManagedEvaluator } from '../grade/colorConfig';
import { evaluatePipeline } from '../grade/evaluate';
import { GradePipeline } from '../grade/types';
import { LUT3D } from './types';

export type ColorEvaluator = (rgb: RGB, r: number, g: number, b: number) => RGB;

/** Supported LUT lattice sizes. 33 is the industry default. */
export const LUT_SIZES = [17, 33, 65] as const;
export type LUTSize = (typeof LUT_SIZES)[number];

export const DEFAULT_LUT_SIZE: LUTSize = 33;

/**
 * Evaluate a color function across an N^3 identity lattice and return a 3D LUT.
 * Red varies fastest, matching the `.cube` convention.
 */
export function buildLUT3D(
  size: number,
  evaluate: ColorEvaluator,
  title = 'S.CHAK STUDIO',
): LUT3D {
  const data = new Float32Array(size * size * size * 3);
  const denom = size - 1;
  let o = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = ri / denom;
        const g = gi / denom;
        const b = bi / denom;
        const out = evaluate({ r, g, b }, ri, gi, bi);
        data[o++] = out.r;
        data[o++] = out.g;
        data[o++] = out.b;
      }
    }
  }
  return {
    dimension: 3,
    size,
    data,
    title,
    domainMin: { r: 0, g: 0, b: 0 },
    domainMax: { r: 1, g: 1, b: 1 },
  };
}

/** Build a LUT by evaluating a grade pipeline over the lattice. */
export function buildLUTFromPipeline(
  size: number,
  pipeline: GradePipeline,
  title = 'S.CHAK STUDIO',
): LUT3D {
  return buildLUT3D(size, (rgb) => evaluatePipeline(rgb, pipeline), title);
}

/** Build a LUT through a color-managed pipeline (log decode, WB, gamut, output). */
export function buildLUTColorManaged(
  size: number,
  pipeline: GradePipeline,
  colorConfig: ColorConfig,
  title = 'S.CHAK STUDIO',
): LUT3D {
  const evaluate = createColorManagedEvaluator(pipeline, colorConfig);
  return buildLUT3D(size, (rgb) => evaluate(rgb), title);
}
