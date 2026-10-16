import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Wheel } from '../types';
import { hsvToRgb } from '../services/grade/curves';
import { wheelToRgb } from '../services/grade/wheels';

/* ------------------------------------------------------------------ *
 * Interaction tuning
 *
 * The originals mapped the cursor position *absolutely* onto the pad
 * (`x = (pointer - centre) / radius`), so the dot teleported to the click
 * point and a single pixel of movement was ~1/44th of full scale. That is
 * why the wheels felt twitchy.
 *
 * These wheels now use **relative** dragging: the value moves in proportion
 * to how far the pointer has travelled since the press, never jumping to the
 * cursor. Everything below only affects feel — no colour maths is touched.
 * ------------------------------------------------------------------ */

/** Wheel-units of travel per full radius of cursor movement. Lower = finer. */
const SENSITIVITY = 0.32;

/** Shift multiplier. 8x sits inside the requested 5-10x window. */
const FINE_FACTOR = 8;

/** Movement under this many px is a click, never a drag (stops accidental edits). */
const DRAG_THRESHOLD_PX = 3;

/** Beyond this radius the response is cushioned instead of hard-clamped. */
const SOFT_EDGE = 0.88;

/** Double-click window, shared by "reset pad". */
const DOUBLE_CLICK_MS = 280;

interface DragSession {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  /** The pad value when the drag began — deltas are always measured from here. */
  startWheel: Wheel;
  moved: boolean;
  fine: boolean;
}

/**
 * Map a pointer delta onto the pad.
 *
 * The response is exactly 1:1 in wheel units inside the disc, so positioning
 * stays predictable and a drag that starts at a non-neutral value never
 * lurches. Only *overshoot* past the rim is cushioned, asymptotically, so
 * hitting the edge feels analog rather than like a hard stop — and never
 * snaps back.
 */
function projectDrag(session: DragSession, dx: number, dy: number, radiusPx: number): Wheel {
  const sens = session.fine ? SENSITIVITY / FINE_FACTOR : SENSITIVITY;
  const perPixel = sens / radiusPx;

  let x = session.startWheel.x + dx * perPixel;
  let y = session.startWheel.y - dy * perPixel; // screen y grows downward

  const r = Math.hypot(x, y);
  if (r > 1) {
    // tanh() is C1-continuous with the identity at r = 1, so there is no
    // derivative discontinuity (and therefore no visible "kick") at the rim.
    const eased = 1 + Math.tanh(r - 1) * 0.35;
    x = (x / r) * eased;
    y = (y / r) * eased;
  }
  return { ...session.startWheel, x, y };
}

/* ------------------------------------------------------------------ *
 * Hue disc (cached — the expanded wheel is 360px and must stay smooth)
 * ------------------------------------------------------------------ */

const discCache = new Map<number, HTMLCanvasElement>();

function getDiscCanvas(px: number): HTMLCanvasElement {
  const cached = discCache.get(px);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const img = ctx.createImageData(px, px);
  const c = px / 2;
  const r = px / 2 - 1;

  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const dx = (x + 0.5 - c) / r;
      const dy = -(y + 0.5 - c) / r; // y up
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;

      const o = (y * px + x) * 4;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const hue = (((90 - angle) % 360) + 360) % 360;
      const rgb = hsvToRgb(hue, 1, 1);
      const edge = Math.min(1, (1 - d) * r);
      img.data[o] = rgb.r * 255;
      img.data[o + 1] = rgb.g * 255;
      img.data[o + 2] = rgb.b * 255;
      img.data[o + 3] = edge * 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Neutral centre ring
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.16, 0, Math.PI * 2);
  ctx.stroke();

  discCache.set(px, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ *
 * Master slider (shared by the inline wheel and the precision overlay)
 * ------------------------------------------------------------------ */

interface MasterSliderProps {
  value: Wheel;
  onChange: (w: Wheel) => void;
  large?: boolean;
}

const MasterSlider: React.FC<MasterSliderProps> = ({ value, onChange, large = false }) => {
  const percent = ((value.master + 1) / 2) * 100;

  return (
    <div className={`w-full flex items-center ${large ? 'gap-3' : 'gap-2'}`}>
      {large && (
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-14">
          Master
        </span>
      )}
      <div className={`relative flex-1 flex items-center group ${large ? 'h-6' : 'h-3'}`}>
        <div
          className={`absolute w-full bg-secondary rounded-full overflow-hidden ${
            large ? 'h-1' : 'h-[2px]'
          }`}
        >
          <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <input
          type="range"
          min={-1}
          max={1}
          step={large ? 0.001 : 0.005}
          value={value.master}
          onChange={(e) => onChange({ ...value, master: parseFloat(e.target.value) })}
          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
          aria-label="Master"
        />
        <div
          className={`absolute bg-background border-2 border-primary rounded-full pointer-events-none ${
            large ? 'h-5 w-5' : 'h-3 w-3'
          }`}
          style={{ left: `calc(${percent}% - ${large ? 10 : 6}px)` }}
        />
      </div>
      <span
        className={`font-mono text-muted-foreground tabular-nums ${
          large ? 'text-xs w-16 text-right' : 'text-[9px] w-7 text-right'
        }`}
      >
        {value.master >= 0 ? '+' : ''}
        {value.master.toFixed(large ? 3 : 2)}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Wheel pad — the interactive disc
 * ------------------------------------------------------------------ */

interface WheelPadProps {
  label: string;
  value: Wheel;
  size: number;
  disabled?: boolean;
  onChange: (w: Wheel) => void;
  /** A click that did not drag. */
  onActivate?: () => void;
  /** A double-click (resets the pad). */
  onReset?: () => void;
  onFineChange?: (fine: boolean) => void;
}

const WheelPad: React.FC<WheelPadProps> = ({
  label,
  value,
  size,
  disabled = false,
  onChange,
  onActivate,
  onReset,
  onFineChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const lastClickRef = useRef(0);

  const radiusPx = Math.max(1, size / 2 - 1);

  /* ---------------- drawing ---------------- */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);

    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, px, px);

    // Static hue disc is cached, so dragging only redraws the dot.
    ctx.drawImage(getDiscCanvas(px), 0, 0);

    const c = px / 2;
    const r = px / 2 - 1;
    const dotR = Math.max(4, size * 0.062);

    ctx.beginPath();
    ctx.arc(c + value.x * r, c - value.y * r, dotR * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.6 * dpr;
    ctx.stroke();
  }, [size, value.x, value.y]);

  /* ---------------- interaction ---------------- */

  const endSession = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    onFineChange?.(false);

    const el = e.currentTarget;
    if (el.releasePointerCapture && el.hasPointerCapture?.(session.pointerId)) {
      el.releasePointerCapture(session.pointerId);
    }
    return session;
  }, [onFineChange]);

  const handleClick = useCallback(() => {
    const now = performance.now();
    if (now - lastClickRef.current < DOUBLE_CLICK_MS) {
      // Second click inside the window: reset, and cancel the pending open.
      lastClickRef.current = 0;
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onReset?.();
      return;
    }

    lastClickRef.current = now;
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      onActivate?.();
    }, DOUBLE_CLICK_MS);
  }, [onActivate, onReset]);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    sessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startWheel: value,
      moved: false,
      fine: e.shiftKey,
    };
    if (e.shiftKey) onFineChange?.(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;

    // Below the threshold nothing is committed at all — this is what makes a
    // plain click safe.
    if (!session.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    session.moved = true;

    if (e.shiftKey !== session.fine) {
      session.fine = e.shiftKey;
      onFineChange?.(e.shiftKey);
    }

    onChange(projectDrag(session, dx, dy, radiusPx));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const session = endSession(e);
    if (session && !session.moved) handleClick();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    endSession(e);
  };

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, touchAction: 'none' }}
      className={`rounded-full border border-border/70 ${
        disabled ? 'opacity-60' : 'cursor-crosshair'
      }`}
      aria-label={`${label} colour wheel`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    />
  );
};

/* ------------------------------------------------------------------ *
 * Precision panel (floating, non-blocking)
 *
 * This used to be a full-screen modal with a dark, blurred backdrop, which
 * hid the very footage you are grading. It is now a compact draggable panel
 * with no backdrop at all: the preview, compare modes, scopes and every other
 * control stay visible, sharp and interactive while you drag.
 * ------------------------------------------------------------------ */

interface PrecisionOverlayProps {
  label: string;
  value: Wheel;
  onChange: (w: Wheel) => void;
  onClose: () => void;
  /** The inline wheel for this channel; presses inside it are not "outside". */
  ignoreRef?: React.RefObject<HTMLElement | null>;
}

/** Wheel diameter inside the panel (still within the 320-400px target). */
const PRECISION_SIZE = 320;

/** Gap kept between the panel and the viewport edges. */
const PANEL_MARGIN = 16;

interface PanelPos {
  x: number;
  y: number;
}

const PrecisionOverlay: React.FC<PrecisionOverlayProps> = ({
  label,
  value,
  onChange,
  onClose,
  ignoreRef,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [fine, setFine] = useState(false);
  // Viewport coordinates. Null until the panel has been measured, so the very
  // first paint can place it from its real size (layout effect, pre-paint).
  const [pos, setPos] = useState<PanelPos | null>(null);

  /* -------------------- placement -------------------- */

  const clampToViewport = useCallback((x: number, y: number): PanelPos => {
    const el = panelRef.current;
    const w = el ? el.offsetWidth : PRECISION_SIZE;
    const h = el ? el.offsetHeight : PRECISION_SIZE;
    const maxX = Math.max(PANEL_MARGIN, window.innerWidth - w - PANEL_MARGIN);
    const maxY = Math.max(PANEL_MARGIN, window.innerHeight - h - PANEL_MARGIN);
    return {
      x: Math.min(Math.max(PANEL_MARGIN, x), maxX),
      y: Math.min(Math.max(PANEL_MARGIN, y), maxY),
    };
  }, []);

  // Default to the bottom-left. On desktop that lands over the controls
  // sidebar, so the preview is never covered on open.
  useLayoutEffect(() => {
    setPos((current) => current ?? clampToViewport(PANEL_MARGIN, window.innerHeight));
  }, [clampToViewport]);

  useEffect(() => {
    const onResize = () =>
      setPos((current) => (current ? clampToViewport(current.x, current.y) : current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampToViewport]);

  /* -------------------- dismissal -------------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Click-outside closes. Capture phase so it also fires for elements that
  // stop propagation, but the inline wheel is exempt — adjusting it keeps the
  // panel open.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (ignoreRef?.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    return () => window.removeEventListener('pointerdown', onDown, true);
  }, [onClose, ignoreRef]);

  /* -------------------- panel dragging -------------------- */

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    // Let the close button behave like a button.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const origin = pos ?? { x: PANEL_MARGIN, y: PANEL_MARGIN };
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: origin.x,
      originY: origin.y,
    };
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    setPos(
      clampToViewport(
        drag.originX + (e.clientX - drag.startX),
        drag.originY + (e.clientY - drag.startY),
      ),
    );
  };

  const endHeaderDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    const el = e.currentTarget;
    if (el.releasePointerCapture && el.hasPointerCapture?.(drag.id)) {
      el.releasePointerCapture(drag.id);
    }
  };

  /* -------------------- render -------------------- */

  const deltas = wheelToRgb(value);
  const active = value.x !== 0 || value.y !== 0 || value.master !== 0;
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(3)}`;

  // Portal to <body>: the sidebar is a z-10 stacking context, so a panel
  // rendered in place would paint underneath the preview / scope overlays.
  const panel = (
    <div
      ref={panelRef}
      className="fixed z-[200] w-[352px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto scrollbar-hide bg-card border border-border rounded-xl shadow-2xl shadow-black/60 p-4"
      style={{
        left: pos ? pos.x : PANEL_MARGIN,
        top: pos ? pos.y : PANEL_MARGIN,
        visibility: pos ? 'visible' : 'hidden',
      }}
      role="dialog"
      aria-label={`${label} precision wheel`}
    >
      {/* Header — also the drag handle */}
      <div
        className="flex items-center justify-between mb-3 select-none cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endHeaderDrag}
        onPointerCancel={endHeaderDrag}
        title="Drag to reposition"
      >
        <div className="flex items-center gap-2 min-w-0">
          <i className="fa-solid fa-grip-vertical text-[10px] text-muted-foreground/40"></i>
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-widest">
            {label}
          </span>
          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-widest">
            Precision
          </span>
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border transition-opacity ${
              fine ? 'opacity-100 border-primary/60 text-primary' : 'opacity-0 border-transparent'
            }`}
          >
            FINE {FINE_FACTOR}×
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 shrink-0 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          title="Close (Esc)"
          aria-label="Close"
        >
          <i className="fa-solid fa-xmark text-xs"></i>
        </button>
      </div>

      {/* Wheel */}
      <div className="flex justify-center">
        <WheelPad
          label={label}
          value={value}
          size={PRECISION_SIZE}
          onChange={onChange}
          onReset={() => onChange({ ...value, x: 0, y: 0 })}
          onFineChange={setFine}
        />
      </div>

      {/* Master */}
      <div className="mt-4">
        <MasterSlider value={value} onChange={onChange} large />
      </div>

      {/* Numeric readout */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: 'X', v: value.x },
          { k: 'Y', v: value.y },
          { k: 'Master', v: value.master },
        ].map(({ k, v }) => (
          <div key={k} className="bg-secondary/60 border border-border rounded-md px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
            <div className="text-[13px] font-mono tabular-nums text-foreground">{fmt(v)}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between px-0.5">
        <span className="text-[9px] font-mono text-muted-foreground/70">
          ΔR {fmt(deltas.r)} · ΔG {fmt(deltas.g)} · ΔB {fmt(deltas.b)}
        </span>
        <button
          onClick={() => onChange({ x: 0, y: 0, master: 0 })}
          disabled={!active}
          className={`text-[9px] transition-all ${
            active ? 'text-muted-foreground hover:text-primary' : 'opacity-0 pointer-events-none'
          }`}
        >
          <i className="fa-solid fa-rotate-left mr-1"></i>Reset wheel
        </button>
      </div>

      <p className="mt-2.5 text-[9px] text-muted-foreground/60 leading-relaxed">
        Relative drag · <kbd className="px-1 bg-secondary rounded font-mono">Shift</kbd> ={' '}
        {FINE_FACTOR}× fine · double-click resets the pad · drag the header to move · Esc closes
      </p>
    </div>
  );

  return createPortal(panel, document.body);
};

/* ------------------------------------------------------------------ *
 * Colour wheel (inline control + precision overlay)
 * ------------------------------------------------------------------ */

interface ColorWheelProps {
  label: string;
  value: Wheel;
  onChange: (w: Wheel) => void;
  disabled?: boolean;
  /** Logical size in CSS pixels. */
  size?: number;
}

/**
 * A Resolve-style trackball.
 *
 * The disc is drawn with red at 12 o'clock running clockwise — the same channel
 * orientation `wheelToRgb` projects onto, so what you see is where you push.
 * Dragging tints relatively; the master slider shifts luminance.
 */
const ColorWheel: React.FC<ColorWheelProps> = ({
  label,
  value,
  onChange,
  disabled = false,
  size = 88,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const active = value.x !== 0 || value.y !== 0 || value.master !== 0;

  return (
    <div
      ref={rootRef}
      className={`flex flex-col items-center gap-1.5 ${
        disabled ? 'opacity-30 pointer-events-none' : ''
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        <button
          onClick={() => onChange({ x: 0, y: 0, master: 0 })}
          className={`text-[9px] text-muted-foreground hover:text-primary transition-all ${
            active ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          title="Reset"
        >
          <i className="fa-solid fa-rotate-left"></i>
        </button>
      </div>

      <WheelPad
        label={label}
        value={value}
        size={size}
        disabled={disabled}
        onChange={onChange}
        onActivate={() => setExpanded(true)}
        onReset={() => onChange({ ...value, x: 0, y: 0 })}
      />

      <MasterSlider value={value} onChange={onChange} />

      {expanded && !disabled && (
        <PrecisionOverlay
          label={label}
          value={value}
          onChange={onChange}
          onClose={() => setExpanded(false)}
          ignoreRef={rootRef}
        />
      )}
    </div>
  );
};

export default ColorWheel;
