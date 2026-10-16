import { RGB } from '../../types';

export interface LUT3D {
  dimension: 3;
  size: number;
  /** Interleaved RGB, length size^3 * 3. Index = (r + g*size + b*size^2) * 3. */
  data: Float32Array;
  title?: string;
  domainMin: RGB;
  domainMax: RGB;
}

export interface LUT1D {
  dimension: 1;
  size: number;
  /** Interleaved RGB, length size * 3. */
  data: Float32Array;
  title?: string;
  domainMin: RGB;
  domainMax: RGB;
}

export type ParsedLUT = LUT3D | LUT1D;

export const DEFAULT_DOMAIN_MIN: RGB = { r: 0, g: 0, b: 0 };
export const DEFAULT_DOMAIN_MAX: RGB = { r: 1, g: 1, b: 1 };
