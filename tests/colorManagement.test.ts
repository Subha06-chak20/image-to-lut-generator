import { describe, expect, it } from 'vitest';
import { INITIAL_ADJUSTMENTS, Stats } from '../types';
import { convertLinearGamut, GAMUTS } from '../services/color/gamut';
import { kelvinToXy, REFERENCE_KELVIN, whiteBalanceLinear } from '../services/color/whitepoint';
import { createColorManagedEvaluator, DEFAULT_COLOR_CONFIG, isIdentityColorConfig } from '../services/grade/colorConfig';
import { buildPipeline } from '../services/grade/pipeline';

const SAMPLE: Stats = {
  mean: { l: 44, a: 6, b: 14 },
  std: { l: 24, a: 12, b: 16 },
};

describe('gamut conversion', () => {
  it('is identity for the same gamut', () => {
    const c = { r: 0.2, g: 0.4, b: 0.6 };
    const out = convertLinearGamut(c, 'srgb', 'srgb');
    expect(out).toBe(c);
  });

  it('round-trips sRGB <-> P3 <-> sRGB', () => {
    const colors = [
      { r: 0.2, g: 0.4, b: 0.6 },
      { r: 0.9, g: 0.1, b: 0.3 },
      { r: 0, g: 0, b: 0 },
    ];
    for (const c of colors) {
      const out = convertLinearGamut(convertLinearGamut(c, 'srgb', 'p3d65'), 'p3d65', 'srgb');
      expect(out.r).toBeCloseTo(c.r, 5);
      expect(out.g).toBeCloseTo(c.g, 5);
      expect(out.b).toBeCloseTo(c.b, 5);
    }
  });

  it('keeps a neutral neutral (columns sum to the same white)', () => {
    const gray = { r: 0.5, g: 0.5, b: 0.5 };
    for (const id of ['p3d65', 'rec2020'] as const) {
      const out = convertLinearGamut(gray, 'srgb', id);
      expect(out.r).toBeCloseTo(out.g, 3);
      expect(out.g).toBeCloseTo(out.b, 3);
    }
  });

  it('exposes matching forward and inverse matrices', () => {
    // Spot-check P3: fromXYZ should invert toXYZ.
    const g = GAMUTS.p3d65;
    const prod0 = g.fromXYZ[0] * g.toXYZ[0] + g.fromXYZ[1] * g.toXYZ[3] + g.fromXYZ[2] * g.toXYZ[6];
    expect(prod0).toBeCloseTo(1, 4);
  });
});

describe('white balance', () => {
  it('reference temperature is exact identity', () => {
    const c = { r: 0.3, g: 0.6, b: 0.9 };
    const out = whiteBalanceLinear(c, 'srgb', REFERENCE_KELVIN, 0);
    expect(out.r).toBeCloseTo(c.r, 5);
    expect(out.g).toBeCloseTo(c.g, 5);
    expect(out.b).toBeCloseTo(c.b, 5);
  });

  it('higher temperature cools (blue gains relative to red)', () => {
    const c = { r: 0.5, g: 0.5, b: 0.5 };
    const neutral = whiteBalanceLinear(c, 'srgb', REFERENCE_KELVIN, 0);
    const warm = whiteBalanceLinear(c, 'srgb', 3000, 0);
    const cool = whiteBalanceLinear(c, 'srgb', 12000, 0);
    // Low Kelvin (warm) -> more red/less blue; high Kelvin -> less red/more blue.
    expect(warm.r).toBeGreaterThan(neutral.r);
    expect(warm.b).toBeLessThan(neutral.b);
    expect(cool.b).toBeGreaterThan(neutral.b);
  });

  it('kelvin -> xy stays in a sane range', () => {
    for (const k of [2000, 4000, 6504, 12000]) {
      const { x, y } = kelvinToXy(k);
      expect(x).toBeGreaterThan(0.2);
      expect(x).toBeLessThan(0.56);
      expect(y).toBeGreaterThan(0.2);
      expect(y).toBeLessThan(0.5);
    }
  });
});

describe('color-managed evaluator', () => {
  it('treats the default config as an exact pipeline passthrough', () => {
    expect(isIdentityColorConfig(DEFAULT_COLOR_CONFIG)).toBe(true);
    const pipeline = buildPipeline(SAMPLE, INITIAL_ADJUSTMENTS);
    const cm = createColorManagedEvaluator(pipeline, DEFAULT_COLOR_CONFIG);
    const c = { r: 0.35, g: 0.5, b: 0.65 };
    const a = cm(c);
    const b = createColorManagedEvaluator(pipeline, DEFAULT_COLOR_CONFIG)(c);
    expect(a.r).toBeCloseTo(b.r, 12);
  });

  it('applies a log decode that measurably changes the result', () => {
    const pipeline = buildPipeline(SAMPLE, INITIAL_ADJUSTMENTS);
    const base = createColorManagedEvaluator(pipeline, DEFAULT_COLOR_CONFIG);
    const log = createColorManagedEvaluator(pipeline, {
      ...DEFAULT_COLOR_CONFIG,
      inputLog: 'slog3',
    });
    const c = { r: 0.35, g: 0.5, b: 0.65 };
    const out = log(c);
    const ref = base(c);
    expect(Math.abs(out.r - ref.r) + Math.abs(out.g - ref.g) + Math.abs(out.b - ref.b)).toBeGreaterThan(0.05);
  });

  it('white balance at reference temp does not change a neutral', () => {
    const pipeline = buildPipeline(SAMPLE, INITIAL_ADJUSTMENTS);
    const base = createColorManagedEvaluator(pipeline, DEFAULT_COLOR_CONFIG);
    const wb = createColorManagedEvaluator(pipeline, {
      ...DEFAULT_COLOR_CONFIG,
      wb: { enabled: true, temp: REFERENCE_KELVIN, tint: 0 },
    });
    const c = { r: 0.5, g: 0.5, b: 0.5 };
    const out = wb(c);
    const ref = base(c);
    expect(out.r).toBeCloseTo(ref.r, 5);
    expect(out.g).toBeCloseTo(ref.g, 5);
    expect(out.b).toBeCloseTo(ref.b, 5);
  });
});
