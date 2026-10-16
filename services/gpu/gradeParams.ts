/**
 * Grade parameter extraction for the shader path.
 *
 * The CPU backend bakes a 3D LUT by evaluating the whole grade across a lattice
 * (~36k evaluations at 33³, ~275k at 65³), which is where essentially all of the
 * per-slider latency lives. This module extracts the *same* grade as a small set
 * of scalars, matrices and 1D tables, so the fragment shader can evaluate it per
 * pixel with no lattice bake at all.
 *
 * Nothing here reinterprets the grade. Every value is produced by the same
 * functions the CPU pipeline uses (`applyAdjust`, `applyTransfer`,
 * `whiteBalanceLinear`, `wheelToRgb`, `evalCurve`, ...), so the two backends stay
 * in lockstep by construction rather than by convention. Tables are precomputed
 * only where a per-pixel search would be too slow: the histogram inverse CDF and
 * the curves.
 *
 * The one approximation is the histogram inverse CDF, which is a step function
 * on the CPU and is sampled here. See `inverseCdfTable` for the bound.
 */

import { Adjustments, CurvePoint, GradeOpId, Stats } from '../../types';
import { NEUTRAL_COV, NEUTRAL_MEAN, NEUTRAL_STD } from '../analysis/stats';
import { GAMUTS, Mat3 } from '../color/gamut';
import { M3, matInvSqrtSym, matMul, matSqrtSym } from '../color/linalg';
import { ColorSpaceId, LogCurveId } from '../color/spaces';
import { whiteBalanceMatrix } from '../color/whitepoint';
import { ColorConfig, isIdentityColorConfig, withAdjustmentWhiteBalance } from '../grade/colorConfig';
import {
  evalCurve,
  evalHueCurve,
  evalPiecewiseLinear,
  hasCurve,
  isNeutralHueCurves,
} from '../grade/curves';
import { TONAL_MAX_STOPS } from '../grade/tone';
import { normalizeOpOrder } from '../grade/order';
import { inverseCdfTable } from '../grade/transfer';
import { TransferEngineId } from '../grade/types';
import { wheelToRgb } from '../grade/wheels';

/* ------------------------------------------------------------------ *
 * Table geometry (must match the GLSL sampler mapping)
 * ------------------------------------------------------------------ */

/** Samples per curve row. Linearly filtered, so this only has to beat the eye. */
export const CURVE_SIZE = 1024;

/**
 * Curve texture rows, in order:
 *   0 master · 1 r · 2 g · 3 b   (domain 0..1, identity fill y = x)
 *   4 hueVsHue                    (domain 0..360, identity fill 0)
 *   5 hueVsSat                    (domain 0..360, identity fill 1)
 *   6 lumVsSat                    (domain 0..1,   identity fill 1)
 */
export const CURVE_ROWS = 7;
export const CURVE_ROW_MASTER = 0;
export const CURVE_ROW_R = 1;
export const CURVE_ROW_G = 2;
export const CURVE_ROW_B = 3;
export const CURVE_ROW_HUE_VS_HUE = 4;
export const CURVE_ROW_HUE_VS_SAT = 5;
export const CURVE_ROW_LUM_VS_SAT = 6;

/** Samples per histogram inverse-CDF column (one column per LAB channel). */
export const INVCDF_SIZE = 2048;
export const INVCDF_ROWS = 3;

/* ------------------------------------------------------------------ *
 * Enum encodings — these MUST match the switch arms in the fragment shader.
 * `tests/gpu.test.ts` pins the values so a reorder cannot silently break it.
 * ------------------------------------------------------------------ */

export const LOG_CURVE_INDEX: Record<LogCurveId, number> = {
  none: 0,
  acescct: 1,
  logc3: 2,
  slog3: 3,
  vlog: 4,
  redlog3g10: 5,
};

export const COLOR_SPACE_INDEX: Record<ColorSpaceId, number> = {
  srgb: 0,
  rec709: 1,
  gamma24: 2,
  linear: 3,
};

export const ENGINE_INDEX: Record<TransferEngineId, number> = {
  reinhard: 0,
  mongeKantorovich: 1,
  histogramMatch: 2,
  threeWay: 3,
};

/** MUST match the `op == n` arms of `applyAdjustShader` in the fragment shader. */
export const OP_INDEX: Record<GradeOpId, number> = {
  exposure: 0,
  brightness: 1,
  contrast: 2,
  tonal: 3,
  wheels: 4,
  curves: 5,
  hueCurves: 6,
  saturation: 7,
  hue: 8,
};

export const OP_COUNT = 9;

export const IDENTITY_M3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** `matMul`/`matSqrtSym` take a mutable `M3`; `Mat3` is the readonly gamut form. */
const asM3 = (m: readonly number[]): M3 => m as unknown as M3;

export type Scalar3 = [number, number, number];

/** Everything the fragment shader needs to evaluate a grade. */
export interface GradeParams {
  /* toggles */
  cmEnabled: boolean;
  tonemap: boolean;
  logWheels: boolean;
  wheelsActive: boolean;
  curvesActive: boolean;
  /** Bitfield: 1 master, 2 r, 4 g, 8 b — mirrors `hasCurve` early-outs. */
  curveMask: number;
  hueCurvesActive: boolean;

  /* enum indices */
  inputLog: number;
  inputSpace: number;
  workingSpace: number;
  outputSpace: number;
  engine: number;

  /* scalar controls */
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  hue: number;
  /** highlights, shadows, whites, blacks (slider units, ±100). */
  tonal: [number, number, number, number];
  /** Transfer-node mix: `intensity + 1`, exactly as `buildPipeline` sets it. */
  transferMix: number;

  /* linear-light matrices (row-major 9) */
  linearMat: M3;
  /** Monge-Kantorovich LAB transform + offset (row-major 9 + 3). */
  mkMat: M3;
  mkOffset: Scalar3;

  /* per-channel transfer shortcuts */
  reinhardScale: Scalar3;
  reinhardBias: Scalar3;
  /** 9 values: [shadowL,A,B, midL,A,B, highL,A,B]. */
  regionScale: number[];
  regionBias: number[];

  /* wheel deltas per channel */
  wheelLift: Scalar3;
  wheelGamma: Scalar3;
  wheelGain: Scalar3;
  wheelOffset: Scalar3;

  /* operation order (indices into OP_INDEX, always a full permutation) */
  opOrder: number[];
  opCount: number;

  /* precomputed tables (RGBA float, upload-ready) */
  curves: Float32Array;
  invCdf: Float32Array;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * `rescale(v, srcMean, srcStd, dstMean, dstStd)` regrouped as an affine pair:
 *
 *   (v - srcMean) * ratio + dstMean  ==  v * ratio + (dstMean - srcMean * ratio)
 *
 * so the shader can apply the transfer with one multiply-add per channel.
 */
function rescaleAffine(
  srcMean: number,
  srcStd: number,
  dstMean: number,
  dstStd: number,
): [number, number] {
  const ratio = srcStd > 1e-6 ? dstStd / srcStd : 1;
  return [ratio, dstMean - srcMean * ratio];
}

function toScalar3(v: { l: number; a: number; b: number }): Scalar3 {
  return [v.l, v.a, v.b];
}

/**
 * The transfer engine that will actually run, mirroring the fallbacks inside
 * `applyTransfer`: each engine degrades to Reinhard when its stats are absent.
 */
export function effectiveEngine(engine: TransferEngineId, stats: Stats): TransferEngineId {
  if (engine === 'mongeKantorovich' && !stats.cov) return 'reinhard';
  if (engine === 'histogramMatch' && !stats.histogram) return 'reinhard';
  if (engine === 'threeWay' && !stats.regions) return 'reinhard';
  return engine;
}

/**
 * Combined linear-light matrix taking decoded input RGB to the output gamut:
 *
 *   decode → [Bradford white balance] → [input gamut → output gamut]
 *
 * Composed from the very same matrices the CPU path applies, in the same order,
 * and keeping the CPU's "same gamut means identity" short-circuit.
 */
export function buildLinearMatrix(cfg: ColorConfig): M3 {
  let m: M3 = IDENTITY_M3.slice();

  if (cfg.wb.enabled) {
    const adapt = whiteBalanceMatrix(cfg.inputGamut, cfg.wb.temp, cfg.wb.tint);
    m = matMul(matMul(asM3(GAMUTS[cfg.inputGamut].fromXYZ), asM3(adapt)), asM3(GAMUTS[cfg.inputGamut].toXYZ));
  }

  if (cfg.inputGamut !== cfg.gamut) {
    m = matMul(
      matMul(asM3(GAMUTS[cfg.gamut].fromXYZ), asM3(GAMUTS[cfg.inputGamut].toXYZ)),
      m,
    );
  }

  return m;
}

/** MONGE-KANTOROVICH: `out = M * (lab - NEUTRAL_MEAN) + target.mean`. */
export function buildMongeKantorovich(stats: Stats): { mat: M3; offset: Scalar3 } {
  const neutralCov = asM3(NEUTRAL_COV);
  const cov = stats.cov ? asM3(stats.cov) : neutralCov;
  const sSqrt = matSqrtSym(neutralCov);
  const inner = matSqrtSym(matMul(matMul(sSqrt, cov), sSqrt));
  const sInvSqrt = matInvSqrtSym(neutralCov);
  const mat = matMul(matMul(sInvSqrt, inner), sInvSqrt);

  // Fold the centring into a constant offset so the shader stays a plain affine.
  const neutral = toScalar3(NEUTRAL_MEAN);
  const target = toScalar3(stats.mean);
  const offset: Scalar3 = [
    target[0] - (mat[0] * neutral[0] + mat[1] * neutral[1] + mat[2] * neutral[2]),
    target[1] - (mat[3] * neutral[0] + mat[4] * neutral[1] + mat[5] * neutral[2]),
    target[2] - (mat[6] * neutral[0] + mat[7] * neutral[1] + mat[8] * neutral[2]),
  ];
  return { mat, offset };
}

/* ------------------------------------------------------------------ *
 * Curve + inverse-CDF tables
 * ------------------------------------------------------------------ */

/*
 * Both tables are memoised on the identity of their inputs. That matters: the
 * inverse CDF costs ~1.5M steps (2048 samples x a 256-bin scan x 3 channels) and
 * the histogram only changes with the reference image, so rebuilding it on every
 * slider move would reintroduce a large part of the cost the parameter path
 * exists to remove. The UI replaces control-point objects immutably, so object
 * identity is a correct cache key.
 */

let curveCacheCurves: unknown = undefined;
let curveCacheHue: unknown = undefined;
let curveCacheValue: Float32Array | null = null;

function curveTable(adj: Adjustments): Float32Array {
  if (
    curveCacheValue &&
    curveCacheCurves === adj.curves &&
    curveCacheHue === adj.hueCurves
  ) {
    return curveCacheValue;
  }

  const data = new Float32Array(CURVE_SIZE * CURVE_ROWS * 4);
  const curves = adj.curves;
  const hueCurves = adj.hueCurves;
  const denom = CURVE_SIZE - 1;

  const put = (row: number, i: number, value: number) => {
    data[(row * CURVE_SIZE + i) * 4] = value;
    data[(row * CURVE_SIZE + i) * 4 + 1] = value;
    data[(row * CURVE_SIZE + i) * 4 + 2] = value;
    data[(row * CURVE_SIZE + i) * 4 + 3] = 1;
  };

  for (let i = 0; i < CURVE_SIZE; i++) {
    const x = i / denom;

    // Tonal curves: identity fill so absent curves are an exact no-op. The
    // shader still masks them out, because the identity fill would clamp an
    // out-of-range value that the CPU passes through untouched.
    const rows: [number, CurvePoint[] | undefined][] = [
      [CURVE_ROW_MASTER, curves?.master],
      [CURVE_ROW_R, curves?.r],
      [CURVE_ROW_G, curves?.g],
      [CURVE_ROW_B, curves?.b],
    ];
    for (const [row, points] of rows) {
      put(row, i, hasCurve(points) ? evalCurve(points, x) : x);
    }

    // Hue keyed curves: x runs 0..360 over the row.
    const hue = x * 360;
    put(
      CURVE_ROW_HUE_VS_HUE,
      i,
      hasCurve(hueCurves?.hueVsHue) ? evalHueCurve(hueCurves?.hueVsHue, hue) : 0,
    );
    put(
      CURVE_ROW_HUE_VS_SAT,
      i,
      hasCurve(hueCurves?.hueVsSat) ? evalHueCurve(hueCurves?.hueVsSat, hue) : 1,
    );
    put(
      CURVE_ROW_LUM_VS_SAT,
      i,
      hasCurve(hueCurves?.lumVsSat) ? evalPiecewiseLinear(hueCurves?.lumVsSat, x) : 1,
    );
  }

  curveCacheCurves = adj.curves;
  curveCacheHue = adj.hueCurves;
  curveCacheValue = data;
  return data;
}

const invCdfCache = new WeakMap<Stats, Float32Array>();

function inverseCdfTexture(stats: Stats): Float32Array {
  const cached = invCdfCache.get(stats);
  if (cached) return cached;

  const data = new Float32Array(INVCDF_SIZE * INVCDF_ROWS * 4);
  const hist = stats.histogram;
  const channels: Array<'l' | 'a' | 'b'> = ['l', 'a', 'b'];

  for (let row = 0; row < INVCDF_ROWS; row++) {
    const table = hist
      ? inverseCdfTable(hist, channels[row], INVCDF_SIZE)
      : // No histogram: identity fill keeps the sample harmless.
        Float32Array.from({ length: INVCDF_SIZE }, (_, i) => i / (INVCDF_SIZE - 1));
    for (let i = 0; i < INVCDF_SIZE; i++) {
      const o = (row * INVCDF_SIZE + i) * 4;
      const v = table[i];
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 1;
    }
  }

  invCdfCache.set(stats, data);
  return data;
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/**
 * Extract every shader uniform for a grade. Cheap enough to call on each slider
 * move: the only loops are the curve and inverse-CDF tables (7k and 6k samples).
 */
export function buildGradeParams(
  stats: Stats,
  adjustments: Adjustments,
  colorConfig: ColorConfig,
  engine: TransferEngineId,
): GradeParams {
  const engineId = effectiveEngine(engine, stats);
  // Same fold-in that `generateLUT` performs, so temperature/tint sliders reach
  // the GPU through exactly the same Bradford adaptation as the CPU path.
  const cfg = withAdjustmentWhiteBalance(colorConfig, adjustments);
  const cmEnabled = !isIdentityColorConfig(cfg);

  // Reinhard as an affine pair per channel: out = v * scale + bias, which is
  // exactly `(v - NEUTRAL_STD) * ratio + target.mean` regrouped.
  const neutralStd = toScalar3(NEUTRAL_STD);
  const neutralMean = toScalar3(NEUTRAL_MEAN);
  const targetMean = toScalar3(stats.mean);
  const targetStd = toScalar3(stats.std);
  const scale: number[] = [];
  const bias: number[] = [];
  for (let c = 0; c < 3; c++) {
    const [s, b] = rescaleAffine(neutralMean[c], neutralStd[c], targetMean[c], targetStd[c]);
    scale.push(s);
    bias.push(b);
  }
  const reinhardScale = scale as Scalar3;
  const reinhardBias = bias as Scalar3;

  const regionScale: number[] = [];
  const regionBias: number[] = [];
  for (const region of [stats.regions?.shadows, stats.regions?.mids, stats.regions?.highlights]) {
    const means = region ? toScalar3(region.mean) : toScalar3(stats.mean);
    const stds = region ? toScalar3(region.std) : toScalar3(NEUTRAL_STD);
    for (let c = 0; c < 3; c++) {
      const [scale, bias] = rescaleAffine(neutralMean[c], neutralStd[c], means[c], stds[c]);
      regionScale.push(scale);
      regionBias.push(bias);
    }
  }

  const wheels = adjustments.wheels;
  const lift = wheelToRgb(wheels?.lift ?? { x: 0, y: 0, master: 0 });
  const gamma = wheelToRgb(wheels?.gamma ?? { x: 0, y: 0, master: 0 });
  const gain = wheelToRgb(wheels?.gain ?? { x: 0, y: 0, master: 0 });
  const offset = wheelToRgb(wheels?.offset ?? { x: 0, y: 0, master: 0 });

  const mk = buildMongeKantorovich(stats);

  return {
    cmEnabled,
    tonemap: cfg.tonemap,
    logWheels: !!adjustments.logWheels,
    wheelsActive: !!wheels,
    curvesActive: !!adjustments.curves,
    curveMask:
      (hasCurve(adjustments.curves?.master) ? 1 : 0) |
      (hasCurve(adjustments.curves?.r) ? 2 : 0) |
      (hasCurve(adjustments.curves?.g) ? 4 : 0) |
      (hasCurve(adjustments.curves?.b) ? 8 : 0),
    hueCurvesActive: !!adjustments.hueCurves && !isNeutralHueCurves(adjustments.hueCurves),

    inputLog: LOG_CURVE_INDEX[cfg.inputLog],
    inputSpace: COLOR_SPACE_INDEX[cfg.inputSpace],
    workingSpace: COLOR_SPACE_INDEX[cfg.workingSpace],
    outputSpace: COLOR_SPACE_INDEX[cfg.outputSpace],
    engine: ENGINE_INDEX[engineId],

    exposure: adjustments.exposure,
    brightness: adjustments.brightness,
    contrast: adjustments.contrast,
    saturation: adjustments.saturation,
    vibrance: adjustments.vibrance,
    hue: adjustments.hue,
    tonal: [
      adjustments.highlights,
      adjustments.shadows,
      adjustments.whites,
      adjustments.blacks,
    ],
    transferMix: adjustments.intensity + 1,

    linearMat: cmEnabled ? buildLinearMatrix(cfg) : IDENTITY_M3.slice(),
    mkMat: mk.mat,
    mkOffset: mk.offset,

    reinhardScale,
    reinhardBias,
    regionScale,
    regionBias,

    wheelLift: [lift.r, lift.g, lift.b],
    wheelGamma: [gamma.r, gamma.g, gamma.b],
    wheelGain: [gain.r, gain.g, gain.b],
    wheelOffset: [offset.r, offset.g, offset.b],

    opOrder: normalizeOpOrder(adjustments.opOrder).map((id) => OP_INDEX[id]),
    opCount: OP_COUNT,

    curves: curveTable(adjustments),
    invCdf: inverseCdfTexture(stats),
  };
}

/** Exposed so the shader and the CPU evaluator can be diffed in tests. */
export const TONAL_MAX_STOPS_UNIFORM = TONAL_MAX_STOPS;
