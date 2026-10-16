import React, { useCallback, useEffect, useRef } from 'react';

export interface AdjustmentSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** Decimal places for the numeric readout. */
  precision?: number;
  /** Value the reset button restores, and the baseline for "modified". */
  defaultValue?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Snap to the step grid, then strip binary float noise so the value handed to
 * the grading state is exactly what the readout shows (0.1 + 0.2 problems would
 * otherwise make the thumb and the number disagree).
 */
export function snapToStep(raw: number, min: number, max: number, step: number): number {
  const bounded = clamp(raw, min, max);
  if (!step) return bounded;
  const decimals = (String(step).split('.')[1] || '').length;
  const steps = Math.round((bounded - min) / step);
  const v = min + steps * step;
  return clamp(decimals ? parseFloat(v.toFixed(decimals)) : v, min, max);
}

/**
 * A continuous, pointer-driven grading slider.
 *
 * The track is the interaction surface and the thumb is positioned at
 * `percent% - 8px`, so the pointer is mapped against the *same* geometry the
 * thumb is drawn with (`ratio = (x - left) / width`). That makes the thumb land
 * exactly under the pointer instead of trailing it, which a native range input
 * cannot do because its own thumb travel is inset by the UA thumb width.
 *
 * A native `<input type="range">` is kept in the tree — visually hidden, as
 * before — so keyboard control, focus and assistive-tech semantics stay native.
 * It carries `pointer-events-none` so all pointer handling goes through the
 * track, and both paths funnel into the same `onChange`.
 *
 * Pointer moves are coalesced to one state update per frame (a high-poll-rate
 * mouse or pen fires far faster than the display), but the *latest* position is
 * always the one applied, so intermediate values are never skipped and nothing
 * waits for pointer-up.
 */
const AdjustmentSlider: React.FC<AdjustmentSliderProps> = ({
  label,
  value,
  min,
  max,
  step,
  precision = 0,
  defaultValue = 0,
  disabled = false,
  onChange,
  onReset,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingXRef = useRef<number | null>(null);
  // Mirrors the latest value so the pointer handlers never read a stale prop.
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    [],
  );

  /** Pointer x -> value, using the exact geometry the thumb is drawn with. */
  const valueAt = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return valueRef.current;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return valueRef.current;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return snapToStep(min + ratio * (max - min), min, max, step);
    },
    [min, max, step],
  );

  const commit = useCallback(
    (next: number) => {
      if (next === valueRef.current) return; // nothing changed: skip the render
      valueRef.current = next; // optimistic, so a fast drag never lags behind
      onChange(next);
    },
    [onChange],
  );

  /** Coalesce pointer moves into at most one update per frame. */
  const schedule = useCallback(
    (clientX: number) => {
      pendingXRef.current = clientX;
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const x = pendingXRef.current;
        if (x === null) return;
        commit(valueAt(x));
      });
    },
    [commit, valueAt],
  );

  /** Apply immediately, cancelling any queued frame (pointer down / up). */
  const flush = useCallback(
    (clientX: number) => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      pendingXRef.current = null;
      commit(valueAt(clientX));
    },
    [commit, valueAt],
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      /* the capture was already gone */
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Left button only for a mouse; touch and pen have no button to check.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Stops text selection and the browser's own drag from starting.
    e.preventDefault();
    // Capture so the drag keeps tracking outside the track, and keeps receiving
    // pointerup / pointercancel.
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    // Jump to the pressed position — and stay dragging, so the very next move
    // continues the adjustment instead of requiring a second press.
    flush(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    e.preventDefault();
    schedule(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // Land exactly on the release position; a queued frame would otherwise be
    // dropped with the capture.
    flush(e.clientX);
    endDrag(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    // A cancelled gesture keeps the value it had already applied; any queued
    // frame still lands, so the last known position is not lost.
    endDrag(e);
  };

  const percent = ((value - min) / (max - min)) * 100;
  const isModified = Math.abs(value - defaultValue) > 0.001;

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex justify-between items-center h-5">
        <label className="text-[11px] font-medium text-muted-foreground capitalize">{label}</label>

        <div className="flex items-center gap-2">
          {/* Reset Button (Only visible when modified) */}
          <button
            onClick={onReset}
            className={`text-[10px] text-muted-foreground hover:text-primary transition-all duration-200 ${isModified ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            title="Reset to default"
            tabIndex={-1}
          >
            <i className="fa-solid fa-rotate-left"></i>
          </button>

          <span className="text-[10px] font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded min-w-[32px] text-center">
            {value.toFixed(precision)}
          </span>
        </div>
      </div>

      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className="relative h-4 flex items-center group cursor-pointer touch-none"
      >
        {/* Track Background */}
        <div className="absolute w-full h-[2px] bg-secondary rounded-full overflow-hidden">
          {/* Track Fill */}
          <div className="h-full bg-primary transition-all duration-75" style={{ width: `${percent}%` }}></div>
        </div>

        {/* Keyboard / assistive-tech control. Pointer handling lives on the
            track, so this never competes for the pointer. */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={(e) => commit(snapToStep(parseFloat(e.target.value), min, max, step))}
          className="absolute w-full h-full opacity-0 z-10 pointer-events-none"
        />

        {/* Custom Thumb Visual (follows position) */}
        <div
          className="absolute h-4 w-4 bg-background border-2 border-primary rounded-full shadow-sm pointer-events-none transition-transform group-active:scale-110"
          style={{ left: `calc(${percent}% - 8px)` }}
        ></div>
      </div>
    </div>
  );
};

export default AdjustmentSlider;
