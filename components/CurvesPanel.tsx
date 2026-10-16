import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Adjustments, CurvePoint, CurveSet, NEUTRAL_CURVES, NEUTRAL_HUE_CURVES } from '../types';
import {
  evalCurve,
  evalHueCurve,
  evalPiecewiseLinear,
} from '../services/grade/curves';

type Tab = 'master' | 'r' | 'g' | 'b' | 'hueVsHue' | 'hueVsSat' | 'lumVsSat';

interface ChannelConfig {
  label: string;
  domain: [number, number];
  range: [number, number];
  /** y value that means "no change". */
  neutralY: number;
  /** Seed used the first time the user touches an empty curve. */
  seed: CurvePoint[];
  axisHint: string;
}

const TONAL = (label: string): ChannelConfig => ({
  label,
  domain: [0, 1],
  range: [0, 1],
  neutralY: 0.5,
  seed: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  axisHint: 'input → output',
});

const CHANNELS: Record<Tab, ChannelConfig> = {
  master: TONAL('Master'),
  r: TONAL('Red'),
  g: TONAL('Green'),
  b: TONAL('Blue'),
  hueVsHue: {
    label: 'Hue ↔ Hue',
    domain: [0, 360],
    range: [-180, 180],
    neutralY: 0,
    seed: [{ x: 0, y: 0 }, { x: 360, y: 0 }],
    axisHint: 'hue → rotation (±180°)',
  },
  hueVsSat: {
    label: 'Hue ↔ Sat',
    domain: [0, 360],
    range: [0, 2],
    neutralY: 1,
    seed: [{ x: 0, y: 1 }, { x: 360, y: 1 }],
    axisHint: 'hue → saturation ×',
  },
  lumVsSat: {
    label: 'Lum ↔ Sat',
    domain: [0, 1],
    range: [0, 2],
    neutralY: 1,
    seed: [{ x: 0, y: 1 }, { x: 1, y: 1 }],
    axisHint: 'luma → saturation ×',
  },
};

const TABS: { id: Tab; label: string; color: string }[] = [
  { id: 'master', label: 'M', color: '#e5e7eb' },
  { id: 'r', label: 'R', color: '#ff5050' },
  { id: 'g', label: 'G', color: '#4ade80' },
  { id: 'b', label: 'B', color: '#60a5fa' },
  { id: 'hueVsHue', label: 'H↔H', color: '#fbbf24' },
  { id: 'hueVsSat', label: 'H↔S', color: '#f472b6' },
  { id: 'lumVsSat', label: 'L↔S', color: '#a78bfa' },
];

const W = 340;
const H = 210;
const PAD = 12;

interface CurvesPanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

/**
 * Curve editor with master / R / G / B tonal curves plus Resolve-style
 * Hue↔Hue, Hue↔Sat and Lum↔Sat curves.
 *
 * Click empty space to add a control point, drag to move, right-click to
 * delete. The first and last points are locked to the domain edges (which keeps
 * the hue curves continuous across the 0/360 seam).
 */
const CurvesPanel: React.FC<CurvesPanelProps> = ({ values, onChange, disabled }) => {
  const [tab, setTab] = useState<Tab>('master');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<number | null>(null);

  const curves: CurveSet = values.curves ?? NEUTRAL_CURVES;
  const hueCurves = values.hueCurves ?? NEUTRAL_HUE_CURVES;
  const cfg = CHANNELS[tab];

  const isHueTab = tab === 'hueVsHue' || tab === 'hueVsSat' || tab === 'lumVsSat';

  const stored: CurvePoint[] = isHueTab
    ? (hueCurves as unknown as Record<Tab, CurvePoint[]>)[tab] ?? []
    : (curves as unknown as Record<Tab, CurvePoint[]>)[tab] ?? [];

  // Seed on first interaction so there is always something to drag.
  const points = stored.length >= 2 ? stored : cfg.seed;

  const commit = useCallback(
    (next: CurvePoint[]) => {
      if (isHueTab) {
        onChange({ ...values, hueCurves: { ...hueCurves, [tab]: next } });
      } else {
        onChange({ ...values, curves: { ...curves, [tab]: next } });
      }
    },
    [curves, hueCurves, isHueTab, onChange, tab, values],
  );

  const evaluate = useCallback(
    (x: number): number => {
      if (tab === 'hueVsHue' || tab === 'hueVsSat') return evalHueCurve(points, x);
      if (tab === 'lumVsSat') return evalPiecewiseLinear(points, x);
      return evalCurve(points, x);
    },
    [points, tab],
  );

  /* ---------------- coordinate mapping ---------------- */

  const plotW = W - PAD * 2;
  const plotH = H - PAD * 2;
  const dSpan = cfg.domain[1] - cfg.domain[0];
  const rSpan = cfg.range[1] - cfg.range[0];

  const toScreen = (p: CurvePoint) => ({
    x: PAD + ((p.x - cfg.domain[0]) / dSpan) * plotW,
    y: PAD + (1 - (p.y - cfg.range[0]) / rSpan) * plotH,
  });

  const fromScreen = (sx: number, sy: number): CurvePoint => ({
    x: cfg.domain[0] + ((sx - PAD) / plotW) * dSpan,
    y: cfg.range[0] + (1 - (sy - PAD) / plotH) * rSpan,
  });

  /* ---------------- drawing ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
      canvas.width = W * dpr;
      canvas.height = H * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const x = PAD + (i / 4) * plotW;
      const y = PAD + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(x, PAD);
      ctx.lineTo(x, PAD + plotH);
      ctx.moveTo(PAD, y);
      ctx.lineTo(PAD + plotW, y);
      ctx.stroke();
    }

    // Neutral reference
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    if (isHueTab) {
      const ny = PAD + (1 - (cfg.neutralY - cfg.range[0]) / rSpan) * plotH;
      ctx.moveTo(PAD, ny);
      ctx.lineTo(PAD + plotW, ny);
    } else {
      ctx.moveTo(PAD, PAD + plotH);
      ctx.lineTo(PAD + plotW, PAD);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Curve
    const color = TABS.find((t) => t.id === tab)?.color ?? '#fff';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const STEPS = 140;
    for (let i = 0; i <= STEPS; i++) {
      const x = cfg.domain[0] + (i / STEPS) * dSpan;
      const y = evaluate(x);
      const s = toScreen({ x, y });
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();

    // Control points
    points.forEach((p, i) => {
      const s = toScreen(p);
      ctx.beginPath();
      ctx.arc(s.x, s.y, i === activeIndex ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fillStyle = i === activeIndex ? color : '#0b0b0e';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [activeIndex, cfg, dSpan, evaluate, isHueTab, plotH, plotW, points, rSpan, tab]);

  /* ---------------- interaction ---------------- */

  const toLocal = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * W,
      y: ((e.clientY - rect.top) / rect.height) * H,
    };
  };

  const hitTest = (sx: number, sy: number): number | null => {
    for (let i = 0; i < points.length; i++) {
      const s = toScreen(points[i]);
      if (Math.hypot(s.x - sx, s.y - sy) <= 9) return i;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const { x, y } = toLocal(e);
    const hit = hitTest(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);

    if (hit !== null) {
      dragRef.current = hit;
      setActiveIndex(hit);
      return;
    }

    // Add a point (seeding first if the curve was empty).
    const p = fromScreen(x, y);
    const clamped: CurvePoint = {
      x: Math.min(cfg.domain[1], Math.max(cfg.domain[0], p.x)),
      y: Math.min(cfg.range[1], Math.max(cfg.range[0], p.y)),
    };
    const next = [...points];
    // Never insert before the first or after the last point.
    let idx = next.findIndex((q) => q.x > clamped.x);
    if (idx <= 0) idx = next.length - 1;
    next.splice(idx, 0, clamped);

    dragRef.current = idx;
    setActiveIndex(idx);
    commit(next);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const idx = dragRef.current;
    if (idx === null) return;

    const { x, y } = toLocal(e);
    const p = fromScreen(x, y);
    const next = points.map((q) => ({ ...q }));
    const isEdge = idx === 0 || idx === points.length - 1;

    // Edges keep their x (keeps hue curves continuous across the seam).
    let nx = next[idx].x;
    if (!isEdge) {
      const lo = next[idx - 1].x + 0.005 * dSpan;
      const hi = next[idx + 1].x - 0.005 * dSpan;
      nx = Math.min(hi, Math.max(lo, p.x));
    }
    const ny = Math.min(cfg.range[1], Math.max(cfg.range[0], p.y));
    next[idx] = { x: nx, y: ny };
    commit(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current !== null) {
      dragRef.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    const hit = hitTest(sx, sy);
    // Only interior points can be removed.
    if (hit !== null && hit > 0 && hit < points.length - 1) {
      commit(points.filter((_, i) => i !== hit));
      setActiveIndex(null);
    }
  };

  const modified = stored.length >= 2 || stored.length > 0;

  return (
    <div className="space-y-4 select-none">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Curves
        </span>
        <button
          onClick={() => {
            commit([]);
            setActiveIndex(null);
          }}
          disabled={!modified}
          className={`text-[10px] text-muted-foreground hover:text-primary transition-all ${modified ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <i className="fa-solid fa-rotate-left mr-1"></i>Reset {cfg.label}
        </button>
      </div>

      <div className="flex items-center gap-0.5 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setTab(t.id);
              setActiveIndex(null);
            }}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
              tab === t.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 'auto', touchAction: 'none' }}
        className={`rounded-md border border-border/70 ${disabled ? 'opacity-30' : 'cursor-crosshair'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onContextMenu={onContextMenu}
      />

      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] text-muted-foreground font-mono">{cfg.axisHint}</span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {activeIndex !== null && points[activeIndex]
            ? `${points[activeIndex].x.toFixed(
                tab === 'lumVsSat' ? 2 : 0,
              )} → ${points[activeIndex].y.toFixed(2)}`
            : `${points.length} pts`}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed px-1">
        Click to add a point, drag to move, right-click to delete. Monotone interpolation — no
        overshoot.
      </p>
    </div>
  );
};

export default CurvesPanel;
