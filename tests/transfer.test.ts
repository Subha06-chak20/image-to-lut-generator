import { describe, expect, it } from 'vitest';
import { LAB, Stats } from '../types';
import { labToRgb, rgbToLab } from '../services/color/conversions';
import { applyMatVec, matInvSqrtSym, matMul, matSqrtSym, transpose } from '../services/color/linalg';
import { NEUTRAL_MEAN } from '../services/analysis/stats';
import {
  histogramMatchTransfer,
  mongeKantorovichTransfer,
  reinhardTransfer,
  threeWayTransfer,
} from '../services/grade/transfer';

/* ---------------------------------------------------------------- *
 * Deterministic sampling helpers
 * ---------------------------------------------------------------- */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gauss(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

describe('linalg', () => {
  it('square-roots a diagonal matrix', () => {
    const d = [400, 0, 0, 0, 100, 0, 0, 0, 25];
    const root = matSqrtSym(d);
    expect(root[0]).toBeCloseTo(20, 6);
    expect(root[4]).toBeCloseTo(10, 6);
    expect(root[8]).toBeCloseTo(5, 6);
  });

  it('sqrt * sqrt ~= original for a full symmetric matrix', () => {
    const m = [4, 1, 0.5, 1, 3, -0.5, 0.5, -0.5, 2];
    const root = matSqrtSym(m);
    const back = matMul(root, root);
    for (let i = 0; i < 9; i++) expect(back[i]).toBeCloseTo(m[i], 5);
  });

  it('invSqrt * sqrt ~= identity', () => {
    const m = [4, 1, 0.5, 1, 3, -0.5, 0.5, -0.5, 2];
    const a = matSqrtSym(m);
    const b = matInvSqrtSym(m);
    const id = matMul(a, b);
    expect(id[0]).toBeCloseTo(1, 5);
    expect(id[4]).toBeCloseTo(1, 5);
    expect(id[8]).toBeCloseTo(1, 5);
    expect(id[1]).toBeCloseTo(0, 5);
  });

  it('transpose is an involution', () => {
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    expect(transpose(transpose(m))).toEqual(m);
  });
});

describe('Monge-Kantorovich transfer', () => {
  const target: Stats = {
    mean: { l: 44, a: 6, b: 14 },
    std: { l: 22, a: 11, b: 13 },
    cov: [484, 30, -18, 30, 121, 12, -18, 12, 169],
  };

  it('reduces to Reinhard when the target covariance is diagonal', () => {
    const diagTarget: Stats = {
      mean: target.mean,
      std: target.std,
      cov: [22 * 22, 0, 0, 0, 11 * 11, 0, 0, 0, 13 * 13],
    };
    const c = { r: 0.3, g: 0.5, b: 0.7 };
    const mk = mongeKantorovichTransfer(c, diagTarget);
    const rh = reinhardTransfer(c, diagTarget);
    expect(mk.r).toBeCloseTo(rh.r, 4);
    expect(mk.g).toBeCloseTo(rh.g, 4);
    expect(mk.b).toBeCloseTo(rh.b, 4);
  });

  it('maps the neutral distribution onto the target mean and covariance', () => {
    const rng = makeRng(12345);
    const N = 8000;
    const outLabs: LAB[] = [];
    for (let i = 0; i < N; i++) {
      const lab: LAB = {
        l: NEUTRAL_MEAN.l + 20 * gauss(rng),
        a: NEUTRAL_MEAN.a + 10 * gauss(rng),
        b: NEUTRAL_MEAN.b + 10 * gauss(rng),
      };
      const out = mongeKantorovichTransfer(labToRgb(lab), target);
      outLabs.push(rgbToLab(out));
    }
    const { mean, cov } = statsOf(outLabs);
    expect(mean.l).toBeCloseTo(target.mean.l, 0);
    expect(mean.a).toBeCloseTo(target.mean.a, 0);
    expect(mean.b).toBeCloseTo(target.mean.b, 0);
    // Diagonal variances within ~12%.
    expect(cov[0]).toBeGreaterThan(target.cov![0] * 0.85);
    expect(cov[0]).toBeLessThan(target.cov![0] * 1.15);
    expect(cov[4]).toBeGreaterThan(target.cov![4] * 0.85);
    expect(cov[4]).toBeLessThan(target.cov![4] * 1.15);
  });
});

describe('histogram matching', () => {
  const uniformCdf = (): Float32Array => {
    const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) c[i] = (i + 1) / 256;
    return c;
  };

  const target: Stats = {
    mean: { l: 50, a: 0, b: 0 },
    std: { l: 20, a: 10, b: 10 },
    histogram: {
      l: uniformCdf(),
      a: uniformCdf(),
      b: uniformCdf(),
      range: { l: [10, 90], a: [-40, 40], b: [-40, 40] },
    },
  };

  it('maps the neutral mid value to the target range midpoint', () => {
    // Neutral L = 50 -> percentile 0.5 -> midpoint of [10,90] = ~50.
    const neutralMid = labToRgb({ l: 50, a: 0, b: 0 });
    const out = histogramMatchTransfer(neutralMid, target);
    const lab = rgbToLab(out);
    expect(lab.l).toBeGreaterThan(48);
    expect(lab.l).toBeLessThan(52);
  });

  it('is monotonic along a channel', () => {
    const grays = [0.1, 0.25, 0.4, 0.55, 0.7, 0.9];
    const ls = grays.map((g) => rgbToLab(histogramMatchTransfer({ r: g, g, b: g }, target)).l);
    for (let i = 1; i < ls.length; i++) {
      expect(ls[i]).toBeGreaterThanOrEqual(ls[i - 1] - 1e-6);
    }
  });
});

describe('3-way transfer', () => {
  const target: Stats = {
    mean: { l: 45, a: 3, b: 8 },
    std: { l: 22, a: 10, b: 12 },
    regions: {
      shadows: { mean: { l: 18, a: -2, b: 4 }, std: { l: 8, a: 6, b: 6 } },
      mids: { mean: { l: 48, a: 4, b: 10 }, std: { l: 9, a: 8, b: 9 } },
      highlights: { mean: { l: 82, a: 2, b: 12 }, std: { l: 7, a: 6, b: 8 } },
    },
  };

  it('produces finite output', () => {
    for (const g of [0.05, 0.3, 0.5, 0.8, 0.95]) {
      const out = threeWayTransfer({ r: g, g, b: g }, target);
      expect(Number.isFinite(out.r)).toBe(true);
      expect(Number.isFinite(out.g)).toBe(true);
      expect(Number.isFinite(out.b)).toBe(true);
    }
  });

  it('pushes a dark input toward the shadow region mean', () => {
    const out = rgbToLab(threeWayTransfer({ r: 0.06, g: 0.06, b: 0.06 }, target));
    // Input L is very low; output should be nearer the shadow mean (18) than mid (48).
    expect(out.l).toBeLessThan(33);
  });
});

/* ---------------------------------------------------------------- *
 * Helpers
 * ---------------------------------------------------------------- */

function statsOf(labs: LAB[]): { mean: LAB; cov: number[] } {
  const n = labs.length;
  let l = 0, a = 0, b = 0;
  let ll = 0, aa = 0, bb = 0, la = 0, lb = 0, ab = 0;
  for (const s of labs) {
    l += s.l; a += s.a; b += s.b;
    ll += s.l * s.l; aa += s.a * s.a; bb += s.b * s.b;
    la += s.l * s.a; lb += s.l * s.b; ab += s.a * s.b;
  }
  const ml = l / n, ma = a / n, mb = b / n;
  return {
    mean: { l: ml, a: ma, b: mb },
    cov: [
      ll / n - ml * ml, la / n - ml * ma, lb / n - ml * mb,
      la / n - ml * ma, aa / n - ma * ma, ab / n - ma * mb,
      lb / n - ml * mb, ab / n - ma * mb, bb / n - mb * mb,
    ],
  };
}

// Keep an explicit reference so the imported helper isn't tree-shaken away.
expect(typeof applyMatVec).toBe('function');
