import { LUT3D } from './types';

/** Serialize a 3D LUT as an Adobe/Resolve-compatible `.cube` string. */
export function serializeCube3D(lut: LUT3D, precision = 6): string {
  const lines: string[] = [];
  lines.push(`TITLE "${lut.title ?? 'S.CHAK STUDIO'}"`);
  lines.push(`LUT_3D_SIZE ${lut.size}`);
  lines.push('');
  const { data, size } = lut;
  const total = size * size * size;
  const fmt = (v: number) => v.toFixed(precision);
  for (let i = 0; i < total; i++) {
    const o = i * 3;
    lines.push(`${fmt(data[o])} ${fmt(data[o + 1])} ${fmt(data[o + 2])}`);
  }
  return lines.join('\n');
}

/** Serialize the 1D identity LUT (handy for debugging / simple transforms). */
export function serializeCube1D(size: number, values: Float32Array, title = 'S.CHAK STUDIO 1D'): string {
  const lines: string[] = [];
  lines.push(`TITLE "${title}"`);
  lines.push(`LUT_1D_SIZE ${size}`);
  lines.push('');
  for (let i = 0; i < size; i++) {
    const o = i * 3;
    lines.push(`${values[o].toFixed(6)} ${values[o + 1].toFixed(6)} ${values[o + 2].toFixed(6)}`);
  }
  return lines.join('\n');
}
