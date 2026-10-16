import { describe, expect, it } from 'vitest';
import {
  computeHistogram,
  computeParade,
  computeVectorScope,
  computeWaveform,
} from '../services/scopes/compute';

/** Build a minimal ImageData-like object for the pure scope functions. */
function fakeImage(pixels: number[][], width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => {
    data[i * 4] = p[0];
    data[i * 4 + 1] = p[1];
    data[i * 4 + 2] = p[2];
    data[i * 4 + 3] = 255;
  });
  return { data, width, height, colorSpace: 'srgb' } as unknown as ImageData;
}

describe('computeHistogram', () => {
  it('bins each channel and finds the max', () => {
    const img = fakeImage([[10, 20, 30]], 1, 1);
    const h = computeHistogram(img);
    expect(h.r[10]).toBe(1);
    expect(h.g[20]).toBe(1);
    expect(h.b[30]).toBe(1);
    expect(h.max).toBe(1);
  });

  it('counts repeated values', () => {
    const img = fakeImage([[100, 100, 100], [100, 50, 50]], 2, 1);
    const h = computeHistogram(img);
    expect(h.r[100]).toBe(2);
    expect(h.g[100]).toBe(1);
    expect(h.g[50]).toBe(1);
  });
});

describe('computeWaveform', () => {
  it('places white pixels at the top row', () => {
    const img = fakeImage([[255, 255, 255], [255, 255, 255]], 2, 1);
    const wf = computeWaveform(img, 2);
    // row 0 is the brightest level
    expect(wf.data[0 * 2 + 0]).toBeGreaterThan(0);
    expect(wf.data[0 * 2 + 1]).toBeGreaterThan(0);
  });

  it('places black pixels at the bottom row', () => {
    const img = fakeImage([[0, 0, 0], [0, 0, 0]], 2, 1);
    const wf = computeWaveform(img, 2);
    const bottomRow = wf.height - 1;
    expect(wf.data[bottomRow * 2 + 0]).toBeGreaterThan(0);
  });
});

describe('computeParade', () => {
  it('isolates a pure red frame into the red strip', () => {
    const img = fakeImage([[255, 0, 0], [255, 0, 0]], 2, 1);
    const parade = computeParade(img, 2);
    expect(parade.r.data[0 * 2 + 0]).toBeGreaterThan(0); // red at top
    expect(parade.g.data[0 * 2 + 0]).toBe(0);
    expect(parade.b.data[0 * 2 + 0]).toBe(0);
  });
});

describe('computeVectorScope', () => {
  it('plots neutral gray at the centre', () => {
    const img = fakeImage([[128, 128, 128]], 1, 1);
    const vec = computeVectorScope(img, 256);
    expect(vec.data[128 * 256 + 128]).toBeGreaterThan(0);
    expect(vec.max).toBeGreaterThan(0);
  });

  it('separates a warm color from neutral', () => {
    const warm = computeVectorScope(fakeImage([[255, 128, 0]], 1, 1), 256);
    const neutral = computeVectorScope(fakeImage([[128, 128, 128]], 1, 1), 256);
    const warmIdx = warm.data.findIndex((v) => v > 0);
    const neutralIdx = neutral.data.findIndex((v) => v > 0);
    expect(warmIdx).not.toBe(neutralIdx);
  });
});
