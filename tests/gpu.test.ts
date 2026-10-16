import { describe, expect, it } from 'vitest';
import { GpuCapabilities, gpuDisplayName } from '../services/gpu/capabilities';
import {
  COLOR_SPACE_INDEX,
  CURVE_ROWS,
  CURVE_SIZE,
  ENGINE_INDEX,
  IDENTITY_M3,
  INVCDF_ROWS,
  INVCDF_SIZE,
  LOG_CURVE_INDEX,
  OP_COUNT,
  OP_INDEX,
  buildLinearMatrix,
  buildMongeKantorovich,
  effectiveEngine,
} from '../services/gpu/gradeParams';
import { DEFAULT_COLOR_CONFIG } from '../services/grade/colorConfig';
import { NEUTRAL_MEAN } from '../services/analysis/stats';
import { DEFAULT_OP_ORDER } from '../types';

const base: GpuCapabilities = {
  webgl2: true,
  renderer: 'ANGLE (Intel, Intel(R) UHD Graphics)',
  vendor: 'Google Inc.',
  maxTextureSize: 16384,
  max3dTextureSize: 2048,
  maxTextureUnits: 16,
  maxRenderbufferSize: 16384,
};

describe('gpu capabilities presentation', () => {
  it('names the adapter when WebGL2 is available', () => {
    expect(gpuDisplayName(base)).toContain('Intel');
  });

  it('reports unavailability rather than a blank string', () => {
    expect(gpuDisplayName({ ...base, webgl2: false })).toBe('Not available');
  });

  it('falls back when the driver masks the adapter string', () => {
    expect(gpuDisplayName({ ...base, renderer: null })).toBe('Unknown adapter');
  });

  it('truncates an over-long adapter string so it cannot blow up the panel', () => {
    const name = gpuDisplayName({ ...base, renderer: 'x'.repeat(200) });
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name.endsWith('...')).toBe(true);
  });
});

/*
 * The GPU path hands the shader enum *indices*, not names, so the numbers are a
 * contract with the GLSL. These tests pin them: reordering an enum without
 * touching `shaders.ts` would otherwise silently grade with the wrong curve.
 */
describe('shader enum contract', () => {
  it('pins the log-curve decode indices', () => {
    expect(LOG_CURVE_INDEX).toEqual({ none: 0, acescct: 1, logc3: 2, slog3: 3, vlog: 4, redlog3g10: 5 });
  });

  it('pins the colour-space indices', () => {
    expect(COLOR_SPACE_INDEX).toEqual({ srgb: 0, rec709: 1, gamma24: 2, linear: 3 });
  });

  it('pins the transfer-engine indices', () => {
    expect(ENGINE_INDEX).toEqual({ reinhard: 0, mongeKantorovich: 1, histogramMatch: 2, threeWay: 3 });
  });

  it('pins the operation indices and covers the whole canonical order', () => {
    expect(OP_INDEX).toEqual({
      exposure: 0,
      brightness: 1,
      contrast: 2,
      tonal: 3,
      wheels: 4,
      curves: 5,
      hueCurves: 6,
      saturation: 7,
      hue: 8,
    });
    expect(OP_COUNT).toBe(9);
    expect(Object.keys(OP_INDEX).sort()).toEqual([...DEFAULT_OP_ORDER].sort());
    expect(Math.max(...Object.values(OP_INDEX))).toBe(OP_COUNT - 1);
  });

  it('pins the table layout the shader reads', () => {
    expect(CURVE_SIZE).toBe(1024);
    expect(CURVE_ROWS).toBe(7); // master, r, g, b, hueVsHue, hueVsSat, lumVsSat
    expect(INVCDF_SIZE).toBe(2048);
    expect(INVCDF_ROWS).toBe(3);
  });
});

describe('shader matrix derivation', () => {
  it('leaves a same-gamut, no-white-balance config as identity', () => {
    expect(buildLinearMatrix(DEFAULT_COLOR_CONFIG)).toEqual(IDENTITY_M3);
  });

  it('reduces Monge-Kantorovich to a translation when no covariance is present', () => {
    // The engine falls back to NEUTRAL_COV, whose matrix square root round-trips
    // to the identity — so the whole transform collapses to the mean shift.
    const { mat, offset } = buildMongeKantorovich({ mean: { l: 60, a: 5, b: -3 }, std: { l: 18, a: 9, b: 11 } });
    mat.forEach((v, i) => expect(v).toBeCloseTo(IDENTITY_M3[i], 6));
    expect(offset[0]).toBeCloseTo(60 - NEUTRAL_MEAN.l, 6);
    expect(offset[1]).toBeCloseTo(5 - NEUTRAL_MEAN.a, 6);
    expect(offset[2]).toBeCloseTo(-3 - NEUTRAL_MEAN.b, 6);
  });

  it('mirrors the CPU fallbacks for engines whose stats are missing', () => {
    const bare = { mean: NEUTRAL_MEAN, std: { l: 20, a: 10, b: 10 } };
    expect(effectiveEngine('mongeKantorovich', bare)).toBe('reinhard');
    expect(effectiveEngine('histogramMatch', bare)).toBe('reinhard');
    expect(effectiveEngine('threeWay', bare)).toBe('reinhard');
    expect(effectiveEngine('reinhard', bare)).toBe('reinhard');
  });
});
