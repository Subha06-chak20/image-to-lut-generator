/**
 * Reference-look analysis (Phase 4).
 *
 * Extracts everything the transfer engines need from a reference image:
 * per-channel mean/std, the LAB covariance, per-channel CDFs (for histogram
 * matching) and per-luminance-region statistics (for 3-way transfer).
 */

import { HistogramData, LAB, RegionStats, Stats } from '../../types';
import { rgbToLab } from '../color/conversions';

const BINS = 256;
const SAMPLE = 160;

/** Neutral baseline used as the "source" side of the transfer. */
export const NEUTRAL_MEAN: LAB = { l: 50, a: 0, b: 0 };
export const NEUTRAL_STD: LAB = { l: 20, a: 10, b: 10 };
/** Row-major LAB covariance of the neutral baseline. */
export const NEUTRAL_COV: number[] = [
  NEUTRAL_STD.l * NEUTRAL_STD.l, 0, 0,
  0, NEUTRAL_STD.a * NEUTRAL_STD.a, 0,
  0, 0, NEUTRAL_STD.b * NEUTRAL_STD.b,
];

export function neutralStats(): Stats {
  return { mean: { ...NEUTRAL_MEAN }, std: { ...NEUTRAL_STD }, cov: NEUTRAL_COV.slice() };
}

interface Accumulator {
  n: number;
  l: number; a: number; b: number;
  ll: number; aa: number; bb: number;
  la: number; lb: number; ab: number;
  minL: number; maxL: number;
  minA: number; maxA: number;
  minB: number; maxB: number;
}

function newAcc(): Accumulator {
  return {
    n: 0, l: 0, a: 0, b: 0,
    ll: 0, aa: 0, bb: 0, la: 0, lb: 0, ab: 0,
    minL: Infinity, maxL: -Infinity,
    minA: Infinity, maxA: -Infinity,
    minB: Infinity, maxB: -Infinity,
  };
}

function add(acc: Accumulator, lab: LAB): void {
  acc.n++;
  acc.l += lab.l; acc.a += lab.a; acc.b += lab.b;
  acc.ll += lab.l * lab.l; acc.aa += lab.a * lab.a; acc.bb += lab.b * lab.b;
  acc.la += lab.l * lab.a; acc.lb += lab.l * lab.b; acc.ab += lab.a * lab.b;
  if (lab.l < acc.minL) acc.minL = lab.l;
  if (lab.l > acc.maxL) acc.maxL = lab.l;
  if (lab.a < acc.minA) acc.minA = lab.a;
  if (lab.a > acc.maxA) acc.maxA = lab.a;
  if (lab.b < acc.minB) acc.minB = lab.b;
  if (lab.b > acc.maxB) acc.maxB = lab.b;
}

function meanStd(acc: Accumulator): { mean: LAB; std: LAB } {
  const n = acc.n || 1;
  const mean: LAB = { l: acc.l / n, a: acc.a / n, b: acc.b / n };
  const std: LAB = {
    l: Math.sqrt(Math.max(0, acc.ll / n - mean.l * mean.l)),
    a: Math.sqrt(Math.max(0, acc.aa / n - mean.a * mean.a)),
    b: Math.sqrt(Math.max(0, acc.bb / n - mean.b * mean.b)),
  };
  return { mean, std };
}

function covFrom(acc: Accumulator): number[] {
  const n = acc.n || 1;
  const ml = acc.l / n, ma = acc.a / n, mb = acc.b / n;
  return [
    acc.ll / n - ml * ml, acc.la / n - ml * ma, acc.lb / n - ml * mb,
    acc.la / n - ml * ma, acc.aa / n - ma * ma, acc.ab / n - ma * mb,
    acc.lb / n - ml * mb, acc.ab / n - ma * mb, acc.bb / n - mb * mb,
  ];
}

function binOf(v: number, min: number, max: number): number {
  const span = max - min || 1;
  return Math.max(0, Math.min(BINS - 1, Math.floor(((v - min) / span) * BINS)));
}

function cdfFrom(counts: Uint32Array): Float32Array {
  const cdf = new Float32Array(BINS);
  let total = 0;
  for (let i = 0; i < BINS; i++) total += counts[i];
  let running = 0;
  for (let i = 0; i < BINS; i++) {
    running += counts[i];
    cdf[i] = total > 0 ? running / total : (i + 1) / BINS;
  }
  return cdf;
}

/** Compute full look statistics from an image element. */
export function computeLookStats(img: HTMLImageElement): Stats {
  const scale = Math.min(1, SAMPLE / img.naturalWidth);
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return neutralStats();
  ctx.drawImage(img, 0, 0, w, h);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return neutralStats();
  }

  const global = newAcc();
  const shadows = newAcc();
  const mids = newAcc();
  const highlights = newAcc();

  const labs: LAB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const lab = rgbToLab({ r: data[i] / 255, g: data[i + 1] / 255, b: data[i + 2] / 255 });
    labs.push(lab);
    add(global, lab);
    if (lab.l < 33) add(shadows, lab);
    else if (lab.l < 66) add(mids, lab);
    else add(highlights, lab);
  }

  const { mean, std } = meanStd(global);
  const cov = covFrom(global);

  // Histograms over observed ranges (padded a little for stability).
  const pad = (min: number, max: number): [number, number] => {
    const d = (max - min) * 0.05 || 1;
    return [min - d, max + d];
  };
  const range = {
    l: pad(global.minL, global.maxL),
    a: pad(global.minA, global.maxA),
    b: pad(global.minB, global.maxB),
  };

  const counts = {
    l: new Uint32Array(BINS),
    a: new Uint32Array(BINS),
    b: new Uint32Array(BINS),
  };
  for (const lab of labs) {
    counts.l[binOf(lab.l, range.l[0], range.l[1])]++;
    counts.a[binOf(lab.a, range.a[0], range.a[1])]++;
    counts.b[binOf(lab.b, range.b[0], range.b[1])]++;
  }

  const histogram: HistogramData = {
    l: cdfFrom(counts.l),
    a: cdfFrom(counts.a),
    b: cdfFrom(counts.b),
    range,
  };

  const regions: RegionStats = {
    shadows: meanStd(shadows.n ? shadows : global),
    mids: meanStd(mids.n ? mids : global),
    highlights: meanStd(highlights.n ? highlights : global),
  };

  return { mean, std, cov, histogram, regions };
}

/** Analyze an image URL / data-URL. */
export function analyzeImage(src: string): Promise<Stats> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(computeLookStats(img));
    img.onerror = () => resolve(neutralStats());
    img.src = src;
  });
}
