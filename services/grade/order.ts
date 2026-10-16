/**
 * Grading-operation order.
 *
 * The grade is a sequence of named operations. Their default order reproduces
 * the historically hard-coded chain exactly, but a grade may carry its own order
 * so a colourist can, for example, run the wheels before the contrast control or
 * shape the curves after saturation.
 *
 * Two rules keep this safe:
 *
 *  - `normalizeOpOrder` always returns every known operation exactly once, so an
 *    edited, partial or corrupt order can never silently drop an operation.
 *  - The canonical order is returned as the shared `DEFAULT_OP_ORDER` array, so
 *    an unmodified grade is identity-comparable to the default and costs no extra
 *    work in the render path.
 */

import { DEFAULT_OP_ORDER, GradeOpId } from '../../types';

export interface GradeOpMeta {
  id: GradeOpId;
  label: string;
  icon: string;
  hint: string;
}

/**
 * Presentation metadata, in canonical order. The panel lists the *current* order
 * but looks labels up here.
 */
export const GRADE_OP_META: readonly GradeOpMeta[] = [
  { id: 'exposure', label: 'Exposure', icon: 'fa-sun', hint: 'Scale scene light before anything else.' },
  { id: 'brightness', label: 'Brightness', icon: 'fa-circle-up', hint: 'Flat offset added to every channel.' },
  { id: 'contrast', label: 'Contrast', icon: 'fa-circle-half-stroke', hint: 'Pivot around mid grey.' },
  { id: 'tonal', label: 'Tonal Range', icon: 'fa-layer-group', hint: 'Luma-weighted gain for highlights, shadows, whites and blacks.' },
  { id: 'wheels', label: 'Colour Wheels', icon: 'fa-palette', hint: 'Lift / Gamma / Gain / Offset, per channel.' },
  { id: 'curves', label: 'Tone Curves', icon: 'fa-chart-line', hint: 'Master and per-channel tonal curves.' },
  { id: 'hueCurves', label: 'Hue Curves', icon: 'fa-rainbow', hint: 'Hue vs Hue, Hue vs Sat, Lum vs Sat.' },
  { id: 'saturation', label: 'Saturation', icon: 'fa-droplet', hint: 'Saturation and vibrance together.' },
  { id: 'hue', label: 'Hue Rotate', icon: 'fa-arrows-spin', hint: 'Matrix hue rotation about the luma axis.' },
];

const META_BY_ID = new Map<GradeOpId, GradeOpMeta>(GRADE_OP_META.map((m) => [m.id, m]));

export function opMeta(id: GradeOpId): GradeOpMeta {
  return META_BY_ID.get(id) ?? { id, label: id, icon: 'fa-circle', hint: '' };
}

const KNOWN = new Set<GradeOpId>(DEFAULT_OP_ORDER);

/**
 * Coerce an arbitrary order into a complete, duplicate-free one. Unknown ids are
 * dropped and any operation the caller forgot is appended in canonical order, so
 * the result is always a permutation of `DEFAULT_OP_ORDER`.
 */
export function normalizeOpOrder(order: readonly GradeOpId[] | undefined): readonly GradeOpId[] {
  if (!order) return DEFAULT_OP_ORDER;

  const seen = new Set<GradeOpId>();
  const out: GradeOpId[] = [];
  for (const id of order) {
    if (KNOWN.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of DEFAULT_OP_ORDER) {
    if (!seen.has(id)) out.push(id);
  }

  // Hand back the shared constant when nothing actually changed.
  let canonical = true;
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== DEFAULT_OP_ORDER[i]) {
      canonical = false;
      break;
    }
  }
  return canonical ? DEFAULT_OP_ORDER : out;
}

export function isDefaultOpOrder(order: readonly GradeOpId[] | undefined): boolean {
  return normalizeOpOrder(order) === DEFAULT_OP_ORDER;
}

/**
 * Move an operation one slot toward the front or the back. Returns a new array,
 * or the normalised current order when the move is a no-op.
 */
export function moveOp(
  order: readonly GradeOpId[] | undefined,
  id: GradeOpId,
  delta: -1 | 1,
): GradeOpId[] {
  const list = [...normalizeOpOrder(order)];
  const from = list.indexOf(id);
  if (from < 0) return list;
  const to = from + delta;
  if (to < 0 || to >= list.length) return list;
  list.splice(to, 0, ...list.splice(from, 1));
  return list;
}

/** Move the operation at `from` so that it lands at index `to`. */
export function reorderOp(
  order: readonly GradeOpId[] | undefined,
  from: number,
  to: number,
): GradeOpId[] {
  const list = [...normalizeOpOrder(order)];
  if (from < 0 || from >= list.length) return list;
  const clamped = Math.max(0, Math.min(list.length - 1, to));
  if (clamped === from) return list;
  list.splice(clamped, 0, ...list.splice(from, 1));
  return list;
}
