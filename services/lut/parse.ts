import { DEFAULT_DOMAIN_MAX, DEFAULT_DOMAIN_MIN, LUT1D, LUT3D, ParsedLUT } from './types';

/**
 * Parse an Adobe/Resolve-style `.cube` file (1D or 3D).
 *
 * Throws on malformed input so callers can surface a useful error instead of
 * silently producing a broken grade.
 */
export function parseCube(text: string): ParsedLUT {
  let size3d: number | null = null;
  let size1d: number | null = null;
  let title: string | undefined;
  const domainMin = { ...DEFAULT_DOMAIN_MIN };
  const domainMax = { ...DEFAULT_DOMAIN_MAX };
  const values: number[] = [];

  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const upper = line.toUpperCase();
    if (upper.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (upper.startsWith('LUT_3D_SIZE')) {
      size3d = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (upper.startsWith('LUT_1D_SIZE')) {
      size1d = parseInt(line.split(/\s+/)[1], 10);
      continue;
    }
    if (upper.startsWith('LUT_3D_INPUT_RANGE') || upper.startsWith('LUT_1D_INPUT_RANGE')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      if (p.length === 2) {
        domainMin.r = domainMin.g = domainMin.b = p[0];
        domainMax.r = domainMax.g = domainMax.b = p[1];
      }
      continue;
    }
    if (upper.startsWith('DOMAIN_MIN')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      if (p.length === 3) { domainMin.r = p[0]; domainMin.g = p[1]; domainMin.b = p[2]; }
      continue;
    }
    if (upper.startsWith('DOMAIN_MAX')) {
      const p = line.split(/\s+/).slice(1).map(Number);
      if (p.length === 3) { domainMax.r = p[0]; domainMax.g = p[1]; domainMax.b = p[2]; }
      continue;
    }

    // Data row: three floats.
    const parts = line.split(/\s+/);
    if (parts.length >= 3) {
      const r = Number(parts[0]);
      const g = Number(parts[1]);
      const b = Number(parts[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        values.push(r, g, b);
      }
    }
  }

  if (size3d && size3d > 1) {
    const expected = size3d * size3d * size3d * 3;
    assertLength(values, expected, `LUT_3D_SIZE ${size3d}`);
    const lut: LUT3D = {
      dimension: 3,
      size: size3d,
      data: Float32Array.from(values),
      title,
      domainMin,
      domainMax,
    };
    return lut;
  }

  if (size1d && size1d > 1) {
    const expected = size1d * 3;
    assertLength(values, expected, `LUT_1D_SIZE ${size1d}`);
    const lut: LUT1D = {
      dimension: 1,
      size: size1d,
      data: Float32Array.from(values),
      title,
      domainMin,
      domainMax,
    };
    return lut;
  }

  throw new Error('Invalid .cube: missing LUT_3D_SIZE or LUT_1D_SIZE.');
}

function assertLength(values: number[], expected: number, label: string): void {
  if (values.length < expected) {
    throw new Error(`Invalid .cube: expected ${expected} values for ${label}, found ${values.length}.`);
  }
}
