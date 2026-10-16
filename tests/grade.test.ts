import { describe, expect, it } from 'vitest';
import { INITIAL_ADJUSTMENTS, Stats } from '../types';
import { applyAdjust } from '../services/grade/adjust';
import { evaluatePipeline } from '../services/grade/evaluate';
import { buildPipeline } from '../services/grade/pipeline';
import { reinhardTransfer } from '../services/grade/transfer';

const NEUTRAL: Stats = {
  mean: { l: 50, a: 0, b: 0 },
  std: { l: 20, a: 10, b: 10 },
};

const SAMPLE: Stats = {
  mean: { l: 44, a: 6, b: 14 },
  std: { l: 24, a: 12, b: 16 },
};

describe('applyAdjust', () => {
  it('is identity when all sliders are zero', () => {
    const colors = [
      { r: 0.1, g: 0.2, b: 0.3 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0.9, g: 0.4, b: 0.7 },
    ];
    for (const c of colors) {
      const out = applyAdjust(c, INITIAL_ADJUSTMENTS);
      expect(out.r).toBeCloseTo(c.r, 8);
      expect(out.g).toBeCloseTo(c.g, 8);
      expect(out.b).toBeCloseTo(c.b, 8);
    }
  });

  it('exposure doubles linear light at +1 stop', () => {
    const out = applyAdjust({ r: 0.25, g: 0.25, b: 0.25 }, { ...INITIAL_ADJUSTMENTS, exposure: 1 });
    expect(out.r).toBeCloseTo(0.5, 6);
  });
});

describe('reinhard transfer', () => {
  it('is a no-op against neutral stats', () => {
    const out = reinhardTransfer({ r: 0.4, g: 0.5, b: 0.6 }, NEUTRAL);
    expect(out.r).toBeCloseTo(0.4, 4);
    expect(out.g).toBeCloseTo(0.5, 4);
    expect(out.b).toBeCloseTo(0.6, 4);
  });

  it('shifts the mean toward the reference look', () => {
    const out = reinhardTransfer({ r: 0.5, g: 0.5, b: 0.5 }, SAMPLE);
    // Reference has warm b* and higher saturation, so the result should differ.
    expect(Math.abs(out.r - 0.5) + Math.abs(out.g - 0.5) + Math.abs(out.b - 0.5)).toBeGreaterThan(0.01);
  });
});

describe('grade pipeline', () => {
  it('intensity -1 collapses the whole grade back to identity', () => {
    const pipeline = buildPipeline(SAMPLE, { ...INITIAL_ADJUSTMENTS, intensity: -1 });
    const colors = [
      { r: 0.2, g: 0.3, b: 0.4 },
      { r: 0.8, g: 0.1, b: 0.6 },
    ];
    for (const c of colors) {
      const out = evaluatePipeline(c, pipeline);
      expect(out.r).toBeCloseTo(c.r, 6);
      expect(out.g).toBeCloseTo(c.g, 6);
      expect(out.b).toBeCloseTo(c.b, 6);
    }
  });

  it('with zero adjustments at intensity 0 equals the bare transfer', () => {
    const pipeline = buildPipeline(SAMPLE, INITIAL_ADJUSTMENTS);
    const c = { r: 0.45, g: 0.5, b: 0.55 };
    const viaPipeline = evaluatePipeline(c, pipeline);
    const viaTransfer = reinhardTransfer(c, SAMPLE);
    expect(viaPipeline.r).toBeCloseTo(viaTransfer.r, 6);
    expect(viaPipeline.g).toBeCloseTo(viaTransfer.g, 6);
    expect(viaPipeline.b).toBeCloseTo(viaTransfer.b, 6);
  });
});
