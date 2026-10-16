import React, { useState } from 'react';
import { Adjustments } from '../types';
import AdjustmentsPanel from './AdjustmentsPanel';
import ColorWheelsPanel from './ColorWheelsPanel';
import CurvesPanel from './CurvesPanel';
import GradeOrderPanel from './GradeOrderPanel';

interface GradePanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

type Tab = 'wheels' | 'curves' | 'sliders' | 'order';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'wheels', label: 'Wheels', icon: 'fa-circle-half-stroke' },
  { id: 'curves', label: 'Curves', icon: 'fa-chart-line' },
  { id: 'sliders', label: 'Sliders', icon: 'fa-sliders' },
  { id: 'order', label: 'Order', icon: 'fa-arrow-down-up-across-line' },
];

/**
 * The grading surface. Wheels and curves are the primary instruments; the
 * original Lightroom-style sliders live under their own tab, and the order tab
 * controls the sequence the operations are applied in.
 */
const GradePanel: React.FC<GradePanelProps> = ({ values, onChange, disabled }) => {
  const [tab, setTab] = useState<Tab>('wheels');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 p-1 bg-muted rounded-lg">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center justify-center gap-1.5 ${
              tab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <i className={`fa-solid ${t.icon} text-[10px]`}></i>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'wheels' && <ColorWheelsPanel values={values} onChange={onChange} disabled={disabled} />}
      {tab === 'curves' && <CurvesPanel values={values} onChange={onChange} disabled={disabled} />}
      {tab === 'sliders' && <AdjustmentsPanel values={values} onChange={onChange} disabled={disabled} />}
      {tab === 'order' && <GradeOrderPanel values={values} onChange={onChange} disabled={disabled} />}
    </div>
  );
};

export default GradePanel;
