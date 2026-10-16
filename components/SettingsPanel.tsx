import React, { useState } from 'react';
import { getGpuCapabilities, gpuDisplayName } from '../services/gpu/capabilities';

interface SettingsPanelProps {
  gpuEnabled: boolean;
  onGpuEnabledChange: (enabled: boolean) => void;
  /** True when the WebGL2 pipeline is actually rendering the preview right now. */
  gpuActive: boolean;
  /** Set when GPU acceleration was requested but could not be used. */
  fallbackReason: string | null;
}

type Status = 'active' | 'disabled' | 'unavailable' | 'fallback';

const STATUS_TEXT: Record<Status, string> = {
  active: 'Active',
  disabled: 'Disabled',
  unavailable: 'Unavailable',
  fallback: 'CPU fallback',
};

const STATUS_COLOR: Record<Status, string> = {
  active: 'bg-green-500',
  disabled: 'bg-muted-foreground/50',
  unavailable: 'bg-yellow-500',
  fallback: 'bg-yellow-500',
};

const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
    <span
      className={`text-[10px] text-foreground/90 text-right truncate ${
        mono ? 'font-mono' : ''
      }`}
      title={typeof value === 'string' ? value : undefined}
    >
      {value}
    </span>
  </div>
);

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  gpuEnabled,
  onGpuEnabledChange,
  gpuActive,
  fallbackReason,
}) => {
  const [open, setOpen] = useState(false);
  const caps = getGpuCapabilities();

  const status: Status = !caps.webgl2
    ? 'unavailable'
    : !gpuEnabled
      ? 'disabled'
      : gpuActive
        ? 'active'
        : 'fallback';

  const note = !caps.webgl2
    ? 'This browser or device does not expose WebGL2, so image processing stays on the CPU.'
    : status === 'fallback'
      ? fallbackReason ||
        'WebGL2 is available but the GPU pipeline could not start, so the CPU renderer is being used.'
      : null;

  return (
    <section className="rounded-lg border border-border bg-card/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-microchip text-[11px] text-muted-foreground"></i>
          <span className="text-[11px] font-semibold text-foreground">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[status]}`}></span>
            <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wide">
              {gpuActive ? 'GPU' : 'CPU'}
            </span>
          </span>
          <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[10px] text-muted-foreground`}></i>
        </div>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          {/* GPU Acceleration */}
          <div className="rounded-md border border-border/70 bg-background/40 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                GPU Acceleration
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={gpuEnabled}
                aria-label="GPU acceleration"
                disabled={!caps.webgl2}
                onClick={() => onGpuEnabledChange(!gpuEnabled)}
                title={caps.webgl2 ? undefined : 'WebGL2 is not available'}
                className={`w-7 h-3.5 rounded-full relative transition-colors ${
                  !caps.webgl2
                    ? 'bg-muted-foreground/20 cursor-not-allowed'
                    : gpuEnabled
                      ? 'bg-primary'
                      : 'bg-muted-foreground/40'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${
                    gpuEnabled && caps.webgl2 ? 'left-3.5' : 'left-0.5'
                  } ${gpuEnabled && caps.webgl2 ? 'bg-background' : 'bg-background/80'}`}
                />
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
              Use your graphics processor to accelerate image processing and real-time colour
              grading.
            </p>
          </div>

          {note && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-2">
              <i className="fa-solid fa-circle-info text-[10px] text-yellow-500/90 mt-0.5"></i>
              <span className="text-[10px] text-yellow-500/90 leading-relaxed">{note}</span>
            </div>
          )}

          {/* Device information */}
          <div className="rounded-md border border-border/70 bg-background/40 px-2.5 py-2">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
              GPU Information
            </div>
            <Row label="Status" value={STATUS_TEXT[status]} />
            <Row label="Technology" value={caps.webgl2 ? 'WebGL2' : 'WebGL2 unavailable'} />
            <Row label="Renderer" value={gpuDisplayName(caps)} mono />
            {caps.vendor && <Row label="Vendor" value={caps.vendor} mono />}
            <Row
              label="Max texture"
              value={caps.maxTextureSize ? `${caps.maxTextureSize} px` : '—'}
              mono
            />
            {caps.max3dTextureSize !== null && (
              <Row label="Max 3D texture" value={`${caps.max3dTextureSize} px`} mono />
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default SettingsPanel;
