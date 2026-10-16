/**
 * Color space + log-curve definitions (Phase 2 groundwork).
 *
 * A "space" is described purely by its per-channel transfer pair so the same
 * code can decode footage, do the grade in a working space and encode back out.
 * Gamut (primaries) matrices are handled separately in the render pipeline.
 */

import {
  srgbToLinear,
  linearToSrgb,
  rec709ToLinear,
  linearToRec709,
  gammaToLinear,
  linearToGamma,
} from './transfers';

export type ColorSpaceId = 'srgb' | 'rec709' | 'gamma24' | 'linear';

export interface ColorSpace {
  id: ColorSpaceId;
  label: string;
  /** encoded (display/curve) code value -> scene linear */
  toLinear: (v: number) => number;
  /** scene linear -> encoded code value */
  fromLinear: (v: number) => number;
}

const AEPS = 1e-6;

export const COLOR_SPACES: Record<ColorSpaceId, ColorSpace> = {
  srgb: {
    id: 'srgb',
    label: 'sRGB',
    toLinear: srgbToLinear,
    fromLinear: linearToSrgb,
  },
  rec709: {
    id: 'rec709',
    label: 'Rec.709 (2.4)',
    toLinear: rec709ToLinear,
    fromLinear: linearToRec709,
  },
  gamma24: {
    id: 'gamma24',
    label: 'Gamma 2.4',
    toLinear: (v) => gammaToLinear(v, 2.4),
    fromLinear: (v) => linearToGamma(v, 2.4),
  },
  linear: {
    id: 'linear',
    label: 'Linear',
    toLinear: (v) => v,
    fromLinear: (v) => v,
  },
};

/* ------------------------------------------------------------------ *
 * Camera log curves: log-encoded -> scene linear
 * ------------------------------------------------------------------ */

export type LogCurveId = 'none' | 'acescct' | 'logc3' | 'slog3' | 'vlog' | 'redlog3g10';

export interface LogCurve {
  id: LogCurveId;
  label: string;
  /** log code value -> scene linear */
  toLinear: (v: number) => number;
  /** scene linear -> log code value */
  fromLinear: (v: number) => number;
}

function acescctToLinear(y: number): number {
  return y <= 0.155251141552511
    ? (y - 0.0729055341958355) / 10.5402377416545
    : Math.pow(2, y * 17.52 - 9.72);
}

function linearToAcescct(x: number): number {
  return x <= 0.0078125 ? 10.5402377416545 * x + 0.0729055341958355 : (Math.log2(x) + 9.72) / 17.52;
}

function logC3ToLinear(t: number): number {
  return t > 0.1496582
    ? (Math.pow(10, (t - 0.385537) / 0.2471896) - 0.052272) / 5.555556
    : (t - 0.092809) / 5.367655;
}

function linearToLogC3(x: number): number {
  return x > 0.010591
    ? 0.2471896 * Math.log10(5.555556 * x + 0.052272) + 0.385537
    : 5.367655 * x + 0.092809;
}

function slog3ToLinear(t: number): number {
  return t >= 0.171
    ? Math.pow(10, (t * 1023 - 420) / 261.5) * 0.19 - 0.01
    : ((t * 1023 - 95) * 0.01125) / (171.2102946929 - 95);
}

function linearToSlog3(x: number): number {
  return x >= 0.01125
    ? (420 + Math.log10((x + 0.01) / 0.19) * 261.5) / 1023
    : ((x * (171.2102946929 - 95)) / 0.01125 + 95) / 1023;
}

function vlogToLinear(t: number): number {
  return t >= 0.181 ? Math.pow(10, (t - 0.598206) / 0.241514) - 0.00873 : (t - 0.125) / 5.6;
}

function linearToVlog(x: number): number {
  return x >= 0.01 ? 0.241514 * Math.log10(x + 0.00873) + 0.598206 : 5.6 * x + 0.125;
}

function redlog3g10ToLinear(t: number): number {
  return (Math.pow(10, (t - 0.01) / 0.224282) - 1) / 155.975327;
}

function linearToRedlog3g10(x: number): number {
  return 0.224282 * Math.log10(155.975327 * Math.max(0, x) + 1) + 0.01;
}

export const LOG_CURVES: Record<LogCurveId, LogCurve> = {
  none: { id: 'none', label: 'None (display)', toLinear: (v) => v, fromLinear: (v) => v },
  acescct: { id: 'acescct', label: 'ACEScct', toLinear: acescctToLinear, fromLinear: linearToAcescct },
  logc3: { id: 'logc3', label: 'ARRI LogC3', toLinear: logC3ToLinear, fromLinear: linearToLogC3 },
  slog3: { id: 'slog3', label: 'Sony S-Log3', toLinear: slog3ToLinear, fromLinear: linearToSlog3 },
  vlog: { id: 'vlog', label: 'Panasonic V-Log', toLinear: vlogToLinear, fromLinear: linearToVlog },
  redlog3g10: {
    id: 'redlog3g10',
    label: 'RED Log3G10',
    toLinear: redlog3g10ToLinear,
    fromLinear: linearToRedlog3g10,
  },
};

/** Guard against zero/negative log inputs without throwing. */
export function safeLog(x: number): number {
  return Math.max(AEPS, x);
}
