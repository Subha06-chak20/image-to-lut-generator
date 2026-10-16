import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { applyLUTToImage } from '../services/lutGenerator';
import { loadLUT } from '../services/lut/load';
import { rgbToLab } from '../services/color/conversions';
import { GradeParams } from '../services/gpu/gradeParams';
import { LUTRenderer } from '../services/render/webgl';
import { LAB, RGB } from '../types';

export type RenderMode = 'gpu' | 'cpu';

interface PreviewSectionProps {
  sampleImage: string;
  lutData: string | null;
  /**
   * The grade as shader uniforms. When present the GPU backend evaluates the
   * grade directly and `lutData` is not consulted at all; when absent it falls
   * back to sampling the baked LUT, so both paths stay available.
   */
  gradeParams?: GradeParams | null;
  isProcessing: boolean;
  /** User preference: run the WebGL2 pipeline when the browser allows it. */
  gpuEnabled?: boolean;
  /** Reports which backend is actually painting, and why it fell back. */
  onRendererChange?: (state: { mode: RenderMode; fallback: string | null; pending: boolean }) => void;
  /**
   * Called after every committed render with the preview canvas and a version
   * counter. The scopes consume this instead of a baked LUT, so nothing has to
   * be baked on the GPU parameter path just to keep them live.
   */
  onRender?: (canvas: HTMLCanvasElement | null, version: number) => void;
}

type CompareMode = 'wipe' | 'toggle' | 'side';

interface Readout {
  x: number;
  y: number;
  orig: RGB;
  graded: RGB;
  origLab: LAB;
  gradedLab: LAB;
}

interface Swatch {
  hex: string;
  rgb: RGB;
}

const to255 = (c: RGB) => ({
  r: Math.round(Math.max(0, Math.min(1, c.r)) * 255),
  g: Math.round(Math.max(0, Math.min(1, c.g)) * 255),
  b: Math.round(Math.max(0, Math.min(1, c.b)) * 255),
});

const toHex = (c: RGB): string => {
  const v = to255(c);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(v.r)}${h(v.g)}${h(v.b)}`;
};

const fmtLab = (lab: LAB) => `${lab.l.toFixed(1)} ${lab.a.toFixed(1)} ${lab.b.toFixed(1)}`;

/* ------------------------------------------------------------------ *
 * Viewer geometry
 *
 * Zoom is modelled as an absolute display scale: `scale` is screen pixels
 * per image pixel, so 100% really is 1:1 and "Fit" is whatever the layout
 * happens to produce. Pan is the offset of the image centre from the
 * viewport centre, in screen pixels.
 *
 * Nothing here touches the renderer: the graded canvas is always rasterised
 * at the image's native resolution and only the *presentation* layer is
 * transformed, so zooming never re-samples or degrades the grade.
 * ------------------------------------------------------------------ */

interface Pan {
  x: number;
  y: number;
}

interface ViewState {
  /** `fit` follows the auto-fit scale; `fixed` pins an absolute percentage. */
  mode: 'fit' | 'fixed';
  /** Absolute zoom in percent — 100 shows one image pixel per screen pixel. */
  pct: number;
  x: number;
  y: number;
}

const ZOOM_PRESETS = [50, 100, 150, 200, 300, 400];

/** Absolute scale limits (the Fit scale always overrides them if more extreme). */
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;

/** Wheel sensitivity (per normalised pixel of deltaY). */
const WHEEL_ZOOM_RATE = 0.0018;

const clampScale = (scale: number, fitScale: number) =>
  Math.min(
    Math.max(scale, Math.min(MIN_SCALE, fitScale)),
    Math.max(MAX_SCALE, fitScale),
  );

/**
 * Keep the image anchored to the viewport. Along an axis where the scaled
 * image is smaller than the viewport the offset collapses to 0 (centred);
 * otherwise the image edges may not travel inside the viewport, so the user
 * can never lose the image.
 */
const clampPan = (
  pan: Pan,
  scale: number,
  imgW: number,
  imgH: number,
  vw: number,
  vh: number,
): Pan => {
  const maxX = Math.max(0, (imgW * scale - vw) / 2);
  const maxY = Math.max(0, (imgH * scale - vh) / 2);
  const x = Math.min(Math.max(pan.x, -maxX), maxX);
  const y = Math.min(Math.max(pan.y, -maxY), maxY);
  return x === pan.x && y === pan.y ? pan : { x, y };
};

const PreviewSection: React.FC<PreviewSectionProps> = ({
  sampleImage,
  lutData,
  gradeParams,
  isProcessing,
  gpuEnabled = true,
  onRendererChange,
  onRender,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sampleImgRef = useRef<HTMLImageElement>(null);
  const displayImgRef = useRef<HTMLImageElement>(null);
  const probeRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<LUTRenderer | null>(null);

  // Kept in refs so the render effects never need `onRender` in their deps.
  const onRenderRef = useRef(onRender);
  const renderVersionRef = useRef(0);
  useEffect(() => {
    onRenderRef.current = onRender;
  }, [onRender]);

  /** Announce a finished frame so downstream consumers can re-read the canvas. */
  const commitRender = useCallback(() => {
    renderVersionRef.current += 1;
    onRenderRef.current?.(canvasRef.current, renderVersionRef.current);
  }, []);

  const gpuSupported = useMemo(() => LUTRenderer.isSupported(), []);
  /** Keeps us on the CPU until the user retries; see the toast below. */
  const [gpuFailure, setGpuFailure] = useState<string | null>(null);
  /** Toast visibility, independent of the latch above. */
  const [gpuNotice, setGpuNotice] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<RenderMode>(() =>
    gpuEnabled && gpuSupported ? 'gpu' : 'cpu',
  );
  const [canvasKey, setCanvasKey] = useState(0);
  /** Bumped once the `<img>` backing the preview has decoded, so the upload
   *  effect can depend on a real readiness signal instead of polling. */
  const [imageToken, setImageToken] = useState(0);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<CompareMode>('wipe');
  const [showOriginal, setShowOriginal] = useState(false);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [swatches, setSwatches] = useState<Swatch[]>([]);

  /* ---------------- viewer state ---------------- */

  // The auto-fit scale, measured from the laid-out image (offsetWidth is a
  // layout metric, so the presentation transform never distorts it).
  const [fitScale, setFitScale] = useState(1);
  const fitScaleRef = useRef(1);

  // `viewRef` is the source of truth so wheel/pointer handlers can never read a
  // stale value, and `view` mirrors it for rendering.
  const [view, setView] = useState<ViewState>({ mode: 'fit', pct: 100, x: 0, y: 0 });
  const viewRef = useRef(view);

  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [smooth, setSmooth] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const transitioningRef = useRef(false);

  const panSessionRef = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  );
  const hoverRef = useRef(false);
  const smoothTimerRef = useRef<number | null>(null);

  const envOf = useCallback(() => {
    const vp = containerRef.current;
    const src = sampleImgRef.current;
    if (!vp || !src || !src.naturalWidth) return null;
    const r = vp.getBoundingClientRect();
    return { iw: src.naturalWidth, ih: src.naturalHeight, vw: r.width, vh: r.height };
  }, []);

  const scaleOf = useCallback(
    (v: ViewState) => (v.mode === 'fit' ? fitScaleRef.current : v.pct / 100),
    [],
  );

  /** Single commit point: always re-clamps against the current viewport. */
  const applyView = useCallback(
    (next: ViewState) => {
      const env = envOf();
      if (env) {
        const scale = next.mode === 'fit' ? fitScaleRef.current : next.pct / 100;
        const p = clampPan({ x: next.x, y: next.y }, scale, env.iw, env.ih, env.vw, env.vh);
        next = { ...next, x: p.x, y: p.y };
      }
      viewRef.current = next;
      setView(next);
    },
    [envOf],
  );

  const animate = useCallback(() => {
    setSmooth(true);
    transitioningRef.current = true;
    if (smoothTimerRef.current !== null) window.clearTimeout(smoothTimerRef.current);
    smoothTimerRef.current = window.setTimeout(() => {
      smoothTimerRef.current = null;
      transitioningRef.current = false;
      setSmooth(false);
    }, 220);
  }, []);

  /* ---------------- rendering ----------------
   *
   * Deliberately two effects instead of one. The image texture is the expensive
   * upload (a 4K still is ~33 MB), so it must NOT be re-transferred every time a
   * grading parameter moves; only the LUT changes on those frames. Keeping the
   * upload keyed on the image keeps slider response smooth.
   *
   * Both backends consume the same `lutData`, so nothing about the grade maths
   * is duplicated per renderer.
   */

  // Readiness signal for the source `<img>`.
  useEffect(() => {
    const img = sampleImgRef.current;
    if (!img) return;
    if (img.complete && img.naturalWidth > 0) {
      setImageToken((t) => t + 1);
      return;
    }
    const onReady = () => setImageToken((t) => t + 1);
    img.addEventListener('load', onReady);
    img.addEventListener('error', onReady);
    return () => {
      img.removeEventListener('load', onReady);
      img.removeEventListener('error', onReady);
    };
  }, [sampleImage]);

  // The latch (`gpuFailure`) keeps us off the GPU; the notice is only the
  // visible toast. Keeping them separate matters: dismissing the toast must not
  // re-arm the GPU, or a broken context would retry-and-fail in a loop.
  useEffect(() => {
    if (gpuEnabled && gpuSupported) {
      setGpuFailure(null);
      setGpuNotice(null);
    } else if (!gpuEnabled && gpuSupported) {
      setGpuNotice('GPU acceleration is off — rendering on the CPU.');
    }
  }, [gpuEnabled, gpuSupported]);

  // Fall back to the CPU path when the GPU is unavailable, disabled, or dies.
  //
  // A canvas bound to one context type can never hand out the other, so a
  // backend switch always needs a fresh element. Switching to the CPU also needs
  // a baked LUT — but the GPU frame already on screen is correct, so we hold the
  // switch until the lattice arrives rather than remounting into an ungraded
  // flash. `pending` tells the shell to bake for us in the meantime.
  const wantedMode: RenderMode = gpuEnabled && gpuSupported && !gpuFailure ? 'gpu' : 'cpu';
  const cpuPending =
    wantedMode === 'cpu' && renderMode === 'gpu' && !!gradeParams && !lutData;

  useEffect(() => {
    if (wantedMode === renderMode) return;
    if (cpuPending) return;
    setRenderMode(wantedMode);
    setCanvasKey((k) => k + 1);
  }, [wantedMode, renderMode, cpuPending]);

  // Surface the effective backend (and any fallback) to the shell.
  useEffect(() => {
    onRendererChange?.({ mode: renderMode, fallback: gpuFailure, pending: cpuPending });
  }, [renderMode, gpuFailure, cpuPending, onRendererChange]);

  // Tear the old renderer down whenever the canvas is replaced or the backend
  // changes. React runs this cleanup before the mount effects of the same
  // commit, so the upload effect below always sees a clean canvas.
  useEffect(() => {
    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [renderMode, canvasKey]);

  const failGpu = useCallback((message: string) => {
    // The latch alone is enough: the fall-back effect below reacts to it and
    // performs the single canvas remount the context switch needs.
    setGpuFailure(message);
    setGpuNotice(message);
  }, []);

  // Informational, not blocking: the toast goes away on its own.
  useEffect(() => {
    if (!gpuNotice) return;
    const timer = window.setTimeout(() => setGpuNotice(null), 9000);
    return () => window.clearTimeout(timer);
  }, [gpuNotice]);

  // Image upload — only runs for a new image, a new canvas or a backend change.
  useEffect(() => {
    const img = sampleImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth || !imageToken) return;

    setResolution({ w: img.naturalWidth, h: img.naturalHeight });

    if (renderMode !== 'gpu') return;

    if (!rendererRef.current) {
      try {
        const renderer = new LUTRenderer(canvas);
        renderer.onContextLost = () => {
          failGpu('The GPU context was lost, so colour grading moved to the CPU.');
        };
        rendererRef.current = renderer;
      } catch (err) {
        console.error('GPU renderer init failed, switching to CPU:', err);
        rendererRef.current = null;
        failGpu('WebGL2 could not be initialised, so colour grading moved to the CPU.');
        return;
      }
    }

    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setImage(img, img.naturalWidth, img.naturalHeight);
    renderer.render();
    commitRender();
  }, [sampleImage, imageToken, renderMode, canvasKey, failGpu, commitRender]);

  // Grade application — a handful of uniform writes on the GPU parameter path,
  // a single LUT sample on the GPU LUT path, and a full re-composite on the CPU.
  useEffect(() => {
    const img = sampleImgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth || !imageToken) return;

    if (renderMode === 'gpu') {
      const renderer = rendererRef.current;
      if (!renderer) return; // the upload effect owns construction
      if (gradeParams) {
        renderer.setGradeParams(gradeParams);
      } else {
        renderer.setLUT(loadLUT(lutData));
        renderer.render();
      }
      commitRender();
      return;
    }

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    applyLUTToImage(canvas, img, loadLUT(lutData));
    commitRender();
  }, [lutData, gradeParams, imageToken, renderMode, canvasKey, commitRender]);

  /* ---------------- fit measurement ---------------- */

  useLayoutEffect(() => {
    const measure = () => {
      const img = displayImgRef.current;
      if (!img || !img.naturalWidth) return;
      // Never measure mid-transition, or we would fit against an animating box.
      if (transitioningRef.current) return;

      // `offsetWidth` is integer-rounded, which would make 1:1 land a pixel off
      // on large images. The bounding rect is exact but already carries the
      // presentation transform, so divide that back out.
      const v = viewRef.current;
      const scale = v.mode === 'fit' ? fitScaleRef.current : v.pct / 100;
      const rel = fitScaleRef.current > 0 ? scale / fitScaleRef.current : 1;
      const layoutW = img.getBoundingClientRect().width / (rel || 1);
      if (!layoutW) return;

      const next = layoutW / img.naturalWidth;
      if (Math.abs(next - fitScaleRef.current) > 1e-4) {
        fitScaleRef.current = next;
        setFitScale(next);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (displayImgRef.current) ro.observe(displayImgRef.current);
    return () => ro.disconnect();
  }, [mode, sampleImage, resolution, renderMode, canvasKey]);

  // Re-clamp after a resize / mode switch without resetting the chosen zoom.
  useLayoutEffect(() => {
    const v = viewRef.current;
    const env = envOf();
    if (!env) return;
    const scale = v.mode === 'fit' ? fitScaleRef.current : v.pct / 100;
    const p = clampPan({ x: v.x, y: v.y }, scale, env.iw, env.ih, env.vw, env.vh);
    if (p.x !== v.x || p.y !== v.y) applyView({ ...v, x: p.x, y: p.y });
  }, [fitScale, mode, resolution, envOf, applyView]);

  /* ---------------- wheel zoom (over the preview only) ---------------- */

  useEffect(() => {
    const vp = containerRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      // Only this element listens, so panels elsewhere scroll normally.
      e.preventDefault();
      const env = envOf();
      if (!env) return;

      const rect = vp.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2;
      const centreY = rect.top + rect.height / 2;

      // Normalise line/page deltas so mice and trackpads feel the same.
      const dy =
        e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * env.vh : e.deltaY;

      const v = viewRef.current;
      const scale = scaleOf(v);
      const next = clampScale(scale * Math.exp(-dy * WHEEL_ZOOM_RATE), fitScaleRef.current);
      if (Math.abs(next - scale) < 1e-6) return;

      // Keep the image point under the cursor pinned: O' = O + d·(1 − k).
      const k = next / scale;
      const dx = e.clientX - centreX - v.x;
      const dyy = e.clientY - centreY - v.y;

      setSmooth(false);
      applyView({
        mode: 'fixed',
        pct: next * 100,
        x: v.x + dx * (1 - k),
        y: v.y + dyy * (1 - k),
      });
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [envOf, scaleOf, applyView]);

  /* ---------------- zoom commands ---------------- */

  const setPct = useCallback(
    (pct: number) => {
      animate();
      applyView({ ...viewRef.current, mode: 'fixed', pct });
    },
    [animate, applyView],
  );

  const fitToScreen = useCallback(() => {
    animate();
    // Fit resets zoom *and* recentres.
    applyView({ mode: 'fit', pct: 100, x: 0, y: 0 });
  }, [animate, applyView]);

  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      const v = viewRef.current;
      const current = v.mode === 'fit' ? fitScaleRef.current * 100 : v.pct;
      if (dir === 1) {
        const next = ZOOM_PRESETS.find((p) => p > current + 0.5);
        setPct(next ?? ZOOM_PRESETS[ZOOM_PRESETS.length - 1]);
      } else {
        const lower = ZOOM_PRESETS.filter((p) => p < current - 0.5);
        // Below the lowest preset there is nowhere left but Fit.
        if (lower.length === 0) fitToScreen();
        else setPct(lower[lower.length - 1]);
      }
    },
    [fitToScreen, setPct],
  );

  // Dismiss the zoom preset menu on an outside press or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-zoom-menu]')) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  /* ---------------- space-to-pan ---------------- */

  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isEditable(e.target)) return;
      // Only swallow the key while the cursor is over the preview so the rest
      // of the app keeps its normal keyboard behaviour.
      if (hoverRef.current) e.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      setSpaceHeld(false);
    };
    const release = () => setSpaceHeld(false);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', release);
    };
  }, []);

  /* ---------------- pan ---------------- */

  const endPan = useCallback((el?: Element | null, pointerId?: number) => {
    const session = panSessionRef.current;
    if (!session) return;
    panSessionRef.current = null;
    setPanning(false);
    if (el && pointerId !== undefined) {
      const target = el as HTMLElement;
      if (target.releasePointerCapture && target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const wantsPan = e.button === 1 || (e.button === 0 && spaceHeld);
    if (!wantsPan) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = viewRef.current;
    panSessionRef.current = {
      id: e.pointerId,
      sx: e.clientX,
      sy: e.clientY,
      ox: v.x,
      oy: v.y,
    };
    setPanning(true);
    setSmooth(false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current;
    if (!session || session.id !== e.pointerId) return;
    e.preventDefault();
    applyView({
      ...viewRef.current,
      x: session.ox + (e.clientX - session.sx),
      y: session.oy + (e.clientY - session.sy),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    endPan(e.currentTarget, e.pointerId);
  };

  useEffect(() => {
    return () => {
      if (smoothTimerRef.current !== null) window.clearTimeout(smoothTimerRef.current);
    };
  }, []);

  /* ---------------- probe / wipe (unchanged behaviour) ---------------- */

  const handleMove = (xPos: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = ((xPos - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  };

  /** Sample the original + graded pixel under the cursor. */
  const probe = useCallback(
    (clientX: number, clientY: number) => {
      const display = displayImgRef.current;
      const source = sampleImgRef.current;
      if (!display || !source || !source.naturalWidth) return;

      // getBoundingClientRect already includes the zoom/pan transform, so the
      // normalised coordinates stay correct at any magnification.
      const rect = display.getBoundingClientRect();
      const fx = (clientX - rect.left) / rect.width;
      const fy = (clientY - rect.top) / rect.height;
      if (fx < 0 || fx > 1 || fy < 0 || fy > 1) {
        setReadout(null);
        return;
      }

      const px = Math.min(source.naturalWidth - 1, Math.max(0, Math.floor(fx * source.naturalWidth)));
      const py = Math.min(source.naturalHeight - 1, Math.max(0, Math.floor(fy * source.naturalHeight)));

      if (!probeRef.current) {
        probeRef.current = document.createElement('canvas');
        probeRef.current.width = 1;
        probeRef.current.height = 1;
      }
      const pctx = probeRef.current.getContext('2d', { willReadFrequently: true });
      if (!pctx) return;

      let orig: RGB;
      let graded: RGB;
      try {
        pctx.clearRect(0, 0, 1, 1);
        pctx.drawImage(source, px, py, 1, 1, 0, 0, 1, 1);
        const d = pctx.getImageData(0, 0, 1, 1).data;
        orig = { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255 };

        // The graded value is read straight off the rendered preview, so the
        // readout matches the pixels actually on screen for any backend — and
        // needs no baked LUT to be available.
        graded = orig;
        const gradedCanvas = canvasRef.current;
        if (
          gradedCanvas &&
          gradedCanvas.width === source.naturalWidth &&
          gradedCanvas.height === source.naturalHeight
        ) {
          pctx.clearRect(0, 0, 1, 1);
          pctx.drawImage(gradedCanvas, px, py, 1, 1, 0, 0, 1, 1);
          const gd = pctx.getImageData(0, 0, 1, 1).data;
          graded = { r: gd[0] / 255, g: gd[1] / 255, b: gd[2] / 255 };
        }
      } catch {
        setReadout(null);
        return;
      }

      setReadout({
        x: px,
        y: py,
        orig,
        graded,
        origLab: rgbToLab(orig),
        gradedLab: rgbToLab(graded),
      });
    },
    [],
  );

  const pinSwatch = useCallback(() => {
    if (!readout) return;
    const hex = toHex(readout.graded);
    setSwatches((s) => (s.some((x) => x.hex === hex) ? s : [...s, { hex, rgb: readout.graded }].slice(-8)));
  }, [readout]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (panSessionRef.current) return;
    if (isDragging && mode === 'wipe') handleMove(e.clientX);
    if (mode !== 'side') probe(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (mode === 'wipe') handleMove(e.touches[0].clientX);
    probe(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click belongs to panning; also stops Chrome's auto-scroll.
    if (e.button === 1) {
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    if (spaceHeld) return;
    if (e.shiftKey) {
      pinSwatch();
      return;
    }
    if (mode === 'wipe') setIsDragging(true);
  };

  /* ---------------- presentational transform ---------------- */

  const scale = view.mode === 'fit' ? fitScale : view.pct / 100;
  const rel = fitScale > 0 ? scale / fitScale : 1;

  const stageStyle: React.CSSProperties = {
    transform: `translate(${view.x}px, ${view.y}px) scale(${rel})`,
    transformOrigin: 'center center',
    transition: smooth ? 'transform 170ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
  };

  const stageClasses = 'absolute inset-0 flex items-center justify-center';

  const imageClasses = 'max-h-[38dvh] md:max-h-[78vh] max-w-full object-contain';

  const zoomLabel = view.mode === 'fit' ? 'Fit' : `${Math.round(view.pct)}%`;

  const cursor = panning
    ? 'cursor-grabbing'
    : spaceHeld
      ? 'cursor-grab'
      : mode === 'wipe'
        ? 'cursor-ew-resize'
        : 'cursor-crosshair';

  const toolButton =
    'px-2 py-1 rounded text-[10px] text-white/60 hover:text-white hover:bg-white/10 transition-colors';

  return (
    <div className="w-full h-full flex flex-col relative group select-none">
      {/* Toolbar: zoom + compare modes */}
      <div className="absolute top-3 right-3 z-40 flex flex-wrap items-center justify-end gap-1 max-w-[calc(100%-1.5rem)] bg-black/50 backdrop-blur-sm rounded-md p-1 border border-white/10">
        {/* Zoom cluster */}
        <div className="flex items-center gap-0.5">
          <button title="Zoom out (−)" onClick={() => stepZoom(-1)} className={toolButton}>
            <i className="fa-solid fa-minus"></i>
          </button>

          <div className="relative" data-zoom-menu>
            <button
              title="Zoom level"
              onClick={() => setMenuOpen((o) => !o)}
              className={`w-11 py-1 rounded text-[10px] font-mono transition-colors text-center ${
                menuOpen ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/10'
              }`}
            >
              {zoomLabel}
            </button>
            {menuOpen && (
              <div
                data-zoom-menu
                className="absolute right-0 top-full mt-1 z-50 min-w-[86px] bg-popover border border-border rounded-md shadow-xl shadow-black/20 py-1"
              >
                <button
                  onClick={() => {
                    fitToScreen();
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1 text-[10px] text-foreground/80 hover:bg-secondary transition-colors"
                >
                  Fit
                </button>
                {ZOOM_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPct(p);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1 text-[10px] font-mono transition-colors hover:bg-secondary ${
                      view.mode === 'fixed' && Math.abs(view.pct - p) < 0.5
                        ? 'text-primary'
                        : 'text-foreground/80'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            )}
          </div>

          <button title="Zoom in (+)" onClick={() => stepZoom(1)} className={toolButton}>
            <i className="fa-solid fa-plus"></i>
          </button>

          <button title="Fit to screen" onClick={fitToScreen} className={toolButton}>
            <i className="fa-solid fa-expand"></i>
          </button>

          <button title="100% actual pixels" onClick={() => setPct(100)} className={`${toolButton} font-mono w-7 text-center`}>
            1:1
          </button>
        </div>

        <span className="w-px h-4 bg-white/15 mx-0.5"></span>

        {/* Compare modes */}
        {([
          { id: 'wipe', icon: 'fa-left-right', title: 'Wipe' },
          { id: 'toggle', icon: 'fa-eye', title: 'A/B' },
          { id: 'side', icon: 'fa-table-columns', title: 'Side by side' },
        ] as { id: CompareMode; icon: string; title: string }[]).map((m) => (
          <button
            key={m.id}
            title={m.title}
            onClick={() => setMode(m.id)}
            className={`px-2 py-1 rounded text-[10px] transition-colors ${mode === m.id ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`}
          >
            <i className={`fa-solid ${m.icon}`}></i>
          </button>
        ))}
        {mode === 'toggle' && (
          <button
            onMouseDown={() => setShowOriginal(true)}
            onMouseUp={() => setShowOriginal(false)}
            onMouseLeave={() => setShowOriginal(false)}
            className="px-2 py-1 rounded text-[10px] bg-white/10 text-white/80 hover:bg-white/20 transition-colors"
            title="Hold to view original"
          >
            Hold: Original
          </button>
        )}
      </div>

      {/* Viewport */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden bg-zinc-950 ${cursor}`}
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseDown={handleMouseDown}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => {
          setIsDragging(false);
          setReadout(null);
          hoverRef.current = false;
        }}
        onPointerEnter={() => {
          hoverRef.current = true;
        }}
        onPointerLeave={() => {
          hoverRef.current = false;
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Hidden CORS-enabled source used for pixel probing + GPU upload */}
        <img
          ref={sampleImgRef}
          src={sampleImage}
          className="absolute opacity-0 pointer-events-none w-px h-px"
          crossOrigin="anonymous"
          alt=""
        />

        {mode === 'side' ? (
          // Two independent panes that share the same zoom and pan, so both
          // sides always show the same region for a fair A/B comparison.
          <div className="absolute inset-0 flex">
            <div className="relative flex-1 overflow-hidden flex items-center justify-center">
              <div className={stageClasses} style={stageStyle}>
                <img
                  ref={displayImgRef}
                  src={sampleImage}
                  className={imageClasses}
                  draggable={false}
                  alt="Original"
                />
              </div>
            </div>
            <div className="relative flex-1 overflow-hidden flex items-center justify-center">
              <div className={stageClasses} style={stageStyle}>
                <canvas key={canvasKey} ref={canvasRef} className={imageClasses} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Before — always fully visible */}
            <div className={stageClasses} style={stageStyle}>
              <img
                ref={displayImgRef}
                src={sampleImage}
                className={imageClasses}
                draggable={false}
                alt="Original"
              />
            </div>

            {/* After — clipped to the wipe position, sharing the same transform */}
            <div
              className="absolute inset-0"
              style={{
                clipPath:
                  mode === 'wipe'
                    ? `inset(0 0 0 ${sliderPos}%)`
                    : showOriginal
                      ? 'inset(0 0 0 100%)'
                      : 'none',
              }}
            >
              <div className={stageClasses} style={stageStyle}>
                <canvas key={canvasKey} ref={canvasRef} className={imageClasses} />
              </div>
            </div>

            {mode === 'wipe' && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-white/50 backdrop-blur-sm z-20 pointer-events-none"
                style={{ left: `${sliderPos}%` }}
              >
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                  <i className="fa-solid fa-left-right text-xs text-black"></i>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pixel readout */}
      {readout && mode !== 'side' && (
        <div className="absolute bottom-10 left-3 z-40 bg-black/70 backdrop-blur-sm rounded-md border border-white/10 px-3 py-2 space-y-1 pointer-events-none">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-white/20" style={{ background: toHex(readout.graded) }}></div>
            <span className="text-[9px] font-mono text-white/90">{toHex(readout.graded)}</span>
            <span className="text-[9px] font-mono text-white/40">graded</span>
          </div>
          <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-[9px] font-mono text-white/70">
            <span className="text-white/40">orig</span>
            <span>{to255(readout.orig).r} {to255(readout.orig).g} {to255(readout.orig).b}</span>
            <span className="text-white/40">grad</span>
            <span>{to255(readout.graded).r} {to255(readout.graded).g} {to255(readout.graded).b}</span>
            <span className="text-white/40">L*a*b*</span>
            <span>{fmtLab(readout.gradedLab)}</span>
            <span className="text-white/40">px</span>
            <span>{readout.x},{readout.y}</span>
          </div>
          <p className="text-[8px] text-white/30">Shift+Click to pin swatch</p>
        </div>
      )}

      {/* Pinned swatches */}
      {swatches.length > 0 && (
        <div className="absolute bottom-10 right-3 z-40 flex gap-1 bg-black/60 backdrop-blur-sm rounded-md border border-white/10 p-1.5">
          {swatches.map((s) => (
            <button
              key={s.hex}
              title={`${s.hex} — click to remove`}
              onClick={() => setSwatches((list) => list.filter((x) => x.hex !== s.hex))}
              className="w-5 h-5 rounded border border-white/20"
              style={{ background: s.hex }}
            ></button>
          ))}
        </div>
      )}

      {/* Non-intrusive fallback notice — floats over the viewer, auto-dismisses */}
      {gpuNotice && (
        <div className="absolute bottom-11 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/75 backdrop-blur-sm rounded-md border border-yellow-500/30 px-3 py-1.5 max-w-[80%] animate-fade-in">
          <i className="fa-solid fa-circle-info text-[10px] text-yellow-400/90 shrink-0"></i>
          <span className="text-[10px] text-white/85">{gpuNotice}</span>
          <button
            onClick={() => setGpuNotice(null)}
            className="text-white/50 hover:text-white/90 text-[10px] leading-none shrink-0"
            aria-label="Dismiss"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* Info Bar */}
      <div className="h-8 absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between px-4 pb-2 pointer-events-none">
        <div className="flex gap-4">
          <span className="text-[9px] font-medium text-white/70">
            {mode === 'side' ? 'Original | Graded' : 'Before'}
          </span>
          {mode !== 'side' && <span className="text-[9px] font-medium text-white/70">After</span>}
        </div>
        <div className="flex items-center gap-2">
          {resolution && (
            <span className="text-[9px] font-mono text-white/90 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
              {resolution.w} x {resolution.h}
            </span>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur-sm flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  );
};

export default PreviewSection;
