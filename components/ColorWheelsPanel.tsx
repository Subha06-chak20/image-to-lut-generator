import React from 'react';
import { Adjustments, NEUTRAL_WHEELS, Wheel, Wheels } from '../types';
import ColorWheel from './ColorWheel';

interface ColorWheelsPanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

const ORDER: { key: keyof Wheels; label: string; hint: string }[] = [
  { key: 'lift', label: 'Lift', hint: 'Shadows — raises blacks, leaves white fixed' },
  { key: 'gamma', label: 'Gamma', hint: 'Midtones — bends the middle' },
  { key: 'gain', label: 'Gain', hint: 'Highlights — scales white, leaves black fixed' },
  { key: 'offset', label: 'Offset', hint: 'Full-range additive shift (exposure-like in log)' },
];

/**
 * Resolve-style primary wheels. Everything here is pointwise, so it folds into
 * the existing 3D LUT and costs nothing extra at render time.
 */
const ColorWheelsPanel: React.FC<ColorWheelsPanelProps> = ({ values, onChange, disabled }) => {
  const wheels = values.wheels ?? NEUTRAL_WHEELS;
  const logWheels = !!values.logWheels;

  const setWheel = (key: keyof Wheels, w: Wheel) => {
    onChange({ ...values, wheels: { ...wheels, [key]: w } });
  };

  const isDefault =
    ORDER.every(({ key }) => {
      const w = wheels[key];
      return w.x === 0 && w.y === 0 && w.master === 0;
    }) && !logWheels;

  return (
    <div className="space-y-5 select-none">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Primary Wheels
        </span>
        <button
          onClick={() => onChange({ ...values, wheels: NEUTRAL_WHEELS })}
          className={`text-[10px] text-muted-foreground hover:text-primary transition-all ${isDefault ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        >
          <i className="fa-solid fa-rotate-left mr-1"></i>Reset all
        </button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-1">
        {ORDER.map(({ key, label, hint }) => (
          <div key={key} title={hint}>
            <ColorWheel
              label={label}
              value={wheels[key]}
              onChange={(w) => setWheel(key, w)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => onChange({ ...values, logWheels: !logWheels })}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-[11px] transition-colors ${
          logWheels
            ? 'border-primary/60 bg-secondary text-foreground'
            : 'border-border bg-card text-muted-foreground hover:text-foreground'
        } ${disabled ? 'opacity-30 pointer-events-none' : ''}`}
        title="Evaluate lift/gamma/gain in an ACEScct log domain — offset then behaves like an exposure shift, which suits log footage"
      >
        <span className="flex items-center gap-2">
          <i className="fa-solid fa-wave-square text-[10px]"></i>
          Log wheels (ACEScct)
        </span>
        <span
          className={`w-7 h-3.5 rounded-full relative transition-colors ${logWheels ? 'bg-primary' : 'bg-muted-foreground/40'}`}
        >
          <span
            className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-background transition-all ${logWheels ? 'left-3.5' : 'left-0.5'}`}
          />
        </span>
      </button>

      <p className="text-[10px] text-muted-foreground/70 leading-relaxed px-1">
        Drag for controlled, relative movement — hold{' '}
        <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px] font-mono">Shift</kbd> for 8×
        precision, or click a wheel to open its precision view. Double-click resets the pad. Wheel
        moves are luma-neutral, so you can tint without shifting brightness.
      </p>
    </div>
  );
};

export default ColorWheelsPanel;
