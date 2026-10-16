
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
}

export interface ImageAnalysis {
  title: string;
  description: string;
}

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
};
