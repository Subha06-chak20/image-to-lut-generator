import { describe, expect, it } from 'vitest';
import { buildLUT3D } from '../services/lut/build';
import { parseCube } from '../services/lut/parse';
import { sample3D } from '../services/lut/sample';
import { serializeCube3D } from '../services/lut/serialize';

describe('buildLUT3D', () => {
  it('produces size^3 entries', () => {
    const lut = buildLUT3D(5, (rgb) => rgb);
    expect(lut.data.length).toBe(5 * 5 * 5 * 3);
  });

  it('is red-fastest ordered (first entry is black, last is white)', () => {
    const lut = buildLUT3D(3, (rgb) => rgb);
    const first = [lut.data[0], lut.data[1], lut.data[2]];
    const lastIdx = lut.data.length - 3;
    const last = [lut.data[lastIdx], lut.data[lastIdx + 1], lut.data[lastIdx + 2]];
    expect(first).toEqual([0, 0, 0]);
    expect(last[0]).toBeCloseTo(1, 6);
    expect(last[1]).toBeCloseTo(1, 6);
    expect(last[2]).toBeCloseTo(1, 6);
  });
});

describe('trilinear sampling', () => {
  it('reproduces an identity LUT exactly', () => {
    const lut = buildLUT3D(5, (rgb) => rgb);
    for (const [r, g, b] of [
      [0.3, 0.4, 0.5],
      [0.12, 0.87, 0.44],
      [0, 0, 0],
      [1, 1, 1],
    ]) {
      const out = sample3D(lut, r, g, b);
      expect(out.r).toBeCloseTo(r, 6);
      expect(out.g).toBeCloseTo(g, 6);
      expect(out.b).toBeCloseTo(b, 6);
    }
  });

  it('is more accurate than nearest-neighbour for a curved transform', () => {
    const f = (v: number) => v * v;
    const size = 5;
    const lut = buildLUT3D(size, (rgb) => ({ r: f(rgb.r), g: f(rgb.g), b: f(rgb.b) }));

    const x = 0.3; // sits between lattice nodes 0.25 and 0.5
    const truth = f(x);
    const tri = sample3D(lut, x, x, x).r;

    // Nearest-neighbour reference.
    const nearestIdx = Math.round(x * (size - 1)) / (size - 1);
    const nearest = f(nearestIdx);

    expect(Math.abs(tri - truth)).toBeLessThan(Math.abs(nearest - truth));
    expect(Math.abs(tri - truth)).toBeLessThan(0.02);
  });

  it('clamps out-of-range input', () => {
    const lut = buildLUT3D(3, (rgb) => rgb);
    expect(sample3D(lut, -1, -1, -1).r).toBeCloseTo(0, 6);
    expect(sample3D(lut, 2, 2, 2).r).toBeCloseTo(1, 6);
  });
});

describe('.cube serialize / parse round-trip', () => {
  it('preserves 3D data', () => {
    const lut = buildLUT3D(3, (rgb) => ({
      r: Math.min(1, rgb.r * 1.1),
      g: rgb.g,
      b: 1 - rgb.b,
    }));
    const text = serializeCube3D(lut);
    const parsed = parseCube(text);
    expect(parsed.dimension).toBe(3);
    expect(parsed.size).toBe(3);
    if (parsed.dimension !== 3) throw new Error('unreachable');
    for (let i = 0; i < lut.data.length; i++) {
      expect(parsed.data[i]).toBeCloseTo(lut.data[i], 5);
    }
  });

  it('parses a 1D LUT', () => {
    const text = ['TITLE "one"', 'LUT_1D_SIZE 2', '', '0 0 0', '1 1 1'].join('\n');
    const parsed = parseCube(text);
    expect(parsed.dimension).toBe(1);
    expect(parsed.size).toBe(2);
  });

  it('throws on malformed input', () => {
    expect(() => parseCube('not a lut')).toThrow();
  });
});
