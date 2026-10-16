import { describe, expect, it } from 'vitest';
import { GpuCapabilities, gpuDisplayName } from '../services/gpu/capabilities';

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
