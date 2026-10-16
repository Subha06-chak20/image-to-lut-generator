import React, { useState } from 'react';
import { loadLUT } from '../services/lut/load';
import { to3dl, toClf, toCube1D, toHald } from '../services/lut/exporters';
import { LUT3D } from '../services/lut/types';

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

const FORMATS: { id: string; label: string; ext: string }[] = [
  { id: 'cube1d', label: '1D .CUBE', ext: 'cube' },
  { id: '3dl', label: '.3DL', ext: '3dl' },
  { id: 'clf', label: '.CLF (Academy)', ext: 'clf' },
  { id: 'hald', label: 'HALD PNG (L8)', ext: 'png' },
];

const ExportMenu: React.FC<ExportMenuProps> = ({ resolveLut, canExport, baseName = 'S_CHAK_STUDIO' }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const exportAs = async (id: string, ext: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const lut = loadLUT(await resolveLut());
      if (!lut || lut.dimension !== 3) return;
      const l3 = lut as LUT3D;
      const name = `${baseName}.${ext}`;

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
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        disabled={!canExport || busy}
        onClick={() => setOpen((o) => !o)}
        className={`w-full py-2 rounded-md text-[11px] font-medium flex items-center justify-center gap-2 transition-colors border border-border
          ${canExport && !busy ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
      >
        {busy ? 'Baking…' : 'More Formats'}
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[9px]`}></i>
      </button>

      {open && canExport && (
        <div className="absolute bottom-full mb-1 left-0 right-0 bg-popover border border-border rounded-md overflow-hidden shadow-xl z-50">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => void exportAs(f.id, f.ext)}
              className="w-full text-left px-3 py-2 text-[11px] text-foreground hover:bg-secondary transition-colors"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ExportMenu;
