/**
 * Additional LUT export formats (Phase 7).
 *
 * Pure serializers — no DOM — so they can be unit tested. The HALD exporter
 * returns raw RGBA data that the UI turns into a PNG canvas.
 */

import { LUT3D } from './types';
import { sample3D } from './sample';
import { BRAND } from '../brand';

/* ------------------------------------------------------------------ *
 * 1D .cube (per-channel curve sampled from the 3D LUT)
 * ------------------------------------------------------------------ */

export function toCube1D(lut: LUT3D, size = 1024, title: string = `${BRAND.name} 1D`): string {
  const lines: string[] = [`TITLE "${title}"`, `LUT_1D_SIZE ${size}`, ''];
  for (let i = 0; i < size; i++) {
    const v = i / (size - 1);
    // Per-channel response sampled from each axis of the 3D LUT.
    const r = sample3D(lut, v, 0, 0).r;
    const g = sample3D(lut, 0, v, 0).g;
    const b = sample3D(lut, 0, 0, v).b;
    lines.push(`${clamp01(r).toFixed(6)} ${clamp01(g).toFixed(6)} ${clamp01(b).toFixed(6)}`);
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * .3dl (Autodesk/Lustre 3D mesh, 10-bit integers)
 * ------------------------------------------------------------------ */

export function to3dl(lut: LUT3D): string {
  const lines: string[] = ['3DMESH', `Mesh 10 ${lut.size}`];
  const { data, size } = lut;
  const max = 1023;
  for (let i = 0; i < size * size * size; i++) {
    const o = i * 3;
    lines.push(
      `${Math.round(clamp01(data[o]) * max)} ${Math.round(clamp01(data[o + 1]) * max)} ${Math.round(
        clamp01(data[o + 2]) * max,
      )}`,
    );
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * CLF (Academy / ASC Common LUT Format v3, LUT3D)
 * ------------------------------------------------------------------ */

export function toClf(lut: LUT3D, title: string = BRAND.name): string {
  const { data, size } = lut;
  const values: string[] = [];
  for (let i = 0; i < size * size * size * 3; i++) {
    values.push(data[i].toFixed(6));
  }
  // Wrap the array values for readability.
  const rows: string[] = [];
  for (let i = 0; i < values.length; i += 9) {
    rows.push('        ' + values.slice(i, i + 9).join(' '));
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ProcessList id="s.chak.studio" version="3.0" xmlns="urn:AMPAS:CLF:v3.0">',
    `  <Description>${escapeXml(title)}</Description>`,
    '  <LUT3D id="lut" interpolation="trilinear" halfDomain="false">',
    `    <Array dim="3 ${size} ${size} ${size}">`,
    rows.join('\n'),
    '    </Array>',
    '  </LUT3D>',
    '</ProcessList>',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * HALD CLUT (level L -> image of side L^3, LUT size L^2)
 * ------------------------------------------------------------------ */

export interface HaldImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export function toHald(lut: LUT3D, level = 8): HaldImage {
  const n = level * level; // lattice size per axis
  const side = level * level * level; // image side
  const data = new Uint8ClampedArray(side * side * 4);

  for (let i = 0; i < side * side; i++) {
    const a = i % n;
    const b = Math.floor(i / n) % n;
    const c = Math.floor(i / (n * n)) % n;
    const color = sample3D(lut, a / (n - 1), b / (n - 1), c / (n - 1));
    const o = i * 4;
    data[o] = clamp01(color.r) * 255;
    data[o + 1] = clamp01(color.g) * 255;
    data[o + 2] = clamp01(color.b) * 255;
    data[o + 3] = 255;
  }

  return { width: side, height: side, data };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === "'" ? '&apos;' : '&quot;',
  );
}
