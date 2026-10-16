import { describe, expect, it } from 'vitest';
import { Adjustments, DEFAULT_OP_ORDER, GradeOpId, INITIAL_ADJUSTMENTS } from '../types';
import { applyAdjust } from '../services/grade/adjust';
import {
  isDefaultOpOrder,
  moveOp,
  normalizeOpOrder,
  reorderOp,
} from '../services/grade/order';
import { OP_COUNT, OP_INDEX } from '../services/gpu/gradeParams';
import { buildPipeline } from '../services/grade/pipeline';
import { evaluatePipeline } from '../services/grade/evaluate';
import { NEUTRAL_MEAN, NEUTRAL_STD } from '../services/analysis/stats';
import { Stats } from '../types';

/** A stats object with just enough present for the reinhard path. */
const STATS: Stats = {
  mean: { ...NEUTRAL_MEAN },
  std: { ...NEUTRAL_STD },
};

/** A grade with strong, non-commuting operations in every slot. */
const BUSY: Adjustments = {
  ...INITIAL_ADJUSTMENTS,
  exposure: 0.4,
  brightness: 12,
  contrast: 35,
  highlights: -30,
  shadows: 25,
  whites: 10,
  blacks: -15,
  vibrance: 20,
  saturation: 30,
  hue: 18,
  temperature: 12,
  tint: -6,
  wheels: {
    lift: { x: 0.12, y: -0.08, master: -0.05 },
    gamma: { x: -0.1, y: 0.05, master: 0.02 },
    gain: { x: 0.2, y: 0.1, master: 0.08 },
    offset: { x: -0.05, y: 0.15, master: -0.03 },
  },
  curves: {
    master: [
      { x: 0, y: 0.04 },
      { x: 0.5, y: 0.55 },
      { x: 1, y: 0.98 },
    ],
    r: [
      { x: 0, y: 0 },
      { x: 0.6, y: 0.68 },
      { x: 1, y: 1 },
    ],
    g: [],
    b: [],
  },
  hueCurves: {
    hueVsHue: [
      { x: 0, y: 12 },
      { x: 120, y: -20 },
      { x: 240, y: 8 },
    ],
    hueVsSat: [],
    lumVsSat: [],
  },
};

const SAMPLES = [
  { r: 0.05, g: 0.12, b: 0.2 },
  { r: 0.5, g: 0.5, b: 0.5 },
  { r: 0.9, g: 0.75, b: 0.3 },
  { r: 0.2, g: 0.85, b: 0.4 },
  { r: 0.95, g: 0.06, b: 0.5 },
];

describe('operation order normalisation', () => {
  it('returns the shared canonical order when none is set', () => {
    expect(normalizeOpOrder(undefined)).toBe(DEFAULT_OP_ORDER);
  });

  it('returns the shared canonical order when the order is already canonical', () => {
    expect(normalizeOpOrder([...DEFAULT_OP_ORDER])).toBe(DEFAULT_OP_ORDER);
    expect(isDefaultOpOrder([...DEFAULT_OP_ORDER])).toBe(true);
  });

  it('is a full permutation: every operation appears exactly once', () => {
    const messy = ['hue', 'hue', 'tonal', 'bogus' as GradeOpId, 'wheels'] as GradeOpId[];
    const out = normalizeOpOrder(messy);
    expect(out).toHaveLength(OP_COUNT);
    expect(new Set(out).size).toBe(OP_COUNT);
    for (const id of DEFAULT_OP_ORDER) expect(out).toContain(id);
  });

  it('keeps the caller ordering for the ids it recognises', () => {
    const out = normalizeOpOrder(['saturation', 'exposure']);
    expect(out.slice(0, 2)).toEqual(['saturation', 'exposure']);
  });

  it('never drops an unknown-id order down to nothing', () => {
    const out = normalizeOpOrder(['nope' as GradeOpId]);
    expect(out).toBe(DEFAULT_OP_ORDER);
  });
});

describe('operation order editing', () => {
  it('moves an operation one slot and clamps at the ends', () => {
    expect(moveOp(DEFAULT_OP_ORDER, 'brightness', -1).slice(0, 3)).toEqual([
      'brightness',
      'exposure',
      'contrast',
    ]);
    expect(moveOp(DEFAULT_OP_ORDER, 'exposure', -1)).toEqual([...DEFAULT_OP_ORDER]);
    expect(moveOp(DEFAULT_OP_ORDER, 'hue', 1)).toEqual([...DEFAULT_OP_ORDER]);
  });

  it('reorders by index', () => {
    expect(reorderOp(DEFAULT_OP_ORDER, 0, 2).slice(0, 3)).toEqual([
      'brightness',
      'contrast',
      'exposure',
    ]);
  });

  it('normalises before editing, so a partial order cannot lose operations', () => {
    // A one-entry order normalises to the full set with that op first, so the
    // edit operates on a complete list rather than a truncated one.
    const moved = moveOp(['hue'], 'hue', 1);
    expect(moved).toHaveLength(OP_COUNT);
    expect(new Set(moved).size).toBe(OP_COUNT);
    expect(moved[0]).toBe('exposure');
    expect(moved[1]).toBe('hue');
  });
});

describe('applyAdjust honours the order', () => {
  it('applies nothing when every operation is neutral, whatever the order', () => {
    const reversed = [...DEFAULT_OP_ORDER].reverse();
    const adj: Adjustments = { ...INITIAL_ADJUSTMENTS, opOrder: reversed };
    for (const s of SAMPLES) {
      const out = applyAdjust(s, adj);
      expect(out.r).toBeCloseTo(s.r, 10);
      expect(out.g).toBeCloseTo(s.g, 10);
      expect(out.b).toBeCloseTo(s.b, 10);
    }
  });

  it('the default order is identical to the historical chain', () => {
    // The initial grade carries DEFAULT_OP_ORDER; an explicit copy must match.
    const implicit = { ...BUSY, opOrder: undefined };
    const explicit = { ...BUSY, opOrder: [...DEFAULT_OP_ORDER] };
    for (const s of SAMPLES) {
      const a = applyAdjust(s, implicit);
      const b = applyAdjust(s, explicit);
      expect(b.r).toBeCloseTo(a.r, 12);
      expect(b.g).toBeCloseTo(a.g, 12);
      expect(b.b).toBeCloseTo(a.b, 12);
    }
  });

  it('changes the result when the order changes', () => {
    const swapped: GradeOpId[] = [...DEFAULT_OP_ORDER];
    // exposure (multiply) and brightness (add) do not commute.
    const ei = swapped.indexOf('exposure');
    const bi = swapped.indexOf('brightness');
    swapped[ei] = 'brightness';
    swapped[bi] = 'exposure';

    const a = applyAdjust(SAMPLES[1], { ...BUSY, opOrder: [...DEFAULT_OP_ORDER] });
    const b = applyAdjust(SAMPLES[1], { ...BUSY, opOrder: swapped });
    const delta = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    expect(delta).toBeGreaterThan(1e-3);
  });

  it('duplicate and unknown ids do not apply an operation twice', () => {
    const once = applyAdjust(SAMPLES[2], { ...BUSY, opOrder: ['wheels', 'exposure'] });
    const messy = applyAdjust(SAMPLES[2], {
      ...BUSY,
      opOrder: ['wheels', 'exposure', 'wheels', 'bogus' as GradeOpId],
    });
    expect(messy.r).toBeCloseTo(once.r, 12);
    expect(messy.g).toBeCloseTo(once.g, 12);
    expect(messy.b).toBeCloseTo(once.b, 12);
  });

  it('is order-sensitive end to end through the pipeline', () => {
    const flipped = [...DEFAULT_OP_ORDER].reverse();
    const p1 = buildPipeline(STATS, { ...BUSY, opOrder: [...DEFAULT_OP_ORDER] }, 'reinhard');
    const p2 = buildPipeline(STATS, { ...BUSY, opOrder: flipped }, 'reinhard');
    const a = evaluatePipeline(SAMPLES[3], p1);
    const b = evaluatePipeline(SAMPLES[3], p2);
    const delta = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
    expect(delta).toBeGreaterThan(1e-3);
  });
});

describe('shader operation encoding', () => {
  it('assigns a distinct index to every operation', () => {
    const seen = new Set<number>();
    for (const id of DEFAULT_OP_ORDER) {
      const idx = OP_INDEX[id];
      expect(typeof idx).toBe('number');
      expect(seen.has(idx)).toBe(false);
      seen.add(idx);
    }
    expect(seen.size).toBe(OP_COUNT);
    // The shader loops `i < 9` and breaks on uOpCount.
    expect(OP_COUNT).toBe(9);
    for (const idx of seen) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(OP_COUNT);
    }
  });
});
