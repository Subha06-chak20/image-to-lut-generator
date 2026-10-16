import { describe, expect, it } from 'vitest';
import { computeParade } from '../services/scopes/compute';

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

describe('computeParade robustness', () => {
  it('floors a non-integer width (e.g. 512/3) instead of throwing', () => {
    const img = fakeImage([[10, 20, 30], [40, 50, 60], [70, 80, 90]], 3, 1);
    const parade = computeParade(img, 512 / 3);
    expect(parade.r.width).toBe(170);
    expect(Number.isInteger(parade.r.width)).toBe(true);
    expect(parade.r.data.length).toBe(170 * 256);
  });
});
