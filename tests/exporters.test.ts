import { describe, expect, it } from 'vitest';
import { buildLUT3D } from '../services/lut/build';
import { parseCube } from '../services/lut/parse';
import { sample3D } from '../services/lut/sample';
import { to3dl, toClf, toCube1D, toHald } from '../services/lut/exporters';

const identity = (size = 5) => buildLUT3D(size, (rgb) => rgb);

describe('1D cube export', () => {
  it('preserves the identity curve', () => {
    const text = toCube1D(identity(9), 16);
    const parsed = parseCube(text);
    expect(parsed.dimension).toBe(1);
    expect(parsed.size).toBe(16);
    // Identity: entry i has value i/15 on every channel.
    expect(parsed.data[0]).toBeCloseTo(0, 5);
    expect(parsed.data[15 * 3]).toBeCloseTo(1, 5);
  });
});

describe('.3dl export', () => {
  it('emits a mesh header and 10-bit integer triples', () => {
    const text = to3dl(identity(3));
    const lines = text.split('\n');
    expect(lines[0]).toBe('3DMESH');
    expect(lines[1]).toBe('Mesh 10 3');
    // 3^3 data lines after the 2 header lines.
    expect(lines.length).toBe(2 + 27);
    for (const value of lines[2].split(' ')) {
      const n = Number(value);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1023);
    }
  });

  it('maps white to the max value', () => {
    const text = to3dl(identity(3));
    const last = text.split('\n').pop()!;
    expect(last).toBe('1023 1023 1023');
  });
});

describe('CLF export', () => {
  it('has a valid ProcessList skeleton and array dims', () => {
    const xml = toClf(identity(3), 'Test Look');
    expect(xml).toContain('urn:AMPAS:CLF:v3.0');
    expect(xml).toContain('<LUT3D id="lut" interpolation="trilinear"');
    expect(xml).toContain('<Array dim="3 3 3 3">');
    expect(xml).toContain('</ProcessList>');
    expect(xml).toContain('<Description>Test Look</Description>');
  });

  it('escapes the title', () => {
    const xml = toClf(identity(3), 'A & B <test>');
    expect(xml).toContain('A &amp; B &lt;test&gt;');
  });
});

describe('HALD export', () => {
  it('produces the correct image size for a level', () => {
    const hald = toHald(identity(17), 8);
    expect(hald.width).toBe(512);
    expect(hald.height).toBe(512);
    expect(hald.data.length).toBe(512 * 512 * 4);
  });

  it('encodes an identity LUT faithfully on decode', () => {
    const lut = identity(17);
    const level = 4;
    const n = level * level; // 16
    const hald = toHald(lut, level);
    const side = hald.width;

    // Decode a few pixels back to lattice coordinates and compare.
    for (const i of [0, 1, 100, 2000, side * side - 1]) {
      const a = i % n;
      const b = Math.floor(i / n) % n;
      const c = Math.floor(i / (n * n)) % n;
      const expected = sample3D(lut, a / (n - 1), b / (n - 1), c / (n - 1));
      const o = i * 4;
      expect(hald.data[o] / 255).toBeCloseTo(expected.r, 2);
      expect(hald.data[o + 1] / 255).toBeCloseTo(expected.g, 2);
      expect(hald.data[o + 2] / 255).toBeCloseTo(expected.b, 2);
      expect(hald.data[o + 3]).toBe(255);
    }
  });
});
