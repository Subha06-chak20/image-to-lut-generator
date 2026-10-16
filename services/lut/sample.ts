import { RGB } from '../../types';
import { LUT1D, LUT3D, ParsedLUT } from './types';

function clampRange(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Map a domain value into the [0, s] lattice coordinate. */
function toLattice(v: number, min: number, max: number, s: number): number {
  const span = max - min || 1;
  return ((v - min) / span) * s;
}

/**
 * Trilinear interpolation through a 3D LUT. This is the accurate counterpart to
 * nearest-neighbour lookup and removes the banding the previous version had.
 */
export function sample3D(lut: LUT3D, r: number, g: number, b: number): RGB {
  const s = lut.size - 1;
  const { data } = lut;
  const { domainMin, domainMax } = lut;

  const x = clampRange(toLattice(r, domainMin.r, domainMax.r, s), 0, s);
  const y = clampRange(toLattice(g, domainMin.g, domainMax.g, s), 0, s);
  const z = clampRange(toLattice(b, domainMin.b, domainMax.b, s), 0, s);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const x1 = Math.min(x0 + 1, s);
  const y1 = Math.min(y0 + 1, s);
  const z1 = Math.min(z0 + 1, s);

  const tx = x - x0;
  const ty = y - y0;
  const tz = z - z0;

  const stride = lut.size;
  const stride2 = stride * stride;
  const at = (xi: number, yi: number, zi: number, c: number) =>
    data[(xi + yi * stride + zi * stride2) * 3 + c];

  const out: RGB = { r: 0, g: 0, b: 0 };
  for (let c = 0; c < 3; c++) {
    const c000 = at(x0, y0, z0, c);
    const c100 = at(x1, y0, z0, c);
    const c010 = at(x0, y1, z0, c);
    const c110 = at(x1, y1, z0, c);
    const c001 = at(x0, y0, z1, c);
    const c101 = at(x1, y0, z1, c);
    const c011 = at(x0, y1, z1, c);
    const c111 = at(x1, y1, z1, c);

    const c00 = c000 + (c100 - c000) * tx;
    const c10 = c010 + (c110 - c010) * tx;
    const c01 = c001 + (c101 - c001) * tx;
    const c11 = c011 + (c111 - c011) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    const value = c0 + (c1 - c0) * tz;

    if (c === 0) out.r = value;
    else if (c === 1) out.g = value;
    else out.b = value;
  }

  return out;
}

/** Linear interpolation through a 1D LUT. */
export function sample1D(lut: LUT1D, rgb: RGB): RGB {
  const s = lut.size - 1;
  const { data, domainMin, domainMax } = lut;
  const out: RGB = { r: 0, g: 0, b: 0 };
  const src = [rgb.r, rgb.g, rgb.b];
  const dst = [out.r, out.g, out.b];
  const mins = [domainMin.r, domainMin.g, domainMin.b];
  const maxs = [domainMax.r, domainMax.g, domainMax.b];

  for (let c = 0; c < 3; c++) {
    const pos = clampRange(toLattice(src[c], mins[c], maxs[c], s), 0, s);
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, s);
    const t = pos - i0;
    const v0 = data[i0 * 3 + c];
    const v1 = data[i1 * 3 + c];
    dst[c] = v0 + (v1 - v0) * t;
  }

  return { r: dst[0], g: dst[1], b: dst[2] };
}

/** Dispatch sampling for either LUT dimension. */
export function sampleLUT(lut: ParsedLUT, rgb: RGB): RGB {
  return lut.dimension === 3 ? sample3D(lut, rgb.r, rgb.g, rgb.b) : sample1D(lut, rgb);
}
