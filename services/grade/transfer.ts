/**
 * Color-transfer engines (Phase 4).
 *
 * All engines map a neutral identity color into the reference look. They differ
 * in how much structure they reproduce:
 * - `reinhard`          per-channel mean/std (fast, classic)
 * - `mongeKantorovich`  full LAB covariance (linear, rotation-aware)
 * - `histogramMatch`    per-channel CDF matching (non-linear tone distribution)
 * - `threeWay`          separate shadow/mid/highlight mapping
 */

import { LAB, RGB, Stats } from '../../types';
import { labToRgb, rgbToLab } from '../color/conversions';
import { applyMatVec, matInvSqrtSym, matMul, matSqrtSym } from '../color/linalg';
import { NEUTRAL_COV, NEUTRAL_MEAN, NEUTRAL_STD } from '../analysis/stats';
import { TransferEngineId } from './types';

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function rescale(v: number, srcMean: number, srcStd: number, dstMean: number, dstStd: number): number {
  const ratio = srcStd > 1e-6 ? dstStd / srcStd : 1;
  return (v - srcMean) * ratio + dstMean;
}

function rescaleLab(lab: LAB, mean: LAB, std: LAB): LAB {
  return {
    l: rescale(lab.l, NEUTRAL_MEAN.l, NEUTRAL_STD.l, mean.l, std.l),
    a: rescale(lab.a, NEUTRAL_MEAN.a, NEUTRAL_STD.a, mean.a, std.a),
    b: rescale(lab.b, NEUTRAL_MEAN.b, NEUTRAL_STD.b, mean.b, std.b),
  };
}

/* ------------------------------------------------------------------ *
 * Reinhard (per-channel mean/std)
 * ------------------------------------------------------------------ */

export function reinhardTransfer(rgb: RGB, target: Stats): RGB {
  return labToRgb(rescaleLab(rgbToLab(rgb), target.mean, target.std));
}

/* ------------------------------------------------------------------ *
 * Monge-Kantorovich linear transfer
 * ------------------------------------------------------------------ */

export function mongeKantorovichTransfer(rgb: RGB, target: Stats): RGB {
  if (!target.cov) return reinhardTransfer(rgb, target);

  // T = S^(-1/2) * (S^(1/2) * Tcov * S^(1/2))^(1/2) * S^(-1/2)
  const sSqrt = matSqrtSym(NEUTRAL_COV);
  const inner = matSqrtSym(matMul(matMul(sSqrt, target.cov), sSqrt));
  const sInvSqrt = matInvSqrtSym(NEUTRAL_COV);
  const m = matMul(matMul(sInvSqrt, inner), sInvSqrt);

  const lab = rgbToLab(rgb);
  const centered: [number, number, number] = [
    lab.l - NEUTRAL_MEAN.l,
    lab.a - NEUTRAL_MEAN.a,
    lab.b - NEUTRAL_MEAN.b,
  ];
  const out = applyMatVec(m, centered);
  return labToRgb({
    l: out[0] + target.mean.l,
    a: out[1] + target.mean.a,
    b: out[2] + target.mean.b,
  });
}

/* ------------------------------------------------------------------ *
 * Histogram matching (per-channel CDF)
 * ------------------------------------------------------------------ */

const SQRT2 = Math.SQRT2;

/** Abramowitz & Stegun 7.1.26 error-function approximation. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

function gaussianCdf(x: number, mu: number, sigma: number): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * SQRT2)));
}

type Channel = 'l' | 'a' | 'b';

function inverseCdf(cdf: Float32Array, range: [number, number], p: number): number {
  const [min, max] = range;
  for (let i = 0; i < cdf.length; i++) {
    if (cdf[i] >= p) {
      return min + ((i + 0.5) / cdf.length) * (max - min);
    }
  }
  return max;
}

export function histogramMatchTransfer(rgb: RGB, target: Stats): RGB {
  const hist = target.histogram;
  if (!hist) return reinhardTransfer(rgb, target);

  const lab = rgbToLab(rgb);
  const match = (v: number, ch: Channel): number => {
    const p = Math.min(1, Math.max(0, gaussianCdf(v, NEUTRAL_MEAN[ch], NEUTRAL_STD[ch])));
    return inverseCdf(hist[ch], hist.range[ch], p);
  };

  return labToRgb({ l: match(lab.l, 'l'), a: match(lab.a, 'a'), b: match(lab.b, 'b') });
}

/* ------------------------------------------------------------------ *
 * 3-way (shadow / mid / highlight) transfer
 * ------------------------------------------------------------------ */

function gaussianWeight(t: number, center: number, width: number): number {
  const d = (t - center) / width;
  return Math.exp(-0.5 * d * d);
}

export function threeWayTransfer(rgb: RGB, target: Stats): RGB {
  const regions = target.regions;
  if (!regions) return reinhardTransfer(rgb, target);

  const lab = rgbToLab(rgb);
  const t = Math.min(1, Math.max(0, lab.l / 100));

  const ws = gaussianWeight(t, 0.15, 0.2);
  const wm = gaussianWeight(t, 0.5, 0.2);
  const wh = gaussianWeight(t, 0.85, 0.2);
  const sum = ws + wm + wh || 1;

  const shadowOut = rescaleLab(lab, regions.shadows.mean, regions.shadows.std);
  const midOut = rescaleLab(lab, regions.mids.mean, regions.mids.std);
  const highOut = rescaleLab(lab, regions.highlights.mean, regions.highlights.std);

  const mix = (a: number, b: number, c: number) => (a * ws + b * wm + c * wh) / sum;

  return labToRgb({
    l: mix(shadowOut.l, midOut.l, highOut.l),
    a: mix(shadowOut.a, midOut.a, highOut.a),
    b: mix(shadowOut.b, midOut.b, highOut.b),
  });
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

export function applyTransfer(rgb: RGB, engine: TransferEngineId, target: Stats): RGB {
  switch (engine) {
    case 'mongeKantorovich':
      return mongeKantorovichTransfer(rgb, target);
    case 'histogramMatch':
      return histogramMatchTransfer(rgb, target);
    case 'threeWay':
      return threeWayTransfer(rgb, target);
    case 'reinhard':
    default:
      return reinhardTransfer(rgb, target);
  }
}
