import React, { useEffect, useRef, useState } from 'react';
import { loadLUT } from '../services/lut/load';
import { to3dl, toClf, toCube1D, toHald } from '../services/lut/exporters';
import { LUT3D } from '../services/lut/types';
import { BRAND } from '../services/brand';
import { BrandMark } from './Wordmark';

interface ExportMenuProps {
  /**
   * Bakes (or fetches) the LUT at the moment the user picks a format. On the GPU
   * parameter path no lattice is kept around, so export resolves one on demand.
   * Returns null when there is no grade to export.
   */
  resolveLut: () => Promise<string | null>;
  /** Whether a grade exists to export. */
  canExport: boolean;
  baseName?: string;
  /** Saves the graded target still as a PNG. */
  onSaveImage?: () => void;
  /** Shown in the menu header — the active lattice resolution. */
  latticeSize?: number;
  /** `footer` opens upward inside the sidebar; `header` is the compact toolbar control. */
  variant?: 'footer' | 'header';
}

function download(text: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const FORMATS: { id: string; label: string; ext: string; note: string }[] = [
  { id: 'cube3d', label: '3D LUT (.CUBE)', ext: 'cube', note: 'The primary deliverable' },
  { id: 'cube1d', label: '1D LUT (.CUBE)', ext: 'cube', note: 'Per-channel curve' },
  { id: '3dl', label: '.3DL', ext: '3dl', note: 'Autodesk / Lustre' },
  { id: 'clf', label: 'CLF (Academy)', ext: 'clf', note: 'Common LUT Format' },
  { id: 'hald', label: 'HALD (.PNG)', ext: 'png', note: 'Level-8 identity image' },
];

/**
 * The single export implementation, used by the header toolbar and the sidebar
 * footer so the two can never disagree about what a format produces.
 */
const ExportMenu: React.FC<ExportMenuProps> = ({
  resolveLut,
  canExport,
  baseName = BRAND.fileSlug,
  onSaveImage,
  latticeSize,
  variant = 'footer',
}) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exportAs = async (id: string, ext: string) => {
    if (busy) return;
    setOpen(false);

    if (id === 'png') {
      onSaveImage?.();
      return;
    }

    setBusy(true);
    try {
      const text = await resolveLut();
      if (!text) return;
      const name = `${baseName}.${ext}`;

      // The 3D .CUBE is the lattice exactly as the renderer produced it.
      if (id === 'cube3d') {
        download(text, name);
        return;
      }

      const lut = loadLUT(text);
      if (!lut || lut.dimension !== 3) return;
      const l3 = lut as LUT3D;

      if (id === 'cube1d') download(toCube1D(l3), name);
      else if (id === '3dl') download(to3dl(l3), name);
      else if (id === 'clf') download(toClf(l3), name, 'application/xml');
      else if (id === 'hald') {
        const hald = toHald(l3, 8);
        const canvas = document.createElement('canvas');
        canvas.width = hald.width;
        canvas.height = hald.height;
        const ctx = canvas.getContext('2d')!;
        ctx.putImageData(new ImageData(hald.data, hald.width, hald.height), 0, 0);
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/png');
        a.download = name;
        a.click();
      }
    } finally {
      setBusy(false);
    }
  };

  const enabled = canExport && !busy;
  const header = variant === 'header';

  return (
    <div className="relative" ref={ref} data-export-menu>
      <button
        disabled={!canExport || busy}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Export"
        title="Export the graded LUT or image"
        className={
          header
            ? `flex items-center gap-1.5 h-8 pl-2 rounded-md text-[11px] font-medium transition-colors border border-border ${
                enabled
                  ? 'bg-secondary text-foreground hover:bg-secondary/80'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`
            : `w-full py-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-2 transition-colors border border-border ${
                enabled ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`
        }
      >
        <i className="fa-solid fa-download text-[11px]"></i>
        <span className={header ? 'hidden md:inline' : ''}>{busy ? 'Baking…' : 'Export'}</span>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[7px] opacity-70 ${header ? 'hidden md:inline' : ''}`}></i>
      </button>

      {open && canExport && (
        <div
          role="menu"
          className={`absolute min-w-[210px] bg-popover border border-border rounded-lg overflow-hidden shadow-xl shadow-black/20 z-50 animate-fade-in ${
            header ? 'top-full mt-1.5 right-0' : 'bottom-full mb-1 left-0 right-0'
          }`}
        >
          {/* Brand line, so every export surface is identifiably Lutcraft. */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <BrandMark size={16} />
            <span className="text-[10px] font-medium text-muted-foreground">
              Export from <span className="text-brand font-semibold">{BRAND.name}</span>
            </span>
            {latticeSize ? (
              <span className="ml-auto text-[9px] font-mono text-muted-foreground shrink-0">
                {latticeSize}³
              </span>
            ) : null}
          </div>

          {FORMATS.map((f) => (
            <button
              key={f.id}
              role="menuitem"
              onClick={() => void exportAs(f.id, f.ext)}
              className="w-full flex items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-secondary transition-colors"
            >
              <span className="text-[11px] text-foreground">{f.label}</span>
              <span className="text-[9px] text-muted-foreground shrink-0">{f.note}</span>
            </button>
          ))}

          {onSaveImage && (
            <>
              <div className="h-px bg-border" />
              <button
                role="menuitem"
                onClick={() => void exportAs('png', 'png')}
                className="w-full flex items-baseline justify-between gap-3 px-3 py-2 text-left hover:bg-secondary transition-colors"
              >
                <span className="text-[11px] text-foreground">Save graded image</span>
                <span className="text-[9px] text-muted-foreground shrink-0">.PNG</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
