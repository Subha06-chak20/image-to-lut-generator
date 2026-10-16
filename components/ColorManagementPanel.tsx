import React, { useState } from 'react';
import { COLOR_SPACES, ColorSpaceId, LOG_CURVES, LogCurveId } from '../services/color/spaces';
import { GAMUTS, GAMUT_IDS, GamutId } from '../services/color/gamut';
import { ColorConfig, DEFAULT_COLOR_CONFIG } from '../services/grade/colorConfig';

interface ColorManagementPanelProps {
  value: ColorConfig;
  onChange: (v: ColorConfig) => void;
  disabled?: boolean;
}

const selectClass =
  'w-full bg-secondary border border-border rounded-md text-[11px] text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
    {children}
  </div>
);

const ColorManagementPanel: React.FC<ColorManagementPanelProps> = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const set = <K extends keyof ColorConfig>(key: K, v: ColorConfig[K]) => onChange({ ...value, [key]: v });

  const logIds = Object.keys(LOG_CURVES) as LogCurveId[];
  const spaceIds = Object.keys(COLOR_SPACES) as ColorSpaceId[];

  return (
    <section className={`rounded-lg border border-border bg-card/40 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <i className="fa-solid fa-sliders text-[11px] text-muted-foreground"></i>
          <span className="text-[11px] font-semibold text-foreground">Color Management</span>
        </div>
        <i className={`fa-solid fa-chevron-${open ? 'up' : 'down'} text-[10px] text-muted-foreground`}></i>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 animate-fade-in">
          <Field label="Input Log (footage)">
            <select
              className={selectClass}
              value={value.inputLog}
              onChange={(e) => set('inputLog', e.target.value as LogCurveId)}
            >
              {logIds.map((id) => (
                <option key={id} value={id}>{LOG_CURVES[id].label}</option>
              ))}
            </select>
          </Field>

          {value.inputLog === 'none' && (
            <Field label="Input Space">
              <select
                className={selectClass}
                value={value.inputSpace}
                onChange={(e) => set('inputSpace', e.target.value as ColorSpaceId)}
              >
                {spaceIds.map((id) => (
                  <option key={id} value={id}>{COLOR_SPACES[id].label}</option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Input Gamut">
              <select
                className={selectClass}
                value={value.inputGamut}
                onChange={(e) => set('inputGamut', e.target.value as GamutId)}
              >
                {GAMUT_IDS.map((id) => (
                  <option key={id} value={id}>{GAMUTS[id].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Output Gamut">
              <select
                className={selectClass}
                value={value.gamut}
                onChange={(e) => set('gamut', e.target.value as GamutId)}
              >
                {GAMUT_IDS.map((id) => (
                  <option key={id} value={id}>{GAMUTS[id].label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Working Space">
              <select
                className={selectClass}
                value={value.workingSpace}
                onChange={(e) => set('workingSpace', e.target.value as ColorSpaceId)}
              >
                {spaceIds.map((id) => (
                  <option key={id} value={id}>{COLOR_SPACES[id].label}</option>
                ))}
              </select>
            </Field>
            <Field label="Output Space">
              <select
                className={selectClass}
                value={value.outputSpace}
                onChange={(e) => set('outputSpace', e.target.value as ColorSpaceId)}
              >
                {spaceIds.map((id) => (
                  <option key={id} value={id}>{COLOR_SPACES[id].label}</option>
                ))}
              </select>
            </Field>
          </div>

          {/* White balance */}
          <div className="pt-1 border-t border-border/60">
            <label className="flex items-center justify-between py-2 cursor-pointer">
              <span className="text-[11px] font-medium text-muted-foreground">White Balance</span>
              <input
                type="checkbox"
                checked={value.wb.enabled}
                onChange={(e) => set('wb', { ...value.wb, enabled: e.target.checked })}
                className="accent-white w-3.5 h-3.5"
              />
            </label>

            {value.wb.enabled && (
              <div className="space-y-3 pb-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Temperature</span>
                  <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">
                    {Math.round(value.wb.temp)}K
                  </span>
                </div>
                <input
                  type="range"
                  min={2000}
                  max={12000}
                  step={50}
                  value={value.wb.temp}
                  onChange={(e) => set('wb', { ...value.wb, temp: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Tint</span>
                  <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded">
                    {Math.round(value.wb.tint)}
                  </span>
                </div>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={value.wb.tint}
                  onChange={(e) => set('wb', { ...value.wb, tint: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-border/60">
            <label className="flex items-center justify-between py-2 cursor-pointer flex-1">
              <span className="text-[11px] font-medium text-muted-foreground">Filmic Tone Map</span>
              <input
                type="checkbox"
                checked={value.tonemap}
                onChange={(e) => set('tonemap', e.target.checked)}
                className="accent-white w-3.5 h-3.5 mr-2"
              />
            </label>
            <button
              onClick={() => onChange({ ...DEFAULT_COLOR_CONFIG })}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
              title="Reset color management"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default ColorManagementPanel;
