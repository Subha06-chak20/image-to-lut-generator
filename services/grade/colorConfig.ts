/**
 * Color-managed grade evaluation.
 *
 * Wraps a grade pipeline with an input decode, white balance, gamut conversion
 * and an output encode so the whole LUT is produced through a defined color
 * pipeline instead of assuming sRGB end to end.
 */

import { Adjustments, RGB } from '../../types';
import { convertLinearGamut, GamutId } from '../color/gamut';
import { COLOR_SPACES, ColorSpaceId, LOG_CURVES, LogCurveId } from '../color/spaces';
import { REFERENCE_KELVIN, whiteBalanceLinear } from '../color/whitepoint';
import { evaluatePipeline } from './evaluate';
import { GradePipeline } from './types';

export interface WhiteBalanceConfig {
  enabled: boolean;
  /** Kelvin, 2000..12000. */
  temp: number;
  /** -100 (magenta) .. +100 (green). */
  tint: number;
}

export interface ColorConfig {
  /** Camera log curve applied to the input before grading. */
  inputLog: LogCurveId;
  /** Transfer function of the input if no log curve is used. */
  inputSpace: ColorSpaceId;
  /** Primaries of the input material. */
  inputGamut: GamutId;
  /** Transfer function the grade math operates in. */
  workingSpace: ColorSpaceId;
  /** Transfer function used for the output / preview. */
  outputSpace: ColorSpaceId;
  /** Output primaries. */
  gamut: GamutId;
  wb: WhiteBalanceConfig;
  /** Filmic highlight roll-off on output. */
  tonemap: boolean;
}

export const DEFAULT_COLOR_CONFIG: ColorConfig = {
  inputLog: 'none',
  inputSpace: 'srgb',
  inputGamut: 'srgb',
  workingSpace: 'srgb',
  outputSpace: 'srgb',
  gamut: 'srgb',
  wb: { enabled: false, temp: REFERENCE_KELVIN, tint: 0 },
  tonemap: false,
};

/** Slider units → Kelvin offset: ±100 ≈ ±1800 K around the reference. */
export const ADJ_TEMP_TO_KELVIN = 18;

/**
 * Fold the quick Temperature/Tint sliders into the colour config so white
 * balance is applied exactly once, in linear light, through the Bradford model.
 *
 * Previously `applyAdjust` did a naive `r *= 1 + t/400` in the working space,
 * which both duplicated the Kelvin-based WB in this file and was not a real
 * chromatic adaptation. Combining them additively keeps 0 / 6504 K an exact
 * identity and lets both controls coexist.
 */
export function withAdjustmentWhiteBalance(cfg: ColorConfig, adj: Adjustments): ColorConfig {
  const tempOffset = (adj.temperature ?? 0) * ADJ_TEMP_TO_KELVIN;
  const tintOffset = adj.tint ?? 0;
  if (tempOffset === 0 && tintOffset === 0) return cfg;

  const baseTemp = cfg.wb.enabled ? cfg.wb.temp : REFERENCE_KELVIN;
  const baseTint = cfg.wb.enabled ? cfg.wb.tint : 0;

  return {
    ...cfg,
    wb: {
      enabled: true,
      temp: Math.min(12000, Math.max(2000, baseTemp + tempOffset)),
      tint: Math.min(100, Math.max(-100, baseTint + tintOffset)),
    },
  };
}

/** True when the config is a no-op wrapper (used to keep the default path exact). */
export function isIdentityColorConfig(cfg: ColorConfig): boolean {
  return (
    cfg.inputLog === 'none' &&
    cfg.inputSpace === cfg.workingSpace &&
    cfg.workingSpace === cfg.outputSpace &&
    cfg.inputGamut === cfg.gamut &&
    !cfg.wb.enabled &&
    !cfg.tonemap
  );
}

function decodeChannel(v: number, log: LogCurveId, space: ColorSpaceId): number {
  if (log !== 'none') return LOG_CURVES[log].toLinear(v);
  return COLOR_SPACES[space].toLinear(v);
}

function encodeChannel(v: number, space: ColorSpaceId): number {
  return COLOR_SPACES[space].fromLinear(v);
}

function decodeRgb(rgb: RGB, log: LogCurveId, space: ColorSpaceId): RGB {
  return {
    r: decodeChannel(rgb.r, log, space),
    g: decodeChannel(rgb.g, log, space),
    b: decodeChannel(rgb.b, log, space),
  };
}

function encodeRgb(rgb: RGB, space: ColorSpaceId): RGB {
  return {
    r: encodeChannel(rgb.r, space),
    g: encodeChannel(rgb.g, space),
    b: encodeChannel(rgb.b, space),
  };
}

/** ACES filmic approximation (Narkowicz). Operates on linear light. */
function acesFilmic(c: number): number {
  const a = 2.51, b = 0.03, d = 2.43, e = 0.59, f = 0.14;
  const v = (c * (a * c + b)) / (c * (d * c + e) + f);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export type ColorEvaluator = (rgb: RGB) => RGB;

/**
 * Build an evaluator that applies color management around a grade pipeline.
 * Returns the bare pipeline evaluator when the config is identity.
 */
export function createColorManagedEvaluator(
  pipeline: GradePipeline,
  cfg: ColorConfig,
): ColorEvaluator {
  const base: ColorEvaluator = (rgb) => evaluatePipeline(rgb, pipeline);
  if (isIdentityColorConfig(cfg)) return base;

  return (input: RGB): RGB => {
    // 1. Input -> linear light (input gamut).
    let lin = decodeRgb(input, cfg.inputLog, cfg.inputSpace);

    // 2. White balance in linear light.
    if (cfg.wb.enabled) {
      lin = whiteBalanceLinear(lin, cfg.inputGamut, cfg.wb.temp, cfg.wb.tint);
    }

    // 3. Input gamut -> output gamut.
    lin = convertLinearGamut(lin, cfg.inputGamut, cfg.gamut);

    // 4. Encode to the working space and run the grade.
    const work = base(encodeRgb(lin, cfg.workingSpace));

    // 5. Decode back to linear light.
    let outLin = decodeRgb(work, 'none', cfg.workingSpace);

    // 6. Optional filmic roll-off.
    if (cfg.tonemap) {
      outLin = { r: acesFilmic(outLin.r), g: acesFilmic(outLin.g), b: acesFilmic(outLin.b) };
    }

    // 7. Encode to the output space.
    return encodeRgb(outLin, cfg.outputSpace);
  };
}
