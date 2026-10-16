import { RGB } from '../../types';
import { applyAdjust } from './adjust';
import { applyTransfer } from './transfer';
import { GradeNode, GradePipeline } from './types';

/** Evaluate a single grade node against an input color. */
export function evaluateNode(rgb: RGB, node: GradeNode): RGB {
  if (node.type === 'transfer') {
    return applyTransfer(rgb, node.params.engine, node.params.stats);
  }
  return applyAdjust(rgb, node.params);
}

/** Evaluate a full pipeline (nodes applied in order). */
export function evaluatePipeline(rgb: RGB, pipeline: GradePipeline): RGB {
  let cur = rgb;
  for (const node of pipeline.nodes) {
    if (!node.enabled) continue;
    const out = evaluateNode(cur, node);
    cur = mixRgb(cur, out, node.mix);
  }
  return cur;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}
