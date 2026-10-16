/**
 * DaVinci-style primary colour wheels: Lift / Gamma / Gain / Offset.
 *
 * Each wheel is a pad position on the unit disc plus a master (luma) offset.
 * The pad is converted to per-channel deltas by projecting onto the three
 * primary directions (red up, green lower-right, blue lower-left, 120° apart).
 * Because cos(θ-a)+cos(θ-b)+cos(θ-c) = 0 for directions 120° apart, the pad
 * contribution always sums to zero across R/G/B — the wheel tints without
 * shifting overall luma, which is what makes it feel like a Resolve wheel.
 *
 * Per-channel math (applied in the working space, or in ACEScct when
 * `logWheels` is enabled):
 *
 *   lift:   v = v + lift * (1 - v)      raises blacks, leaves white fixed
 *   gain:   v = v * (1 + gain)          scales the high end
 *   gamma:  v = v ^ (1 / (1 + gamma))   bends the midtones
 *   offset: v = v + offset              pure additive shift
 */

import { RGB, Wheel, Wheels } from '../../types';
import { LOG_CURVES } from '../color/spaces';

const DEG = Math.PI / 180;

/** Primary directions on the pad (math angles, y up). */
const CHANNEL_ANGLE: Record<'r' | 'g' | 'b', number> = {
  r: 90 * DEG,
  g: -30 * DEG,
  b: 210 * DEG,
};

/** Per-channel deltas for a wheel, each -1..1. */
export function wheelToRgb(w: Wheel): RGB {
  const rho = Math.min(1, Math.hypot(w.x, w.y));
  const theta = Math.atan2(w.y, w.x);
  return {
    r: rho * Math.cos(theta - CHANNEL_ANGLE.r) + w.master,
    g: rho * Math.cos(theta - CHANNEL_ANGLE.g) + w.master,
    b: rho * Math.cos(theta - CHANNEL_ANGLE.b) + w.master,
  };
}

/** True when a wheel has no effect. */
export function isNeutralWheel(w: Wheel | undefined): boolean {
  if (!w) return true;
  return w.x === 0 && w.y === 0 && w.master === 0;
}

/** True when none of the four wheels has an effect. */
export function isNeutralWheels(wheels: Wheels | undefined): boolean {
  if (!wheels) return true;
  return (
    isNeutralWheel(wheels.lift) &&
    isNeutralWheel(wheels.gamma) &&
    isNeutralWheel(wheels.gain) &&
    isNeutralWheel(wheels.offset)
  );
}

/**
 * Apply the four wheels to a single colour.
 * `log` evaluates lift/gamma/gain in an ACEScct log domain (Resolve's "Log
 * wheels"), which makes offset behave like an exposure shift in stops.
 */
export function applyWheels(rgb: RGB, wheels: Wheels, log = false): RGB {
  const lift = wheelToRgb(wheels.lift);
  const gamma = wheelToRgb(wheels.gamma);
  const gain = wheelToRgb(wheels.gain);
  const offset = wheelToRgb(wheels.offset);

  const toLog = log ? LOG_CURVES.acescct.fromLinear : null;
  const fromLog = log ? LOG_CURVES.acescct.toLinear : null;

  const channel = (value: number, key: 'r' | 'g' | 'b'): number => {
    let v = toLog ? toLog(value) : value;

    // Lift: converge on 1 so white stays put.
    v = v + lift[key] * (1 - v);

    // Gain: multiplicative.
    v = v * (1 + gain[key]);

    // Gamma: bend the midtones. Clamp the base since pow() needs v >= 0.
    const g = 1 + gamma[key];
    if (g > 0.01 && v > 0) v = Math.pow(v, 1 / g);

    // Offset: pure additive.
    v = v + offset[key];

    return fromLog ? fromLog(v) : v;
  };

  return {
    r: channel(rgb.r, 'r'),
    g: channel(rgb.g, 'g'),
    b: channel(rgb.b, 'b'),
  };
}
