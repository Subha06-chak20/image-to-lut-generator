import { describe, expect, it } from 'vitest';
import {
  gammaToLinear,
  linearToGamma,
  linearToRec709,
  linearToSrgb,
  rec709ToLinear,
  srgbToLinear,
} from '../services/color/transfers';
import {
  labToRgb,
  oklabToRgb,
  rgbToLab,
  rgbToOklab,
  xyzToLab,
  labToXyz,
} from '../services/color/conversions';

const SAMPLES = [0, 0.001, 0.02, 0.05, 0.18, 0.25, 0.5, 0.75, 0.9, 1];

describe('transfer functions', () => {
  it('sRGB round-trips', () => {
    for (const v of SAMPLES) {
      expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6);
      expect(srgbToLinear(linearToSrgb(v))).toBeCloseTo(v, 6);
    }
  });

  it('Rec.709 round-trips', () => {
    for (const v of SAMPLES) {
      expect(linearToRec709(rec709ToLinear(v))).toBeCloseTo(v, 6);
    }
  });

  it('gamma 2.4 round-trips', () => {
    for (const v of SAMPLES) {
      expect(linearToGamma(gammaToLinear(v), 2.4)).toBeCloseTo(v, 6);
    }
  });

  it('sRGB and Rec.709 differ in the shadows (proves we are not aliasing them)', () => {
    expect(Math.abs(srgbToLinear(0.05) - rec709ToLinear(0.05))).toBeGreaterThan(1e-3);
  });
});

describe('LAB conversions', () => {
  it('maps white to L*100 and neutral a/b', () => {
    const lab = rgbToLab({ r: 1, g: 1, b: 1 });
    expect(lab.l).toBeCloseTo(100, 2);
    expect(lab.a).toBeCloseTo(0, 2);
    expect(lab.b).toBeCloseTo(0, 2);
  });

  it('maps black to L*0', () => {
    const lab = rgbToLab({ r: 0, g: 0, b: 0 });
    expect(lab.l).toBeCloseTo(0, 3);
  });

  it('mid gray has ~zero chroma', () => {
    const lab = rgbToLab({ r: 0.5, g: 0.5, b: 0.5 });
    expect(Math.abs(lab.a)).toBeLessThan(0.5);
    expect(Math.abs(lab.b)).toBeLessThan(0.5);
  });

  it('RGB -> LAB -> RGB round-trips within tolerance', () => {
    for (const r of SAMPLES) {
      for (const g of SAMPLES) {
        for (const b of SAMPLES) {
          const back = labToRgb(rgbToLab({ r, g, b }));
          expect(back.r).toBeCloseTo(r, 4);
          expect(back.g).toBeCloseTo(g, 4);
          expect(back.b).toBeCloseTo(b, 4);
        }
      }
    }
  });

  it('XYZ <-> LAB round-trips', () => {
    const xyz = { x: 20, y: 40, z: 55 };
    const back = labToXyz(xyzToLab(xyz));
    expect(back.x).toBeCloseTo(xyz.x, 4);
    expect(back.y).toBeCloseTo(xyz.y, 4);
    expect(back.z).toBeCloseTo(xyz.z, 4);
  });
});

describe('Oklab conversions', () => {
  it('round-trips primary colors', () => {
    const colors = [
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.2, g: 0.6, b: 0.9 },
    ];
    for (const c of colors) {
      const back = oklabToRgb(rgbToOklab(c));
      expect(back.r).toBeCloseTo(c.r, 4);
      expect(back.g).toBeCloseTo(c.g, 4);
      expect(back.b).toBeCloseTo(c.b, 4);
    }
  });

  it('white has L ~ 1 and zero chroma', () => {
    const lab = rgbToOklab({ r: 1, g: 1, b: 1 });
    expect(lab.l).toBeCloseTo(1, 3);
    expect(Math.abs(lab.a)).toBeLessThan(1e-3);
    expect(Math.abs(lab.b)).toBeLessThan(1e-3);
  });
});
