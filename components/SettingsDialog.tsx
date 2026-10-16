import React, { useMemo, useState } from 'react';
import Modal from './Modal';
import { getGpuCapabilities, gpuDisplayName } from '../services/gpu/capabilities';
import { ThemeId, THEMES } from '../services/settings/store';
import { BRAND } from '../services/brand';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  theme: ThemeId;
  onThemeChange: (theme: ThemeId) => void;
  gpuEnabled: boolean;
  onGpuEnabledChange: (enabled: boolean) => void;
  /** True when the WebGL2 pipeline is actually painting the preview right now. */
  gpuActive: boolean;
  /** Set when GPU acceleration was requested but could not be used. */
  fallbackReason: string | null;
  /** Extra read-only context that only the shell knows (working space, engine). */
  context?: { label: string; value: string }[];
}

type Tab = 'appearance' | 'rendering' | 'advanced';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: 'fa-palette' },
  { id: 'rendering', label: 'Rendering', icon: 'fa-microchip' },
  { id: 'advanced', label: 'Advanced', icon: 'fa-sliders' },
];

type Status = 'active' | 'disabled' | 'unavailable' | 'fallback';

const STATUS_TEXT: Record<Status, string> = {
  active: 'Active — GPU (WebGL2)',
  disabled: 'Disabled by choice — CPU',
  unavailable: 'Unavailable — CPU',
  fallback: 'CPU fallback',
};

const STATUS_DOT: Record<Status, string> = {
  active: 'bg-emerald-500',
  disabled: 'bg-muted-foreground/50',
  unavailable: 'bg-amber-500',
  fallback: 'bg-amber-500',
};

const Row: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => (
  <div className="flex items-baseline justify-between gap-3 py-1 border-b border-border/60 last:border-0">
    <span className="text-[10px] text-muted-foreground shrink-0">{label}</span>
    <span
      className={`text-[10px] text-foreground/90 text-right truncate ${mono ? 'font-mono' : ''}`}
      title={typeof value === 'string' ? value : undefined}
    >
      {value}
    </span>
  </div>
);

/** A labelled toggle switch, matching the app's existing switch styling. */
const Switch: React.FC<{
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}> = ({ checked, disabled, label, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`w-8 h-4 rounded-full relative shrink-0 transition-colors ${
      disabled
        ? 'bg-muted-foreground/20 cursor-not-allowed'
        : checked
          ? 'bg-brand'
          : 'bg-muted-foreground/40'
    }`}
  >
    <span
      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${
        checked && !disabled ? 'left-4' : 'left-0.5'
      }`}
    />
  </button>
);

/**
 * The application settings dialog.
 *
 * Deliberately split into three sections: Appearance (themes), Rendering (the
 * GPU acceleration preference) and Advanced, which owns System Diagnostics. The
 * technical detail that used to sit in the header as a status badge now lives
 * here, where it belongs.
 */
const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  theme,
  onThemeChange,
  gpuEnabled,
  onGpuEnabledChange,
  gpuActive,
  fallbackReason,
  context,
}) => {
  const [tab, setTab] = useState<Tab>('appearance');
  const [copied, setCopied] = useState(false);
  const caps = useMemo(() => getGpuCapabilities(), []);

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

  const diagnosticsText = () => {
    const lines = [
      `${BRAND.name} ${BRAND.version}`,
      `Theme: ${theme === 'dark' ? 'Dark Studio' : 'Light Studio'}`,
      `GPU acceleration: ${gpuEnabled ? 'enabled' : 'disabled'}`,
      `WebGL2: ${caps.webgl2 ? 'available' : 'unavailable'}`,
      `Rendering backend: ${gpuActive ? 'GPU (WebGL2)' : 'CPU'}`,
      `Status: ${STATUS_TEXT[status]}`,
      fallbackReason ? `Fallback: ${fallbackReason}` : null,
      `Adapter: ${gpuDisplayName(caps)}`,
      caps.vendor ? `Vendor: ${caps.vendor}` : null,
      caps.maxTextureSize ? `Max texture size: ${caps.maxTextureSize} px` : null,
      caps.max3dTextureSize ? `Max 3D texture size: ${caps.max3dTextureSize} px` : null,
      caps.maxTextureUnits ? `Max texture units: ${caps.maxTextureUnits}` : null,
      ...(context ?? []).map((c) => `${c.label}: ${c.value}`),
      `User agent: ${navigator.userAgent}`,
    ].filter(Boolean);
    return lines.join('\n');
  };

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context / permissions) — nothing to do.
    }
  };

  const card = 'rounded-lg border border-border bg-card/60 p-3.5';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      subtitle={BRAND.name}
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] text-muted-foreground">
            Made by {BRAND.creator}
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md text-[11px] font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="flex gap-4 flex-col sm:flex-row">
        {/* Section rail */}
        <nav className="flex sm:flex-col gap-1 shrink-0 sm:w-36">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium transition-colors text-left flex-1 sm:flex-none ${
                tab === t.id
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <i className={`fa-solid ${t.icon} text-[10px] w-3.5 text-center`}></i>
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex-1 min-w-0 space-y-3">
          {tab === 'appearance' && (
            <>
              <div className={card}>
                <h3 className="text-[11px] font-semibold text-foreground">Studio theme</h3>
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  The image viewer and scopes keep a dark, neutral surround in both themes so
                  colour judgement is never affected by the workspace.
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => onThemeChange(t.id)}
                      aria-pressed={theme === t.id}
                      className={`text-left rounded-lg border p-3 transition-colors ${
                        theme === t.id
                          ? 'border-brand bg-brand/5'
                          : 'border-border hover:border-muted-foreground/50'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`w-3.5 h-3.5 rounded-full border ${
                            theme === t.id ? 'border-brand bg-brand' : 'border-muted-foreground/50'
                          }`}
                        />
                        <span className="text-[11px] font-medium text-foreground">{t.label}</span>
                      </span>
                      <span className="mt-1.5 block text-[10px] text-muted-foreground leading-relaxed">
                        {t.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={card}>
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  Brand
                </span>
                <p className="mt-1.5 text-[11px] text-foreground/90 italic">{BRAND.tagline}</p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {BRAND.name} · {BRAND.descriptor}
                </p>
              </div>
            </>
          )}

          {tab === 'rendering' && (
            <>
              <div className={card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[11px] font-semibold text-foreground">GPU acceleration</h3>
                    <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                      Use the graphics processor for real-time colour grading. Turn it off to force
                      the CPU renderer.
                    </p>
                  </div>
                  <Switch
                    checked={gpuEnabled}
                    disabled={!caps.webgl2}
                    label="GPU acceleration"
                    onChange={onGpuEnabledChange}
                  />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}></span>
                  <span className="text-[10px] text-muted-foreground">{STATUS_TEXT[status]}</span>
                </div>
              </div>

              {note && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                  <i className="fa-solid fa-circle-info text-[10px] text-amber-600 mt-0.5"></i>
                  <span className="text-[10px] text-amber-700 leading-relaxed">{note}</span>
                </div>
              )}

              <div className={card}>
                <h3 className="text-[11px] font-semibold text-foreground">Adapter</h3>
                <div className="mt-2">
                  <Row label="Device" value={gpuDisplayName(caps)} mono />
                  {caps.vendor && <Row label="Vendor" value={caps.vendor} mono />}
                </div>
              </div>
            </>
          )}

          {tab === 'advanced' && (
            <>
              <div className={card}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <i className="fa-solid fa-stethoscope text-[10px] text-brand"></i>
                    <h3 className="text-[11px] font-semibold text-foreground">System Diagnostics</h3>
                  </div>
                  <button
                    onClick={() => void copyDiagnostics()}
                    className="px-2.5 py-1 rounded-md text-[10px] font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground leading-relaxed">
                  Technical detail about the rendering pipeline. Useful when reporting a problem.
                </p>

                <div className="mt-3">
                  <Row label="Application" value={`${BRAND.name} ${BRAND.version}`} />
                  <Row label="GPU acceleration" value={gpuEnabled ? 'Enabled' : 'Disabled'} />
                  <Row label="WebGL2" value={caps.webgl2 ? 'Available' : 'Unavailable'} />
                  <Row label="Rendering backend" value={gpuActive ? 'GPU (WebGL2)' : 'CPU'} />
                  <Row label="Status" value={STATUS_TEXT[status]} />
                  {fallbackReason && <Row label="Fallback" value={fallbackReason} />}
                  <Row label="Adapter" value={gpuDisplayName(caps)} mono />
                  {caps.vendor && <Row label="Vendor" value={caps.vendor} mono />}
                  <Row
                    label="Max texture"
                    value={caps.maxTextureSize ? `${caps.maxTextureSize} px` : '—'}
                    mono
                  />
                  {caps.max3dTextureSize !== null && (
                    <Row label="Max 3D texture" value={`${caps.max3dTextureSize} px`} mono />
                  )}
                  {caps.maxTextureUnits !== null && (
                    <Row label="Texture units" value={String(caps.maxTextureUnits)} mono />
                  )}
                  {(context ?? []).map((c) => (
                    <Row key={c.label} label={c.label} value={c.value} mono />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SettingsDialog;
