import React from 'react';
import { TransferEngineId } from '../services/grade/types';

interface TransferEngineSelectorProps {
  value: TransferEngineId;
  onChange: (v: TransferEngineId) => void;
  disabled?: boolean;
}

const ENGINES: { id: TransferEngineId; label: string; hint: string }[] = [
  { id: 'reinhard', label: 'Reinhard (Mean/Std)', hint: 'Classic per-channel match' },
  { id: 'mongeKantorovich', label: 'Monge-Kantorovich', hint: 'Linear covariance transfer' },
  { id: 'histogramMatch', label: 'Histogram Match', hint: 'Per-channel CDF matching' },
  { id: 'threeWay', label: '3-Way (Tonal)', hint: 'Shadows / mids / highlights' },
];

const TransferEngineSelector: React.FC<TransferEngineSelectorProps> = ({ value, onChange, disabled }) => {
  const active = ENGINES.find((e) => e.id === value);
  return (
    <div className={`space-y-2 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        Transfer Engine
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TransferEngineId)}
        className="w-full bg-secondary border border-border rounded-md text-[11px] text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/40"
      >
        {ENGINES.map((e) => (
          <option key={e.id} value={e.id}>{e.label}</option>
        ))}
      </select>
      {active && <p className="text-[10px] text-muted-foreground/70 italic">{active.hint}</p>}
    </div>
  );
};

export default TransferEngineSelector;
