import { parseCube } from './parse';
import { ParsedLUT } from './types';

let cachedKey: string | null = null;
let cachedLut: ParsedLUT | null = null;

/**
 * Resolve a LUT from a raw `.cube` string or an already-parsed LUT, caching the
 * most recent string so repeated preview renders don't re-parse 30k+ lines.
 */
export function loadLUT(lut: string | ParsedLUT | null): ParsedLUT | null {
  if (!lut) return null;
  if (typeof lut !== 'string') return lut;
  if (lut === cachedKey && cachedLut) return cachedLut;
  try {
    const parsed = parseCube(lut);
    cachedKey = lut;
    cachedLut = parsed;
    return parsed;
  } catch (err) {
    console.error('Failed to parse LUT:', err);
    return null;
  }
}
