/**
 * GPU shader sources.
 *
 * The fragment shader has two grading modes behind `uMode`:
 *
 *   0 — LUT:  sample a baked 3D LUT (the CPU-parity path, and what the export
 *             pipeline reproduces).
 *   1 — PARAM: evaluate the grade directly from uniforms, so moving a slider
 *             costs a handful of uniform writes instead of a full lattice bake.
 *
 * The PARAM arm is a line-by-line transcription of the CPU evaluators:
 *   `services/grade/adjust.ts`       → applyAdjustShader
 *   `services/grade/tone.ts`         → applyTonalRangeShader
 *   `services/grade/wheels.ts`       → applyWheelsShader
 *   `services/grade/curves.ts`       → applyCurvesShader / applyHueCurvesShader
 *   `services/grade/transfer.ts`     → applyTransferShader
 *   `services/grade/colorConfig.ts`  → gradeFromParams (decode/WB/gamut/encode)
 *
 * Keep the two in step: `tests/gpu.test.ts` pins the enum encodings, and the CDP
 * suite diffs the two backends pixel-for-pixel. The `if (uXActive == 1)` guards
 * mirror the CPU's early-outs, which are exact identities — they exist so an
 * absent control cannot perturb a value that is outside the 0..1 curve domain.
 */

export const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// NOTE: GLSL ES 3.00 has NO default precision for `sampler3D` (only
// `sampler2D` / `samplerCube`), so every sampler is explicitly qualified with
// `highp`. `highp` also avoids low-precision sampling that would reintroduce
// banding.
export const FRAG = `#version 300 es
precision highp float;
precision highp int;

uniform highp sampler2D uImage;
uniform highp sampler3D uLut;
uniform highp sampler2D uCurves;
uniform highp sampler2D uInvCdf;

uniform float uLutSize;
uniform float uStrength;
uniform float uMix;      // 0 = original, 1 = graded
uniform int uMode;       // 0 = LUT lookup, 1 = parameterised grade

/* ---- colour management ---- */
uniform int uCmEnabled;
uniform int uTonemap;
uniform int uInputLog;
uniform int uInputSpace;
uniform int uWorkingSpace;
uniform int uOutputSpace;
uniform vec3 uLinMat0;
uniform vec3 uLinMat1;
uniform vec3 uLinMat2;

/* ---- transfer node ---- */
uniform int uEngine;
uniform float uTransferMix;
uniform vec3 uReinhardScale;
uniform vec3 uReinhardBias;
uniform vec3 uMkMat0;
uniform vec3 uMkMat1;
uniform vec3 uMkMat2;
uniform vec3 uMkOffset;
uniform vec3 uRegionScale0;
uniform vec3 uRegionScale1;
uniform vec3 uRegionScale2;
uniform vec3 uRegionBias0;
uniform vec3 uRegionBias1;
uniform vec3 uRegionBias2;

/* ---- adjust node ---- */
uniform float uExposure;
uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform float uHue;
uniform vec4 uTonal;          // x highlights, y shadows, z whites, w blacks
uniform int uLogWheels;
uniform int uWheelsActive;
uniform int uCurvesActive;
uniform int uCurveMask;       // bit0 master, bit1 r, bit2 g, bit3 b
uniform int uHueCurvesActive;
uniform vec3 uWheelLift;
uniform vec3 uWheelGamma;
uniform vec3 uWheelGain;
uniform vec3 uWheelOffset;

/* Operation order (see OP_INDEX). Always a full permutation of 0..8. */
uniform int uOpOrder[9];
uniform int uOpCount;

in vec2 vUv;
out vec4 fragColor;

const float PI = 3.141592653589793;
const float SQRT2 = 1.4142135623730951;
const float CURVE_N = 1024.0;
const float CURVE_ROWS = 7.0;
const float INVCDF_N = 2048.0;
const float INVCDF_ROWS = 3.0;
const float TONAL_MAX_STOPS = 1.6;
const vec3 D65 = vec3(95.047, 100.0, 108.883);
const vec3 LUMA601 = vec3(0.299, 0.587, 0.114);

/* ================================================================== *
 * Transfer functions — services/color/transfers.ts
 * ================================================================== */

float srgbToLinear(float v) {
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}
float linearToSrgb(float v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}
float rec709ToLinear(float v) {
  return v < 0.081 ? v / 4.5 : pow((v + 0.099) / 1.099, 1.0 / 0.45);
}
float linearToRec709(float v) {
  return v < 0.018 ? 4.5 * v : 1.099 * pow(v, 0.45) - 0.099;
}

/** COLOR_SPACES index → toLinear. */
float spaceToLinear(float v, int idx) {
  if (idx == 1) return rec709ToLinear(v);
  if (idx == 2) return pow(max(0.0, v), 2.4);
  if (idx == 3) return v;
  return srgbToLinear(v);
}

/** COLOR_SPACES index → fromLinear. */
float spaceFromLinear(float v, int idx) {
  if (idx == 1) return linearToRec709(v);
  if (idx == 2) return pow(max(0.0, v), 1.0 / 2.4);
  if (idx == 3) return v;
  return linearToSrgb(v);
}

/* ================================================================== *
 * Camera log curves — services/color/spaces.ts
 * ================================================================== */

float logToLinear(float y, int idx) {
  if (idx == 1) {  // ACEScct
    return y <= 0.155251141552511
      ? (y - 0.0729055341958355) / 10.5402377416545
      : exp2(y * 17.52 - 9.72);
  }
  if (idx == 2) {  // ARRI LogC3
    return y > 0.1496582
      ? (pow(10.0, (y - 0.385537) / 0.2471896) - 0.052272) / 5.555556
      : (y - 0.092809) / 5.367655;
  }
  if (idx == 3) {  // Sony S-Log3
    return y >= 0.171
      ? pow(10.0, (y * 1023.0 - 420.0) / 261.5) * 0.19 - 0.01
      : ((y * 1023.0 - 95.0) * 0.01125) / (171.2102946929 - 95.0);
  }
  if (idx == 4) {  // Panasonic V-Log
    return y >= 0.181
      ? pow(10.0, (y - 0.598206) / 0.241514) - 0.00873
      : (y - 0.125) / 5.6;
  }
  if (idx == 5) {  // RED Log3G10
    return (pow(10.0, (y - 0.01) / 0.224282) - 1.0) / 155.975327;
  }
  return y;
}

float logFromLinear(float x, int idx) {
  if (idx == 1) {
    return x <= 0.0078125
      ? 10.5402377416545 * x + 0.0729055341958355
      : (log2(x) + 9.72) / 17.52;
  }
  if (idx == 2) {
    return x > 0.010591
      ? 0.2471896 * (log(5.555556 * x + 0.052272) / log(10.0)) + 0.385537
      : 5.367655 * x + 0.092809;
  }
  if (idx == 3) {
    return x >= 0.01125
      ? (420.0 + (log((x + 0.01) / 0.19) / log(10.0)) * 261.5) / 1023.0
      : ((x * (171.2102946929 - 95.0)) / 0.01125 + 95.0) / 1023.0;
  }
  if (idx == 4) {
    return x >= 0.01
      ? 0.241514 * (log(x + 0.00873) / log(10.0)) + 0.598206
      : 5.6 * x + 0.125;
  }
  if (idx == 5) {
    return 0.224282 * (log(155.975327 * max(0.0, x) + 1.0) / log(10.0)) + 0.01;
  }
  return x;
}

float decodeInput(float v) {
  return uInputLog == 0 ? spaceToLinear(v, uInputSpace) : logToLinear(v, uInputLog);
}

/* ================================================================== *
 * Row-major 3x3 helper (matches applyMat3 / applyMatVec)
 * ================================================================== */

vec3 mulMat(vec3 r0, vec3 r1, vec3 r2, vec3 v) {
  return vec3(dot(r0, v), dot(r1, v), dot(r2, v));
}

/* ================================================================== *
 * CIE L*a*b* — services/color/conversions.ts
 * ================================================================== */

float labF(float t) {
  return t > 0.008856 ? pow(t, 1.0 / 3.0) : 7.787 * t + 16.0 / 116.0;
}
float labFinv(float t) {
  float t3 = t * t * t;
  return t3 > 0.008856 ? t3 : (t - 16.0 / 116.0) / 7.787;
}

vec3 rgbToLab(vec3 c) {
  vec3 lin = vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)) * 100.0;
  vec3 xyz = vec3(
    dot(lin, vec3(0.4124564, 0.3575761, 0.1804375)),
    dot(lin, vec3(0.2126729, 0.7151522, 0.0721750)),
    dot(lin, vec3(0.0193339, 0.1191920, 0.9503041)));
  vec3 n = xyz / D65;
  float fx = labF(n.x);
  float fy = labF(n.y);
  float fz = labF(n.z);
  return vec3(116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz));
}

vec3 labToRgb(vec3 lab) {
  float y = (lab.x + 16.0) / 116.0;
  float x = lab.y / 500.0 + y;
  float z = y - lab.z / 200.0;
  vec3 xyz = vec3(labFinv(x), labFinv(y), labFinv(z)) * D65;
  vec3 n = xyz / 100.0;
  vec3 lin = vec3(
    dot(n, vec3(3.2404542, -1.5371385, -0.4985314)),
    dot(n, vec3(-0.9692660, 1.8760108, 0.0415560)),
    dot(n, vec3(0.0556434, -0.2040259, 1.0572252)));
  return vec3(linearToSrgb(lin.r), linearToSrgb(lin.g), linearToSrgb(lin.b));
}

/** ACES filmic approximation (Narkowicz) — colorConfig.ts */
float acesFilmic(float c) {
  const float a = 2.51;
  const float b = 0.03;
  const float d = 2.43;
  const float e = 0.59;
  const float f = 0.14;
  float v = (c * (a * c + b)) / (c * (d * c + e) + f);
  return v < 0.0 ? 0.0 : (v > 1.0 ? 1.0 : v);
}

/* ================================================================== *
 * Precomputed 1D tables
 * ================================================================== */

/** Sample one row of the packed curve texture at x (0..1, clamped). */
float sampleCurveRow(float row, float x) {
  float u = (clamp(x, 0.0, 1.0) * (CURVE_N - 1.0) + 0.5) / CURVE_N;
  float v = (row + 0.5) / CURVE_ROWS;
  return texture(uCurves, vec2(u, v)).r;
}

/** Sample one column of the histogram inverse-CDF table at p (0..1). */
float sampleInvCdf(float row, float p) {
  float u = (clamp(p, 0.0, 1.0) * (INVCDF_N - 1.0) + 0.5) / INVCDF_N;
  float v = (row + 0.5) / INVCDF_ROWS;
  return texture(uInvCdf, vec2(u, v)).r;
}

/* ================================================================== *
 * HSV + curves — services/grade/curves.ts
 * ================================================================== */

vec3 rgbToHsv(vec3 rgb) {
  vec3 c = clamp(rgb, 0.0, 1.0);
  float mx = max(max(c.r, c.g), c.b);
  float mn = min(min(c.r, c.g), c.b);
  float d = mx - mn;
  float h = 0.0;
  if (d > 1e-9) {
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
    if (h < 0.0) h += 360.0;
  }
  float s = mx > 1e-9 ? d / mx : 0.0;
  return vec3(h, s, mx);
}

vec3 hsvToRgb(float h, float s, float v) {
  float hue = mod(mod(h, 360.0) + 360.0, 360.0);
  float c = v * s;
  float x = c * (1.0 - abs(mod(hue / 60.0, 2.0) - 1.0));
  float m = v - c;
  float r = 0.0;
  float g = 0.0;
  float b = 0.0;
  if (hue < 60.0) { r = c; g = x; }
  else if (hue < 120.0) { r = x; g = c; }
  else if (hue < 180.0) { g = c; b = x; }
  else if (hue < 240.0) { g = x; b = c; }
  else if (hue < 300.0) { r = x; b = c; }
  else { r = c; b = x; }
  return vec3(r + m, g + m, b + m);
}

/** Master then per-channel tonal curves (masked to match the CPU early-outs). */
vec3 applyCurvesShader(vec3 c) {
  vec3 v = c;
  if ((uCurveMask & 1) != 0) {
    v = vec3(sampleCurveRow(0.0, v.r), sampleCurveRow(0.0, v.g), sampleCurveRow(0.0, v.b));
  }
  if ((uCurveMask & 2) != 0) v.r = sampleCurveRow(1.0, v.r);
  if ((uCurveMask & 4) != 0) v.g = sampleCurveRow(2.0, v.g);
  if ((uCurveMask & 8) != 0) v.b = sampleCurveRow(3.0, v.b);
  return v;
}

/** Hue vs Hue / Hue vs Sat / Lum vs Sat, keyed on the input hue. */
vec3 applyHueCurvesShader(vec3 c) {
  vec3 hsv = rgbToHsv(c);
  float inputHue = hsv.x;
  float s = hsv.y;

  s *= sampleCurveRow(5.0, inputHue / 360.0);
  s *= sampleCurveRow(6.0, dot(c, LUMA601));
  s = clamp(s, 0.0, 1.0);

  float h = inputHue + sampleCurveRow(4.0, inputHue / 360.0);
  return hsvToRgb(h, s, hsv.z);
}

/* ================================================================== *
 * Tonal range — services/grade/tone.ts
 * ================================================================== */

vec3 applyTonalRangeShader(vec3 c) {
  if (uTonal.x == 0.0 && uTonal.y == 0.0 && uTonal.z == 0.0 && uTonal.w == 0.0) return c;

  float l = clamp(dot(c, LUMA601), 0.0, 1.0);
  float wShadows = (1.0 - l) * (1.0 - l);
  float wHighlights = l * l;
  float wb = clamp((0.25 - l) / 0.25, 0.0, 1.0);
  float wBlacks = wb * wb;
  float ww = clamp((l - 0.75) / 0.25, 0.0, 1.0);
  float wWhites = ww * ww;

  float stops = ((uTonal.y * wShadows + uTonal.x * wHighlights + uTonal.w * wBlacks + uTonal.z * wWhites) / 100.0) * TONAL_MAX_STOPS;
  return c * exp2(stops);
}

/* ================================================================== *
 * Primary wheels — services/grade/wheels.ts
 * ================================================================== */

vec3 applyWheelsShader(vec3 c) {
  vec3 v = c;
  if (uLogWheels == 1) {
    v = vec3(logFromLinear(v.r, 1), logFromLinear(v.g, 1), logFromLinear(v.b, 1));
  }

  v = v + uWheelLift * (1.0 - v);
  v = v * (1.0 + uWheelGain);

  vec3 g = 1.0 + uWheelGamma;
  vec3 outV = v;
  // pow() needs a positive base; the CPU skips the same cases.
  if (g.r > 0.01 && v.r > 0.0) outV.r = pow(v.r, 1.0 / g.r);
  if (g.g > 0.01 && v.g > 0.0) outV.g = pow(v.g, 1.0 / g.g);
  if (g.b > 0.01 && v.b > 0.0) outV.b = pow(v.b, 1.0 / g.b);
  v = outV + uWheelOffset;

  if (uLogWheels == 1) {
    v = vec3(logToLinear(v.r, 1), logToLinear(v.g, 1), logToLinear(v.b, 1));
  }
  return v;
}

/* ================================================================== *
 * Adjust node — services/grade/adjust.ts
 *
 * The order is data, not code: uOpOrder carries the operation ids and the
 * loop dispatches on them. That is what makes reordering a grade work
 * identically on both backends. Every arm below is a transcription of the
 * matching case in the CPU applyOp.
 * ================================================================== */

vec3 applyAdjustShader(vec3 c) {
  vec3 v = c;

  for (int i = 0; i < 9; i++) {
    if (i >= uOpCount) break;
    int op = uOpOrder[i];

    if (op == 0) {
      // Exposure — Math.pow(2, exposure)
      v *= exp2(uExposure);
    } else if (op == 1) {
      // Brightness (base offset)
      v += uBrightness / 100.0;
    } else if (op == 2) {
      // Contrast
      float con = (uContrast + 100.0) / 100.0;
      v = (v - 0.5) * con + 0.5;
    } else if (op == 3) {
      // Tonal range
      v = applyTonalRangeShader(v);
    } else if (op == 4) {
      // Primary wheels
      if (uWheelsActive == 1) v = applyWheelsShader(v);
    } else if (op == 5) {
      // Master + per-channel curves
      if (uCurvesActive == 1) v = applyCurvesShader(v);
    } else if (op == 6) {
      // Hue vs Hue / Hue vs Sat / Lum vs Sat
      if (uHueCurvesActive == 1) v = applyHueCurvesShader(v);
    } else if (op == 7) {
      // Saturation / vibrance
      float luma = dot(v, LUMA601);
      float sat = (uSaturation + 100.0) / 100.0;
      float vib = uVibrance / 100.0;
      float factor = sat * (1.0 + vib * (1.0 - luma));
      v = vec3(luma) + (v - vec3(luma)) * factor;
    } else if (op == 8) {
      // Hue rotation
      if (uHue != 0.0) {
        float angle = uHue * PI / 180.0;
        float cosA = cos(angle);
        float sinA = sin(angle);
        vec3 o = v;
        v.r = (.299 + .701 * cosA + .168 * sinA) * o.r + (.587 - .587 * cosA + .330 * sinA) * o.g + (.114 - .114 * cosA - .497 * sinA) * o.b;
        v.g = (.299 - .299 * cosA - .328 * sinA) * o.r + (.587 + .413 * cosA + .035 * sinA) * o.g + (.114 - .114 * cosA + .292 * sinA) * o.b;
        v.b = (.299 - .3 * cosA + 1.25 * sinA) * o.r + (.587 - .588 * cosA - 1.05 * sinA) * o.g + (.114 + .886 * cosA - .203 * sinA) * o.b;
      }
    }
  }

  return v;
}

/* ================================================================== *
 * Transfer node — services/grade/transfer.ts
 * ================================================================== */

float erfApprox(float x) {
  float sign_ = x < 0.0 ? -1.0 : 1.0;
  float ax = abs(x);
  float t = 1.0 / (1.0 + 0.3275911 * ax);
  float y = 1.0 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t * exp(-ax * ax);
  return sign_ * y;
}

float gaussianCdf(float x, float mu, float sigma) {
  return 0.5 * (1.0 + erfApprox((x - mu) / (sigma * SQRT2)));
}

vec3 applyTransferShader(vec3 c) {
  vec3 lab = rgbToLab(c);

  if (uEngine == 1) {
    // Monge-Kantorovich: M * (lab - neutral) + target
    return labToRgb(mulMat(uMkMat0, uMkMat1, uMkMat2, lab) + uMkOffset);
  }

  if (uEngine == 2) {
    // Histogram matching: neutral gaussian CDF -> inverse CDF of the target.
    return labToRgb(vec3(
      sampleInvCdf(0.0, gaussianCdf(lab.x, 50.0, 20.0)),
      sampleInvCdf(1.0, gaussianCdf(lab.y, 0.0, 10.0)),
      sampleInvCdf(2.0, gaussianCdf(lab.z, 0.0, 10.0))));
  }

  if (uEngine == 3) {
    // 3-way: gaussian-weighted shadow / mid / highlight rescale.
    float t = clamp(lab.x / 100.0, 0.0, 1.0);
    float ws = exp(-0.5 * pow((t - 0.15) / 0.2, 2.0));
    float wm = exp(-0.5 * pow((t - 0.5) / 0.2, 2.0));
    float wh = exp(-0.5 * pow((t - 0.85) / 0.2, 2.0));
    float sum = ws + wm + wh;
    if (sum == 0.0) sum = 1.0;
    vec3 s = lab * uRegionScale0 + uRegionBias0;
    vec3 m = lab * uRegionScale1 + uRegionBias1;
    vec3 h = lab * uRegionScale2 + uRegionBias2;
    return labToRgb((s * ws + m * wm + h * wh) / sum);
  }

  // Reinhard: per-channel LAB mean/std rescale.
  return labToRgb(lab * uReinhardScale + uReinhardBias);
}

/* ================================================================== *
 * Full color-managed grade — services/grade/colorConfig.ts
 * ================================================================== */

vec3 gradeFromParams(vec3 c) {
  vec3 work = c;

  if (uCmEnabled == 1) {
    // 1/2/3. Input decode -> white balance -> gamut (one combined linear matrix).
    vec3 lin = vec3(decodeInput(c.r), decodeInput(c.g), decodeInput(c.b));
    lin = mulMat(uLinMat0, uLinMat1, uLinMat2, lin);
    // 4. Encode to the working space.
    work = vec3(
      spaceFromLinear(lin.r, uWorkingSpace),
      spaceFromLinear(lin.g, uWorkingSpace),
      spaceFromLinear(lin.b, uWorkingSpace));
  }

  // Transfer node, with its intensity mix.
  vec3 graded = mix(work, applyTransferShader(work), uTransferMix);

  // Adjust node (mix = 1, so it is a plain composition).
  graded = applyAdjustShader(graded);

  if (uCmEnabled == 1) {
    // 5. Back to linear light.
    vec3 outLin = vec3(
      spaceToLinear(graded.r, uWorkingSpace),
      spaceToLinear(graded.g, uWorkingSpace),
      spaceToLinear(graded.b, uWorkingSpace));
    // 6. Optional filmic roll-off.
    if (uTonemap == 1) {
      outLin = vec3(acesFilmic(outLin.r), acesFilmic(outLin.g), acesFilmic(outLin.b));
    }
    // 7. Encode to the output space.
    return vec3(
      spaceFromLinear(outLin.r, uOutputSpace),
      spaceFromLinear(outLin.g, uOutputSpace),
      spaceFromLinear(outLin.b, uOutputSpace));
  }

  return graded;
}

/* ================================================================== */

void main() {
  vec3 c = clamp(texture(uImage, vUv).rgb, 0.0, 1.0);
  vec3 graded;

  if (uMode == 1) {
    graded = gradeFromParams(c);
  } else {
    float scale = (uLutSize - 1.0) / uLutSize;
    float offset = 0.5 / uLutSize;
    graded = texture(uLut, c * scale + offset).rgb;
  }

  fragColor = vec4(mix(c, graded, uStrength * uMix), 1.0);
}`;
