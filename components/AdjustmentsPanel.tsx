import React, { useState } from 'react';
import { Adjustments } from '../types';
import AdjustmentSlider from './AdjustmentSlider';

interface AdjustmentsPanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

/** The scalar keys — everything a slider can drive. */
type NumericAdjustmentKey = {
  [K in keyof Adjustments]-?: Adjustments[K] extends number ? K : never;
}[keyof Adjustments];

const AdjustmentsPanel: React.FC<AdjustmentsPanelProps> = ({ values, onChange, disabled }) => {
  const [activeTab, setActiveTab] = useState<'tone' | 'color'>('tone');

  /**
   * `AdjustmentSlider` is a module-scope component on purpose. It used to be
   * declared inside this component, which gave it a fresh identity on every
   * render: React then remounted the whole slider subtree on the first `input`
   * event of a drag, tearing out the element the browser was tracking and
   * killing the gesture after a single step.
   */
  const slider = (
    label: string,
    k: NumericAdjustmentKey,
    min: number,
    max: number,
    step: number,
    precision: number,
  ) => (
    <AdjustmentSlider
      label={label}
      value={values[k]}
      min={min}
      max={max}
      step={step}
      precision={precision}
      defaultValue={0}
      disabled={disabled}
      onChange={(val) => onChange({ ...values, [k]: val })}
      onReset={() => onChange({ ...values, [k]: 0 })}
    />
  );

  return (
    <div className="space-y-6 select-none">
      {/* Shadcn-style Tabs */}
      <div className="grid grid-cols-2 p-1 bg-muted rounded-lg">
        <button 
          onClick={() => setActiveTab('tone')}
          className={`py-1.5 text-xs font-medium rounded-md transition-all duration-200 
            ${activeTab === 'tone' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'}`}
        >
          Tone
        </button>
        <button 
          onClick={() => setActiveTab('color')}
          className={`py-1.5 text-xs font-medium rounded-md transition-all duration-200 
            ${activeTab === 'color' 
              ? 'bg-background text-foreground shadow-sm' 
              : 'text-muted-foreground hover:text-foreground'}`}
        >
          Color
        </button>
      </div>

      <div className="space-y-6 px-1">
        {activeTab === 'tone' ? (
          <>
            {slider('Exposure', 'exposure', -2, 2, 0.05, 2)}
            {slider('Brightness', 'brightness', -100, 100, 1, 0)}
            {slider('Contrast', 'contrast', -50, 50, 1, 0)}
            {slider('Highlights', 'highlights', -100, 100, 1, 0)}
            {slider('Shadows', 'shadows', -100, 100, 1, 0)}
            {slider('Whites', 'whites', -100, 100, 1, 0)}
            {slider('Blacks', 'blacks', -100, 100, 1, 0)}
          </>
        ) : (
          <>
            {slider('Intensity (Mix)', 'intensity', -1, 1, 0.01, 2)}
            {slider('Saturation', 'saturation', -100, 100, 1, 0)}
            {slider('Vibrance', 'vibrance', -100, 100, 1, 0)}
            {slider('Temperature', 'temperature', -100, 100, 1, 0)}
            {slider('Tint', 'tint', -100, 100, 1, 0)}
            {slider('Hue', 'hue', -180, 180, 1, 0)}
          </>
        )}
      </div>

      {disabled && (
        <div className="pt-2">
           <p className="text-[10px] text-muted-foreground text-center">
             Select a reference image to enable controls.
           </p>
        </div>
      )}
    </div>
  );
};

export default AdjustmentsPanel;
