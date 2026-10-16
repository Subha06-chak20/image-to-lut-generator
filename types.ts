
export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface LAB {
  l: number;
  a: number;
  b: number;
}

export interface Stats {
  mean: LAB;
  std: LAB;
  /** 3x3 LAB covariance, row-major (9). Optional — used by Monge-Kantorovich. */
  cov?: number[];
  /** Per-channel CDF + observed range. Optional — used by histogram matching. */
  histogram?: HistogramData;
  /** Per-luminance-region means/stds. Optional — used by 3-way transfer. */
  regions?: RegionStats;
}

export interface HistogramData {
  /** 256-bin CDF per LAB channel. */
  l: Float32Array;
  a: Float32Array;
  b: Float32Array;
  range: {
    l: [number, number];
    a: [number, number];
    b: [number, number];
  };
}

export interface RegionStats {
  shadows: { mean: LAB; std: LAB };
  mids: { mean: LAB; std: LAB };
  highlights: { mean: LAB; std: LAB };
}

export interface ImageAnalysis {
  title: string;
  description: string;
}

/* ------------------------------------------------------------------ *
 * Primary grading controls (DaVinci-style)
 * ------------------------------------------------------------------ */

/**
 * One colour wheel: a pad position on the unit disc plus a master (luma)
 * offset. `x` is right, `y` is up, both -1..1. (0,0) + master 0 is neutral.
 */
export interface Wheel {
  x: number;
  y: number;
  master: number;
}

/** The four Resolve-style primary wheels. */
export interface Wheels {
  /** Raises/lowers the low end without moving white. */
  lift: Wheel;
  /** Bends the midtones. */
  gamma: Wheel;
  /** Scales the high end without moving black. */
  gain: Wheel;
  /** Pure additive shift (exposure-like in log). */
  offset: Wheel;
}

/** A control point on a curve, normalised 0..1 unless the axis says otherwise. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Master + per-channel tonal curves. Empty arrays are identity. */
export interface CurveSet {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

/**
 * Hue/luminance curves. Domains differ per curve:
 * - hueVsHue: x = hue 0..360, y = rotation -180..180 (degrees)
 * - hueVsSat: x = hue 0..360, y = saturation multiplier 0..2
 * - lumVsSat: x = luma 0..1,   y = saturation multiplier 0..2
 */
export interface HueCurves {
  hueVsHue: CurvePoint[];
  hueVsSat: CurvePoint[];
  lumVsSat: CurvePoint[];
}

export const NEUTRAL_WHEEL: Wheel = { x: 0, y: 0, master: 0 };

export const NEUTRAL_WHEELS: Wheels = {
  lift: { ...NEUTRAL_WHEEL },
  gamma: { ...NEUTRAL_WHEEL },
  gain: { ...NEUTRAL_WHEEL },
  offset: { ...NEUTRAL_WHEEL },
};

export const NEUTRAL_CURVES: CurveSet = { master: [], r: [], g: [], b: [] };

export const NEUTRAL_HUE_CURVES: HueCurves = { hueVsHue: [], hueVsSat: [], lumVsSat: [] };

export interface Adjustments {
  exposure: number;
  intensity: number;
  brightness: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  temperature: number;
  tint: number;
  hue: number;
  /** Primary colour wheels. */
  wheels?: Wheels;
  /** Master + RGB tonal curves. */
  curves?: CurveSet;
  /** Hue / luminance curves. */
  hueCurves?: HueCurves;
  /** Run lift/gamma/gain in a log (ACEScct) domain instead of the working space. */
  logWheels?: boolean;
}

export const INITIAL_ADJUSTMENTS: Adjustments = {
  exposure: 0,
  intensity: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  vibrance: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  wheels: NEUTRAL_WHEELS,
  curves: NEUTRAL_CURVES,
  hueCurves: NEUTRAL_HUE_CURVES,
  logWheels: false,
};
