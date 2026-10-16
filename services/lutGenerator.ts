
import { RGB, LAB, Stats, Adjustments } from '../types';

/**
 * Generates a 32x32x32 .cube LUT based on provided stats and user adjustments.
 */
export async function generateLUT(stats: Stats, adjustments: Adjustments): Promise<string> {
  const size = 32;
  const lutLines: string[] = [];
  
  lutLines.push('TITLE "S.CHAK STUDIO"');
  lutLines.push(`LUT_3D_SIZE ${size}`);
  lutLines.push('');

  const neutralStats: Stats = {
    mean: { l: 50, a: 0, b: 0 },
    std: { l: 20, a: 10, b: 10 }
  };

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        // 1. Identity RGB
        const identityRgb: RGB = {
          r: r / (size - 1),
          g: g / (size - 1),
          b: b / (size - 1)
        };

        // 2. Base Reinhard Transfer (Color Mapping)
        const lab = rgbToLab(identityRgb);
        const newLab: LAB = {
          l: (lab.l - neutralStats.mean.l) * (stats.std.l / neutralStats.std.l) + stats.mean.l,
          a: (lab.a - neutralStats.mean.a) * (stats.std.a / neutralStats.std.a) + stats.mean.a,
          b: (lab.b - neutralStats.mean.b) * (stats.std.b / neutralStats.std.b) + stats.mean.b,
        };
        
        let rgb = labToRgb(newLab);

        // 3. Apply Fine-Tuning Adjustments
        rgb = applyAdjustments(rgb, identityRgb, adjustments);

        lutLines.push(`${clamp(rgb.r).toFixed(6)} ${clamp(rgb.g).toFixed(6)} ${clamp(rgb.b).toFixed(6)}`);
      }
    }
  }

  return lutLines.join('\n');
}

function applyAdjustments(rgb: RGB, identity: RGB, adj: Adjustments): RGB {
  let { r, g, b } = rgb;

  // Mix with original (Intensity)
  // UI sends -1 to 1. 
  // -1 maps to 0 (Original Identity)
  // 0 maps to 1 (Standard Computed Look)
  // 1 maps to 2 (Exaggerated Look)
  const mix = adj.intensity + 1;
  
  // Interpolation: Identity + (Target - Identity) * mix
  r = identity.r + (r - identity.r) * mix;
  g = identity.g + (g - identity.g) * mix;
  b = identity.b + (b - identity.b) * mix;

  // Exposure
  const exp = Math.pow(2, adj.exposure);
  r *= exp; g *= exp; b *= exp;

  // Temperature (Warm/Cool)
  r *= (1 + adj.temperature / 400);
  b *= (1 - adj.temperature / 400);
  
  // Tint (Green/Magenta)
  g *= (1 + adj.tint / 400);

  // Brightness (Base Offset)
  const bri = adj.brightness / 100;
  r += bri; g += bri; b += bri;

  // Contrast
  const con = (adj.contrast + 100) / 100;
  r = (r - 0.5) * con + 0.5;
  g = (g - 0.5) * con + 0.5;
  b = (b - 0.5) * con + 0.5;

  // Luma calculation for targeted weights
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;

  // Highlights / Shadows
  const shadowWeight = Math.pow(1 - luma, 2);
  const highlightWeight = Math.pow(luma, 2);
  const sh = (adj.shadows / 100) * shadowWeight;
  const hi = (adj.highlights / 100) * highlightWeight;
  r += sh + hi;
  g += sh + hi;
  b += sh + hi;

  // Whites / Blacks (Top/Bottom 20% isolation)
  const whiteWeight = Math.pow(Math.max(0, (luma - 0.7) / 0.3), 2);
  const blackWeight = Math.pow(Math.max(0, (0.3 - luma) / 0.3), 2);
  const wh = (adj.whites / 100) * whiteWeight;
  const bl = (adj.blacks / 100) * blackWeight;
  r += wh + bl;
  g += wh + bl;
  b += wh + bl;

  // Saturation / Vibrance
  const sat = (adj.saturation + 100) / 100;
  const vib = (adj.vibrance / 100);
  const satFactor = sat * (1 + vib * (1 - luma));
  r = luma + (r - luma) * satFactor;
  g = luma + (g - luma) * satFactor;
  b = luma + (b - luma) * satFactor;

  // Hue
  if (adj.hue !== 0) {
    const angle = (adj.hue * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rOld = r, gOld = g, bOld = b;
    r = (.299 + .701 * cosA + .168 * sinA) * rOld + (.587 - .587 * cosA + .330 * sinA) * gOld + (.114 - .114 * cosA - .497 * sinA) * bOld;
    g = (.299 - .299 * cosA - .328 * sinA) * rOld + (.587 + .413 * cosA + .035 * sinA) * gOld + (.114 - .114 * cosA + .292 * sinA) * bOld;
    b = (.299 - .3 * cosA + 1.25 * sinA) * rOld + (.587 - .588 * cosA - 1.05 * sinA) * gOld + (.114 + .886 * cosA - .203 * sinA) * bOld;
  }

  return { r, g, b };
}

export async function getImageStats(src: string): Promise<Stats> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      const s = 100;
      canvas.width = s; canvas.height = s;
      ctx.drawImage(img, 0, 0, s, s);
      const data = ctx.getImageData(0, 0, s, s).data;
      let lSum = 0, aSum = 0, bSum = 0, lSqSum = 0, aSqSum = 0, bSqSum = 0;
      const count = s * s;
      for (let i = 0; i < data.length; i += 4) {
        const lab = rgbToLab({ r: data[i]/255, g: data[i+1]/255, b: data[i+2]/255 });
        lSum += lab.l; aSum += lab.a; bSum += lab.b;
        lSqSum += lab.l * lab.l; aSqSum += lab.a * lab.a; bSqSum += lab.b * lab.b;
      }
      const mean: LAB = { l: lSum / count, a: aSum / count, b: bSum / count };
      const std: LAB = {
        l: Math.sqrt(Math.max(0, (lSqSum / count) - (mean.l * mean.l))),
        a: Math.sqrt(Math.max(0, (aSqSum / count) - (mean.a * mean.a))),
        b: Math.sqrt(Math.max(0, (bSqSum / count) - (mean.b * mean.b))),
      };
      resolve({ mean, std });
    };
    img.src = src;
  });
}

function clamp(v: number) { return Math.min(1, Math.max(0, v)); }

function rgbToLab(rgb: RGB): LAB {
  let r = rgb.r, g = rgb.g, b = rgb.b;
  r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) * 100;
  const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) * 100;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) * 100;
  const xN = 95.047, yN = 100.0, zN = 108.883;
  const fx = x / xN > 0.008856 ? Math.pow(x / xN, 1/3) : (7.787 * (x / xN)) + (16/116);
  const fy = y / yN > 0.008856 ? Math.pow(y / yN, 1/3) : (7.787 * (y / yN)) + (16/116);
  const fz = z / zN > 0.008856 ? Math.pow(z / zN, 1/3) : (7.787 * (z / zN)) + (16/116);
  return { l: (116 * fy) - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function labToRgb(lab: LAB): RGB {
  const y = (lab.l + 16) / 116;
  const x = lab.a / 500 + y;
  const z = y - lab.b / 200;
  const xN = 95.047, yN = 100.0, zN = 108.883;
  const x3 = Math.pow(x, 3), y3 = Math.pow(y, 3), z3 = Math.pow(z, 3);
  const X = x3 > 0.008856 ? x3 : (x - 16/116) / 7.787;
  const Y = y3 > 0.008856 ? y3 : (y - 16/116) / 7.787;
  const Z = z3 > 0.008856 ? z3 : (z - 16/116) / 7.787;
  const rX = X * xN / 100, rY = Y * yN / 100, rZ = Z * zN / 100;
  let r = rX * 3.2406 + rY * -1.5372 + rZ * -0.4986;
  let g = rX * -0.9689 + rY * 1.8758 + rZ * 0.0415;
  let b = rX * 0.0557 + rY * -0.2040 + rZ * 1.0570;
  r = (r > 0.0031308) ? (1.055 * Math.pow(r, 1 / 2.4) - 0.055) : 12.92 * r;
  g = (g > 0.0031308) ? (1.055 * Math.pow(g, 1 / 2.4) - 0.055) : 12.92 * g;
  b = (b > 0.0031308) ? (1.055 * Math.pow(b, 1 / 2.4) - 0.055) : 12.92 * b;
  return { r, g, b };
}

export function applyLUTToImage(canvas: HTMLCanvasElement, originalImg: HTMLImageElement, lutString: string | null) {
  if (!lutString) {
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
    return;
  }
  const lines = lutString.split('\n');
  const sizeLine = lines.find(l => l.startsWith('LUT_3D_SIZE'));
  if (!sizeLine) return;
  const size = parseInt(sizeLine.split(' ')[1]);
  const data = lines.filter(l => l && !isNaN(parseFloat(l[0]))).map(l => l.split(' ').map(parseFloat));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const rIdx = Math.round((pixels[i] / 255) * (size - 1));
    const gIdx = Math.round((pixels[i+1] / 255) * (size - 1));
    const bIdx = Math.round((pixels[i+2] / 255) * (size - 1));
    const lutIdx = rIdx + (gIdx * size) + (bIdx * size * size);
    const transformed = data[lutIdx];
    if (transformed) {
      pixels[i] = transformed[0] * 255;
      pixels[i+1] = transformed[1] * 255;
      pixels[i+2] = transformed[2] * 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
