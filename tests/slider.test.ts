import { describe, expect, it } from 'vitest';
import { snapToStep } from '../components/AdjustmentSlider';

/**
 * The slider's whole value contract is "what the readout shows is what the
 * grade gets". A native range quantises to the step, but re-deriving the value
 * from a pointer position does not, so `snapToStep` has to reproduce that
 * quantisation — including the float noise a naive `min + steps * step` leaves
 * behind (0.1 + 0.2 style artefacts would make the number and the state
 * disagree by a hair).
 */
describe('snapToStep', () => {
  it('lands on the step grid measured from the minimum', () => {
    // Exposure: -2..2 step 0.05
    expect(snapToStep(1.03, -2, 2, 0.05)).toBe(1.05);
    expect(snapToStep(1.06, -2, 2, 0.05)).toBe(1.05);
    expect(snapToStep(1.08, -2, 2, 0.05)).toBe(1.1);
  });

  it('rounds to the nearest step rather than truncating', () => {
    // 1.01 is 0.2 of a step above 1.0, so it rounds back down to 1.0.
    expect(snapToStep(1.01, -2, 2, 0.05)).toBe(1);
    expect(snapToStep(1.02, -2, 2, 0.05)).toBe(1);
  });

  it('produces values with no binary float noise', () => {
    // The naive min + steps * step gives 0.30000000000000004 here.
    const v = snapToStep(0.3, -1, 1, 0.01);
    expect(v).toBe(0.3);
    expect(v.toFixed(2)).toBe('0.30');
    expect(v * 100).toBe(30);
  });

  it('keeps the readout exact across a whole sweep', () => {
    for (let i = 0; i <= 200; i++) {
      const raw = -1 + (i / 200) * 2;
      const v = snapToStep(raw, -1, 1, 0.01);
      // Two decimals is all the slider ever displays, and it must round-trip.
      expect(parseFloat(v.toFixed(2))).toBe(v);
    }
  });

  it('clamps to the range', () => {
    expect(snapToStep(9, -2, 2, 0.05)).toBe(2);
    expect(snapToStep(-9, -2, 2, 0.05)).toBe(-2);
  });

  it('handles integer steps and odd ranges', () => {
    expect(snapToStep(43.7, -100, 100, 1)).toBe(44);
    expect(snapToStep(-49.4, -50, 50, 1)).toBe(-49);
    expect(snapToStep(-179.6, -180, 180, 1)).toBe(-180);
  });

  it('passes the raw value through when there is no step', () => {
    expect(snapToStep(1.2345, 0, 2, 0)).toBe(1.2345);
  });

  it('never returns a value outside the range', () => {
    for (const [min, max, step] of [
      [-2, 2, 0.05],
      [-100, 100, 1],
      [-1, 1, 0.01],
      [-180, 180, 1],
    ]) {
      for (const raw of [min - 5, min, min + 0.001, 0, max - 0.001, max, max + 5]) {
        const v = snapToStep(raw, min, max, step);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    }
  });
});
