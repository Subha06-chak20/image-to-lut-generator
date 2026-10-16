import React, { useEffect, useRef, useState } from 'react';
import {
  COLOR_BAR_TARGETS,
  computeHistogram,
  computeParade,
  computeSkinTone,
  computeVectorScope,
  computeWaveform,
  Histogram,
  sampleImageData,
  ScopeImage,
  SKIN_TONE_ANGLE,
  SkinToneReading,
} from '../services/scopes/compute';

type ScopeTab = 'histogram' | 'waveform' | 'parade' | 'vector';
type ScopeSource = 'graded' | 'target' | 'reference';

interface ScopesPanelProps {
  sampleImage: string;
  /**
   * The rendered preview canvas — the graded frame at full image resolution.
   * Reading it directly means the scopes show exactly what is on screen for
   * either backend, and no LUT has to be baked just to feed them.
   */
  previewCanvas: HTMLCanvasElement | null;
  /** Bumped after each committed render so the scopes re-read the canvas. */
  gradeVersion: number;
  referenceImage: string | null;
}

interface SourceData {
  target: ImageData | null;
  graded: ImageData | null;
  reference: ImageData | null;
}

const MAX_WIDTH = 480;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function scopeImageToCanvas(src: ScopeImage, tint: [number, number, number]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = canvas.getContext('2d')!;
  const out = ctx.createImageData(src.width, src.height);
  const inv = 255 / src.max;
  for (let i = 0; i < src.data.length; i++) {
    let v = src.data[i] * inv;
    v = Math.sqrt(Math.max(0, Math.min(1, v)));
    const o = i * 4;
    out.data[o] = tint[0] * v;
    out.data[o + 1] = tint[1] * v;
    out.data[o + 2] = tint[2] * v;
    out.data[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

const ScopesPanel: React.FC<ScopesPanelProps> = ({ sampleImage, previewCanvas, gradeVersion, referenceImage }) => {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<ScopeTab>('waveform');
  const [source, setSource] = useState<ScopeSource>('graded');
  const [data, setData] = useState<SourceData>({ target: null, graded: null, reference: null });
  const [skin, setSkin] = useState<SkinToneReading | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Build analysis buffers for target / graded / reference.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const targetImg = await loadImage(sampleImage);
        const target = sampleImageData(targetImg, MAX_WIDTH);

        let graded: ImageData | null = null;
        // The graded scope is read straight off the rendered preview, so it
        // shows exactly what is on screen whichever backend painted it. Zoom and
        // pan are presentation transforms on the element, not the backing store,
        // so the canvas still holds the full frame at native resolution.
        if (previewCanvas && previewCanvas.width > 0 && previewCanvas.height > 0) {
          try {
            const scale = Math.min(1, MAX_WIDTH / previewCanvas.width);
            const w = Math.max(1, Math.round(previewCanvas.width * scale));
            const h = Math.max(1, Math.round(previewCanvas.height * scale));
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(previewCanvas, 0, 0, w, h);
              graded = ctx.getImageData(0, 0, w, h);
            }
          } catch {
            graded = null;
          }
        }

        let reference: ImageData | null = null;
        if (referenceImage) {
          try {
            const refImg = await loadImage(referenceImage);
            reference = sampleImageData(refImg, MAX_WIDTH);
          } catch {
            reference = null;
          }
        }

        if (!cancelled) setData({ target, graded, reference });
      } catch {
        if (!cancelled) setData({ target: null, graded: null, reference: null });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sampleImage, previewCanvas, gradeVersion, referenceImage, open]);

  // Draw the selected scope.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const img = data[source];
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset to a square-ish default; each scope sets its own size.
    const W = 512;
    const H = 256;
    canvas.width = W;
    canvas.height = H;
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, W, H);

    if (!img) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No scope data', W / 2, H / 2);
      return;
    }

    if (tab === 'histogram') {
      drawHistogram(ctx, computeHistogram(img), W, H);
    } else if (tab === 'waveform') {
      drawWaveform(ctx, computeWaveform(img, W), W, H);
    } else if (tab === 'parade') {
      drawParade(ctx, computeParade(img, W / 3), W, H);
    } else {
      canvas.width = 256;
      canvas.height = 256;
      ctx.fillStyle = '#08080a';
      ctx.fillRect(0, 0, 256, 256);
      const reading = computeSkinTone(img);
      setSkin(reading);
      drawVector(ctx, computeVectorScope(img, 256), 256, reading);
    }
  }, [data, tab, source, open]);

  const sources: { id: ScopeSource; label: string; available: boolean }[] = [
    { id: 'graded', label: 'Graded', available: !!data.graded },
    { id: 'target', label: 'Target', available: !!data.target },
    { id: 'reference', label: 'Reference', available: !!data.reference },
  ];

  const tabs: { id: ScopeTab; label: string }[] = [
    { id: 'waveform', label: 'Waveform' },
    { id: 'parade', label: 'Parade' },
    { id: 'histogram', label: 'Histogram' },
    { id: 'vector', label: 'Vector' },
  ];

  return (
    <div className="shrink-0 border-t border-white/10 bg-zinc-950/90">
      <div className="h-9 flex items-center justify-between px-3 gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[10px] font-semibold text-white/60 uppercase tracking-widest hover:text-white transition-colors"
          >
            <i className={`fa-solid fa-chevron-${open ? 'down' : 'up'} text-[9px]`}></i>
            Scopes
          </button>
          {open && (
            <div className="flex items-center gap-0.5 ml-3">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                    tab === t.id ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {open && (
          <div className="flex items-center gap-0.5">
            {tab === 'vector' && skin && (
              <span
                className={`text-[10px] font-mono mr-2 ${Math.abs(skin.deviation) > 12 ? 'text-red-400' : 'text-emerald-400'}`}
                title={`Skin-tone hue vs the ${SKIN_TONE_ANGLE}° reference line (I-line)`}
              >
                skin {skin.angle.toFixed(0)}° ({skin.deviation > 0 ? '+' : ''}
                {skin.deviation.toFixed(0)}°) · {(skin.chroma * 100).toFixed(0)}% sat
              </span>
            )}
            {sources.map((s) => (
              <button
                key={s.id}
                disabled={!s.available}
                onClick={() => setSource(s.id)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  source === s.id ? 'bg-white/15 text-white' : 'text-white/55 hover:text-white'
                } ${!s.available ? 'opacity-30 cursor-not-allowed' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="h-[26vh] md:h-44 w-full px-2 pb-2">
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain rounded border border-white/10"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ *
 * Renderers
 * ------------------------------------------------------------------ */

function drawHistogram(ctx: CanvasRenderingContext2D, hist: Histogram, w: number, h: number): void {
  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const x = (i / 4) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const channels: [Uint32Array, string][] = [
    [hist.r, 'rgba(255,64,64,0.65)'],
    [hist.g, 'rgba(64,255,96,0.65)'],
    [hist.b, 'rgba(72,128,255,0.65)'],
  ];

  ctx.globalCompositeOperation = 'lighter';
  for (const [bins, color] of channels) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i < bins.length; i++) {
      const x = (i / (bins.length - 1)) * w;
      const v = Math.sqrt(Math.min(1, bins[i] / hist.max));
      ctx.lineTo(x, h - v * h);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Luma outline
  ctx.beginPath();
  for (let i = 0; i < hist.luma.length; i++) {
    const x = (i / (hist.luma.length - 1)) * w;
    const v = Math.sqrt(Math.min(1, hist.luma[i] / hist.max));
    if (i === 0) ctx.moveTo(x, h - v * h);
    else ctx.lineTo(x, h - v * h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawWaveform(ctx: CanvasRenderingContext2D, wf: ScopeImage, w: number, h: number): void {
  const image = scopeImageToCanvas(wf, [130, 255, 160]);
  ctx.drawImage(image, 0, 0, w, h);
  drawGrid(ctx, w, h);
}

function drawParade(ctx: CanvasRenderingContext2D, parade: { r: ScopeImage; g: ScopeImage; b: ScopeImage }, w: number, h: number): void {
  const third = Math.floor(w / 3);
  const rCanvas = scopeImageToCanvas(parade.r, [255, 80, 80]);
  const gCanvas = scopeImageToCanvas(parade.g, [90, 255, 110]);
  const bCanvas = scopeImageToCanvas(parade.b, [90, 140, 255]);
  ctx.drawImage(rCanvas, 0, 0, third, h);
  ctx.drawImage(gCanvas, third, 0, third, h);
  ctx.drawImage(bCanvas, third * 2, 0, w - third * 2, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(third, 0);
  ctx.lineTo(third, h);
  ctx.moveTo(third * 2, 0);
  ctx.lineTo(third * 2, h);
  ctx.stroke();
  drawGrid(ctx, w, h);
}

function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawVector(
  ctx: CanvasRenderingContext2D,
  vec: { size: number; data: Float32Array; max: number },
  size: number,
  skin: SkinToneReading | null,
): void {
  const cx = size / 2;
  const cy = size / 2;
  // Full scale (0.5 in normalised Cb/Cr) reaches the edge of the plot.
  const scale = size - 1;
  const toX = (u: number) => cx + u * scale;
  const toY = (v: number) => cy - v * scale;

  // Rings + axes
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  for (const r of [0.25, 0.5, 0.75, 1]) {
    ctx.beginPath();
    ctx.arc(cx, cy, (size / 2) * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, size);
  ctx.moveTo(0, cy);
  ctx.lineTo(size, cy);
  ctx.stroke();

  // 75% colour-bar target boxes
  for (const t of COLOR_BAR_TARGETS) {
    const x = toX(t.u);
    const y = toY(t.v);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.strokeRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.label, x, y);
  }

  // Reference skin-tone line ("I" line)
  const a = (SKIN_TONE_ANGLE * Math.PI) / 180;
  const len = (size / 2) * 0.46;
  ctx.strokeStyle = 'rgba(255,190,140,0.75)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * len * 2, cy - Math.sin(a) * len * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Trace
  const image = ctx.createImageData(size, size);
  const inv = 255 / vec.max;
  for (let i = 0; i < vec.data.length; i++) {
    if (vec.data[i] <= 0) continue;
    const v = Math.sqrt(Math.min(1, vec.data[i] * inv));
    const o = i * 4;
    image.data[o] = 200 * v + 55 * v;
    image.data[o + 1] = 240 * v;
    image.data[o + 2] = 200 * v;
    image.data[o + 3] = 255 * v;
  }
  const tmp = document.createElement('canvas');
  tmp.width = size;
  tmp.height = size;
  tmp.getContext('2d')!.putImageData(image, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(tmp, 0, 0);
  ctx.globalCompositeOperation = 'source-over';

  // Measured skin-tone marker
  if (skin) {
    const rad = (skin.angle * Math.PI) / 180;
    const u = skin.chroma * 0.5 * Math.cos(rad);
    const v = skin.chroma * 0.5 * Math.sin(rad);
    const x = toX(u);
    const y = toY(v);
    const off = Math.abs(skin.deviation) > 12;
    ctx.strokeStyle = off ? 'rgba(255,120,120,0.95)' : 'rgba(120,255,170,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
  }
}

export default ScopesPanel;
