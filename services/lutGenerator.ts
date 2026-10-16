/**
 * Backwards-compatible facade over the modular color / grade / LUT services.
 *
 * The public API (`generateLUT`, `getImageStats`, `applyLUTToImage`) is
 * unchanged, but the internals now use:
 * - `services/color`   for all color-space math
 * - `services/grade`   for the grade pipeline
 * - `services/lut`     for parse / trilinear sample / build / serialize
 */

import { Adjustments, Stats } from '../types';
import { analyzeImage } from './analysis/stats';
import { buildPipeline } from './grade/pipeline';
import { ColorConfig, DEFAULT_COLOR_CONFIG, withAdjustmentWhiteBalance } from './grade/colorConfig';
import { TransferEngineId } from './grade/types';
import { DEFAULT_LUT_SIZE, LUTSize } from './lut/build';
import { buildLUTColorManaged } from './lut/build';
import { loadLUT } from './lut/load';
import { sampleLUT } from './lut/sample';
import { serializeCube3D } from './lut/serialize';
import { ParsedLUT } from './lut/types';

/**
 * Generates a `.cube` LUT string from reference stats + user adjustments,
 * evaluated through the color-managed pipeline.
 */
export async function generateLUT(
  stats: Stats,
  adjustments: Adjustments,
  size: LUTSize | number = DEFAULT_LUT_SIZE,
  colorConfig: ColorConfig = DEFAULT_COLOR_CONFIG,
  engine: TransferEngineId = 'reinhard',
): Promise<string> {
  const pipeline = buildPipeline(stats, adjustments, engine);
  const effectiveConfig = withAdjustmentWhiteBalance(colorConfig, adjustments);
  const lut = buildLUTColorManaged(size, pipeline, effectiveConfig);
  return serializeCube3D(lut);
}

/**
 * Extract full look statistics (mean/std, covariance, CDFs, region stats) from
 * an image source.
 */
export async function getImageStats(src: string): Promise<Stats> {
  return analyzeImage(src);
}

/* ------------------------------------------------------------------ *
 * LUT application (trilinear)
 * ------------------------------------------------------------------ */

/**
 * Apply a LUT to a canvas using trilinear interpolation.
 * Accepts either a raw `.cube` string or an already-parsed LUT.
 */
export function applyLUTToImage(
  canvas: HTMLCanvasElement,
  originalImg: HTMLImageElement,
  lut: string | ParsedLUT | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Happens if this canvas was already bound to a WebGL context.
    console.error('applyLUTToImage: no 2D context available for this canvas.');
    return;
  }
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);

  const parsed = loadLUT(lut);
  if (!parsed) return;

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const out = sampleLUT(parsed, {
      r: pixels[i] / 255,
      g: pixels[i + 1] / 255,
      b: pixels[i + 2] / 255,
    });
    pixels[i] = out.r * 255;
    pixels[i + 1] = out.g * 255;
    pixels[i + 2] = out.b * 255;
  }
  ctx.putImageData(imgData, 0, 0);
}
