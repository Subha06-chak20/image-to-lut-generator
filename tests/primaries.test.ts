import { describe, expect, it } from 'vitest';
import { INITIAL_ADJUSTMENTS, NEUTRAL_CURVES, NEUTRAL_HUE_CURVES, NEUTRAL_WHEELS, Wheel, Wheels } from '../types';
import { applyAdjust } from '../services/grade/adjust';
import {
  applyCurves,
  applyHueCurves,
  evalCurve,
  evalHueCurve,
  hsvToRgb,
  rgbToHsv,
} from '../services/grade/curves';
import { applyTonalRange } from '../services/grade/tone';
import { applyWheels, isNeutralWheels, wheelToRgb } from '../services/grade/wheels';
import {
  ADJ_TEMP_TO_KELVIN,
  DEFAULT_COLOR_CONFIG,
  withAdjustmentWhiteBalance,
} from '../services/grade/colorConfig';

function wheelsWith(partial: Partial<Wheels>): Wheels {
  return { ...NEUTRAL_WHEELS, ...partial };
}

describe('wheelToRgb', () => {
  it('is neutral at the origin', () => {
    const rgb = wheelToRgb({ x: 0, y: 0, master: 0 });
    expect(rgb.r).toBeCloseTo(0, 12);
    expect(rgb.g).toBeCloseTo(0, 12);
    expect(rgb.b).toBeCloseTo(0, 12);
  });

  it('sums to zero across channels (luma neutral) at any angle', () => {
    for (let deg = 0; deg < 360; deg += 15) {
      const a = (deg * Math.PI) / 180;
      const rgb = wheelToRgb({ x: 0.7 * Math.cos(a), y: 0.7 * Math.sin(a), master: 0 });
      expect(rgb.r + rgb.g + rgb.b).toBeCloseTo(0, 12);
    }
  });

  it('adds master equally to all channels', () => {
    const rgb = wheelToRgb({ x: 0, y: 0, master: 0.1 });
    expect(rgb.r).toBeCloseTo(0.1, 12);
    expect(rgb.g).toBeCloseTo(0.1, 12);
    expect(rgb.b).toBeCloseTo(0.1, 12);
  });

  it('clamps the pad radius to the unit disc', () => {
    const far = wheelToRgb({ x: 5, y: 0, master: 0 });
    const edge = wheelToRgb({ x: 1, y: 0, master: 0 });
    expect(far.r).toBeCloseTo(edge.r, 12);
    expect(far.g).toBeCloseTo(edge.g, 12);
    expect(far.b).toBeCloseTo(edge.b, 12);
  });
});

describe('applyWheels', () => {
  it('is identity for neutral wheels', () => {
    expect(isNeutralWheels(NEUTRAL_WHEELS)).toBe(true);
    const out = applyWheels({ r: 0.3, g: 0.6, b: 0.9 }, NEUTRAL_WHEELS);
    expect(out.r).toBeCloseTo(0.3, 12);
    expect(out.g).toBeCloseTo(0.6, 12);
    expect(out.b).toBeCloseTo(0.9, 12);
  });

  it('lift raises black and leaves white fixed', () => {
    const w = wheelsWith({ lift: { x: 0, y: 0, master: 0.2 } });
    expect(applyWheels({ r: 0, g: 0, b: 0 }, w).r).toBeCloseTo(0.2, 12);
    expect(applyWheels({ r: 1, g: 1, b: 1 }, w).r).toBeCloseTo(1, 12);
  });

  it('gain scales white and leaves black fixed', () => {
    const w = wheelsWith({ gain: { x: 0, y: 0, master: 0.5 } });
    expect(applyWheels({ r: 1, g: 1, b: 1 }, w).r).toBeCloseTo(1.5, 12);
    expect(applyWheels({ r: 0, g: 0, b: 0 }, w).r).toBeCloseTo(0, 12);
  });

  it('offset shifts additively', () => {
    const w = wheelsWith({ offset: { x: 0, y: 0, master: 0.1 } });
    expect(applyWheels({ r: 0.5, g: 0.5, b: 0.5 }, w).r).toBeCloseTo(0.6, 12);
  });

  it('gamma bends the midtones (>=1 brightens)', () => {
    const w = wheelsWith({ gamma: { x: 0, y: 0, master: 1 } });
    expect(applyWheels({ r: 0.25, g: 0.25, b: 0.25 }, w).r).toBeCloseTo(0.5, 12);
  });

  it('a pad move tints without changing luma', () => {
    // Push toward red: red up, green/blue down.
    const w = wheelsWith({ gamma: { x: 0, y: 1, master: 0 } });
    const out = applyWheels({ r: 0.5, g: 0.5, b: 0.5 }, w);
    expect(out.r).toBeGreaterThan(0.5);
    expect(out.g).toBeLessThan(0.5);
    expect(out.b).toBeLessThan(0.5);
  });

  it('log wheels make offset behave like an exposure shift', () => {
    const w = wheelsWith({ offset: { x: 0, y: 0, master: 0.1 } });
    const linear = applyWheels({ r: 0.5, g: 0.5, b: 0.5 }, w, false);
    const log = applyWheels({ r: 0.5, g: 0.5, b: 0.5 }, w, true);
    expect(linear.r).toBeCloseTo(0.6, 12);
    expect(log.r).toBeGreaterThan(0.5);
    expect(log.r).not.toBeCloseTo(linear.r, 3);

    // A log-space offset is a constant gain: the ratio should be ~stable.
    const lo = applyWheels({ r: 0.25, g: 0.25, b: 0.25 }, w, true).r;
    const hi = applyWheels({ r: 0.5, g: 0.5, b: 0.5 }, w, true).r;
    expect(hi / lo).toBeGreaterThan(1.8);
    expect(hi / lo).toBeLessThan(2.2);
  });
});

describe('evalCurve', () => {
  it('is identity with fewer than two points', () => {
    expect(evalCurve(undefined, 0.3)).toBe(0.3);
    expect(evalCurve([], 0.3)).toBe(0.3);
    expect(evalCurve([{ x: 0, y: 0 }], 0.3)).toBe(0.3);
  });

  it('reproduces a straight line exactly', () => {
    const line = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(evalCurve(line, 0.25)).toBeCloseTo(0.25, 12);
    expect(evalCurve(line, 0.5)).toBeCloseTo(0.5, 12);
    expect(evalCurve(line, 0.75)).toBeCloseTo(0.75, 12);
  });

  it('passes through its control points', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.5, y: 0.8 }, { x: 1, y: 1 }];
    expect(evalCurve(pts, 0.5)).toBeCloseTo(0.8, 12);
  });

  it('never overshoots (monotone, in range) on an S-curve', () => {
    const pts = [{ x: 0, y: 0 }, { x: 0.2, y: 0.9 }, { x: 0.8, y: 0.95 }, { x: 1, y: 1 }];
    let prev = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const x = i / 200;
      const y = evalCurve(pts, x);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it('is flat beyond the endpoints', () => {
    const pts = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.9 }];
    expect(evalCurve(pts, 0)).toBeCloseTo(0.1, 12);
    expect(evalCurve(pts, 1)).toBeCloseTo(0.9, 12);
  });
});

describe('applyCurves', () => {
  it('is identity for empty curves', () => {
    const out = applyCurves({ r: 0.2, g: 0.5, b: 0.8 }, NEUTRAL_CURVES);
    expect(out.r).toBeCloseTo(0.2, 12);
    expect(out.g).toBeCloseTo(0.5, 12);
    expect(out.b).toBeCloseTo(0.8, 12);
  });

  it('a master S-curve darkens shadows and lifts highlights', () => {
    const curves = {
      ...NEUTRAL_CURVES,
      master: [{ x: 0, y: 0 }, { x: 0.25, y: 0.15 }, { x: 0.75, y: 0.85 }, { x: 1, y: 1 }],
    };
    const out = applyCurves({ r: 0.25, g: 0.25, b: 0.25 }, curves);
    expect(out.r).toBeLessThan(0.25);
    const hi = applyCurves({ r: 0.9, g: 0.9, b: 0.9 }, curves);
    expect(hi.r).toBeGreaterThan(0.9);
  });

  it('per-channel curves only touch their channel', () => {
    const curves = {
      ...NEUTRAL_CURVES,
      r: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }],
    };
    const out = applyCurves({ r: 1, g: 1, b: 1 }, curves);
    expect(out.r).toBeCloseTo(0.5, 12);
    expect(out.g).toBeCloseTo(1, 12);
    expect(out.b).toBeCloseTo(1, 12);
  });
});

describe('hue / luminance curves', () => {
  it('hsv round-trips', () => {
    for (const rgb of [{ r: 1, g: 0, b: 0 }, { r: 0.2, g: 0.7, b: 0.4 }, { r: 0.3, g: 0.3, b: 0.3 }]) {
      const back = hsvToRgb(rgbToHsv(rgb).h, rgbToHsv(rgb).s, rgbToHsv(rgb).v);
      expect(back.r).toBeCloseTo(rgb.r, 8);
      expect(back.g).toBeCloseTo(rgb.g, 8);
      expect(back.b).toBeCloseTo(rgb.b, 8);
    }
  });

  it('hueVsHue rotates a hue', () => {
    const hc = { ...NEUTRAL_HUE_CURVES, hueVsHue: [{ x: 0, y: 120 }, { x: 360, y: 120 }] };
    const out = applyHueCurves({ r: 1, g: 0, b: 0 }, hc);
    // red + 120deg = green
    expect(out.g).toBeGreaterThan(0.9);
    expect(out.r).toBeLessThan(0.1);
  });

  it('hueVsSat scales saturation', () => {
    const hc = { ...NEUTRAL_HUE_CURVES, hueVsSat: [{ x: 0, y: 1.5 }, { x: 360, y: 1.5 }] };
    const src = { r: 0.8, g: 0.4, b: 0.4 };
    const before = rgbToHsv(src).s;
    const after = rgbToHsv(applyHueCurves(src, hc)).s;
    expect(after).toBeCloseTo(Math.min(1, before * 1.5), 6);
    expect(after).toBeGreaterThan(before);
  });

  it('lumVsSat at zero fully desaturates', () => {
    const hc = { ...NEUTRAL_HUE_CURVES, lumVsSat: [{ x: 0, y: 0 }, { x: 1, y: 0 }] };
    const out = applyHueCurves({ r: 0.9, g: 0.3, b: 0.2 }, hc);
    expect(out.r).toBeCloseTo(out.g, 10);
    expect(out.g).toBeCloseTo(out.b, 10);
  });

  it('evalHueCurve wraps across the seam', () => {
    const pts = [{ x: 0, y: 0 }, { x: 360, y: 10 }];
    expect(evalHueCurve(pts, 0)).toBeCloseTo(0, 10);
    expect(evalHueCurve(pts, 180)).toBeCloseTo(5, 6);
    expect(evalHueCurve(pts, 359)).toBeCloseTo(9.972, 2);
  });
});

describe('applyTonalRange', () => {
  it('is identity at zero', () => {
    const out = applyTonalRange({ r: 0.2, g: 0.5, b: 0.8 }, { highlights: 0, shadows: 0, whites: 0, blacks: 0 });
    expect(out.r).toBeCloseTo(0.2, 12);
    expect(out.g).toBeCloseTo(0.5, 12);
    expect(out.b).toBeCloseTo(0.8, 12);
  });

  it('highlights lifts bright pixels more than dark ones', () => {
    const t = { highlights: 100, shadows: 0, whites: 0, blacks: 0 };
    const dark = applyTonalRange({ r: 0.1, g: 0.1, b: 0.1 }, t).r;
    const bright = applyTonalRange({ r: 0.9, g: 0.9, b: 0.9 }, t).r;
    expect(bright / 0.9).toBeGreaterThan(dark / 0.1);
    expect(bright).toBeGreaterThan(0.9);
  });

  it('shadows lifts dark pixels more than bright ones', () => {
    const t = { highlights: 0, shadows: 100, whites: 0, blacks: 0 };
    const dark = applyTonalRange({ r: 0.1, g: 0.1, b: 0.1 }, t).r;
    const bright = applyTonalRange({ r: 0.9, g: 0.9, b: 0.9 }, t).r;
    expect(dark / 0.1).toBeGreaterThan(bright / 0.9);
    expect(dark).toBeGreaterThan(0.1);
  });

  it('preserves hue (equal gain across channels)', () => {
    const src = { r: 0.6, g: 0.3, b: 0.15 };
    const out = applyTonalRange(src, { highlights: 60, shadows: -30, whites: 0, blacks: 0 });
    const ratioBefore = src.r / src.b;
    const ratioAfter = out.r / out.b;
    expect(ratioAfter).toBeCloseTo(ratioBefore, 10);
  });

  it('keeps the transfer monotonic', () => {
    const t = { highlights: 100, shadows: -100, whites: 100, blacks: -100 };
    let prev = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const v = i / 100;
      const y = applyTonalRange({ r: v, g: v, b: v }, t).r;
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });
});

describe('withAdjustmentWhiteBalance', () => {
  it('returns the same config when the sliders are neutral', () => {
    const merged = withAdjustmentWhiteBalance(DEFAULT_COLOR_CONFIG, INITIAL_ADJUSTMENTS);
    expect(merged).toBe(DEFAULT_COLOR_CONFIG);
  });

  it('maps slider units to Kelvin and keeps tint as-is', () => {
    const cfg = { ...DEFAULT_COLOR_CONFIG, wb: { enabled: true, temp: 4000, tint: 20 } };
    const adj = { ...INITIAL_ADJUSTMENTS, temperature: 10, tint: -5 };
    const merged = withAdjustmentWhiteBalance(cfg, adj);
    expect(merged.wb.enabled).toBe(true);
    expect(merged.wb.temp).toBe(4000 + 10 * ADJ_TEMP_TO_KELVIN);
    expect(merged.wb.tint).toBe(15);
  });

  it('enables white balance from the sliders alone', () => {
    const adj = { ...INITIAL_ADJUSTMENTS, temperature: 20 };
    const merged = withAdjustmentWhiteBalance(DEFAULT_COLOR_CONFIG, adj);
    expect(merged.wb.enabled).toBe(true);
    expect(merged.wb.temp).toBe(6504 + 20 * ADJ_TEMP_TO_KELVIN);
  });
});

describe('applyAdjust integration', () => {
  it('is identity with the default adjustment set', () => {
    for (const c of [{ r: 0.1, g: 0.2, b: 0.3 }, { r: 0.7, g: 0.5, b: 0.2 }, { r: 0.5, g: 0.5, b: 0.5 }]) {
      const out = applyAdjust(c, INITIAL_ADJUSTMENTS);
      expect(out.r).toBeCloseTo(c.r, 10);
      expect(out.g).toBeCloseTo(c.g, 10);
      expect(out.b).toBeCloseTo(c.b, 10);
    }
  });

  it('applies wheels and curves together', () => {
    const adj = {
      ...INITIAL_ADJUSTMENTS,
      wheels: wheelsWith({ gain: { x: 0, y: 0, master: 0.2 } as Wheel }),
      curves: { ...NEUTRAL_CURVES, master: [{ x: 0, y: 0 }, { x: 1, y: 0.8 }] },
    };
    const out = applyAdjust({ r: 1, g: 1, b: 1 }, adj);
    // gain 1.2 pushes 1.0 -> 1.2, which is past the curve's last point, so the
    // curve clamps to its endpoint (0.8) — documented flat extrapolation.
    expect(out.r).toBeCloseTo(0.8, 10);
  });
});
