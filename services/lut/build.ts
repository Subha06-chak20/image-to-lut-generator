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
 *
 * Outputs are deliberately NOT clamped. An affine colour transfer is unbounded,
 * so the lattice corners (which sit far outside any real image's gamut) can
 * evaluate to -4 or +3. Clamping the lattice would:
 *   - make the CPU renderer diverge from the GPU parameter path, which evaluates
 *     the pipeline per pixel and only clamps at the 8-bit output, and
 *   - introduce a kink that stops the trilinear approximation converging as the
 *     lattice is refined.
 * Out-of-range values are legal in `.cube`/`.3dl`/CLF and every consumer clamps
 * at output, exactly as this app's own 8-bit path does — so the lattice stays a
 * faithful sample of the pipeline and the export reproduces the render.
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
