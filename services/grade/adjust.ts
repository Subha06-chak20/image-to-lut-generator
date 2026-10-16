import { Adjustments, GradeOpId, RGB } from '../../types';
import { applyCurves, applyHueCurves, luma601 } from './curves';
import { normalizeOpOrder } from './order';
import { applyTonalRange } from './tone';
import { applyWheels } from './wheels';

/**
 * Tone + colour operations, applied in the order carried by the grade.
 *
 * The default order reproduces the original hard-coded chain exactly:
 *   exposure → brightness → contrast → tonal range → wheels → curves
 *   → hue/luma curves → saturation/vibrance → hue rotate
 *
 * The "intensity" mix is NOT applied here — it is expressed as the transfer
 * node's mix factor by the pipeline builder.
 *
 * White balance is deliberately NOT here. Temperature/tint are applied once, in
 * linear light, through the Bradford adaptation in `services/color/whitepoint.ts`
 * (see `withAdjustmentWhiteBalance`), ahead of the whole pipeline.
 *
 * Each operation is a pure `RGB -> RGB` transform, which is what makes reordering
 * them well defined. Operations that were historically skipped when unset keep
 * that exact early-out here, so an unused control can never perturb a value.
 */
export function applyAdjust(rgb: RGB, adj: Adjustments): RGB {
  let cur = rgb;

  for (const op of normalizeOpOrder(adj.opOrder)) {
    cur = applyOp(op, cur, adj);
  }

  return cur;
}

function applyOp(op: GradeOpId, rgb: RGB, adj: Adjustments): RGB {
  let { r, g, b } = rgb;

  switch (op) {
    case 'exposure': {
      const exp = Math.pow(2, adj.exposure);
      return { r: r * exp, g: g * exp, b: b * exp };
    }

    case 'brightness': {
      const bri = adj.brightness / 100;
      return { r: r + bri, g: g + bri, b: b + bri };
    }

    case 'contrast': {
      const con = (adj.contrast + 100) / 100;
      return {
        r: (r - 0.5) * con + 0.5,
        g: (g - 0.5) * con + 0.5,
        b: (b - 0.5) * con + 0.5,
      };
    }

    // Highlights / Shadows / Whites / Blacks — luma-dependent gain in stops.
    case 'tonal':
      return applyTonalRange({ r, g, b }, adj);

    // Primary wheels (in the working space, or log when logWheels is on).
    case 'wheels':
      return adj.wheels ? applyWheels({ r, g, b }, adj.wheels, !!adj.logWheels) : rgb;

    // Master + per-channel tonal curves.
    case 'curves':
      return adj.curves ? applyCurves({ r, g, b }, adj.curves) : rgb;

    // Hue vs Hue / Hue vs Sat / Lum vs Sat.
    case 'hueCurves':
      return adj.hueCurves ? applyHueCurves({ r, g, b }, adj.hueCurves) : rgb;

    case 'saturation': {
      const luma = luma601(r, g, b);
      const sat = (adj.saturation + 100) / 100;
      const vib = adj.vibrance / 100;
      const satFactor = sat * (1 + vib * (1 - luma));
      return {
        r: luma + (r - luma) * satFactor,
        g: luma + (g - luma) * satFactor,
        b: luma + (b - luma) * satFactor,
      };
    }

    case 'hue': {
      if (adj.hue === 0) return rgb;
      const angle = (adj.hue * Math.PI) / 180;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const rOld = r;
      const gOld = g;
      const bOld = b;
      return {
        r:
          (.299 + .701 * cosA + .168 * sinA) * rOld +
          (.587 - .587 * cosA + .330 * sinA) * gOld +
          (.114 - .114 * cosA - .497 * sinA) * bOld,
        g:
          (.299 - .299 * cosA - .328 * sinA) * rOld +
          (.587 + .413 * cosA + .035 * sinA) * gOld +
          (.114 - .114 * cosA + .292 * sinA) * bOld,
        b:
          (.299 - .3 * cosA + 1.25 * sinA) * rOld +
          (.587 - .588 * cosA - 1.05 * sinA) * gOld +
          (.114 + .886 * cosA - .203 * sinA) * bOld,
      };
    }
  }
}
