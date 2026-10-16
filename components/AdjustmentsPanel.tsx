
import React, { useState } from 'react';
import { Adjustments } from '../types';

interface AdjustmentsPanelProps {
  values: Adjustments;
  onChange: (v: Adjustments) => void;
  disabled: boolean;
}

const AdjustmentsPanel: React.FC<AdjustmentsPanelProps> = ({ values, onChange, disabled }) => {
  const [activeTab, setActiveTab] = useState<'tone' | 'color'>('tone');

  const update = (key: keyof Adjustments, val: number, min: number, max: number) => {
    const clamped = Math.min(max, Math.max(min, val));
    onChange({ ...values, [key]: clamped });
  };

  const Slider = ({ label, val, min, max, step, k }: { label: string, val: number, min: number, max: number, step: number, k: keyof Adjustments }) => {
    // All defaults are now 0
    const defaultValue = 0;
    const isModified = Math.abs(val - defaultValue) > 0.001;
    
    // Calculate percentage for track fill
    const percent = ((val - min) / (max - min)) * 100;

    const handleReset = () => {
      onChange({ ...values, [k]: defaultValue });
    };

    return (
      <div className={`space-y-3 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
        <div className="flex justify-between items-center h-5">
          <label className="text-[11px] font-medium text-muted-foreground capitalize">
            {label}
          </label>
          
          <div className="flex items-center gap-2">
            {/* Reset Button (Only visible when modified) */}
            <button 
              onClick={handleReset}
              className={`text-[10px] text-muted-foreground hover:text-primary transition-all duration-200 ${isModified ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              title="Reset to default"
            >
              <i className="fa-solid fa-rotate-left"></i>
            </button>

            <span className="text-[10px] font-mono text-foreground bg-secondary px-1.5 py-0.5 rounded min-w-[32px] text-center">
               {val.toFixed(k === 'intensity' || k === 'exposure' ? 2 : 0)}
            </span>
          </div>
        </div>
        
        <div className="relative h-4 flex items-center group">
          {/* Track Background */}
          <div className="absolute w-full h-[2px] bg-secondary rounded-full overflow-hidden">
             {/* Track Fill */}
             <div 
               className="h-full bg-primary transition-all duration-75"
               style={{ width: `${percent}%` }}
             ></div>
          </div>
          
          <input 
            type="range" 
            min={min} 
            max={max} 
            step={step} 
            value={val}
            onChange={(e) => update(k, parseFloat(e.target.value), min, max)}
            className="absolute w-full h-full opacity-0 cursor-pointer z-10"
          />
          
          {/* Custom Thumb Visual (follows position) */}
          <div 
            className="absolute h-4 w-4 bg-background border-2 border-primary rounded-full shadow-sm pointer-events-none transition-transform group-active:scale-110"
            style={{ left: `calc(${percent}% - 8px)` }}
          ></div>
        </div>
      </div>
    );
  };

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
            <Slider label="Exposure" val={values.exposure} min={-2} max={2} step={0.05} k="exposure" />
            <Slider label="Brightness" val={values.brightness} min={-100} max={100} step={1} k="brightness" />
            <Slider label="Contrast" val={values.contrast} min={-50} max={50} step={1} k="contrast" />
            <Slider label="Highlights" val={values.highlights} min={-100} max={100} step={1} k="highlights" />
            <Slider label="Shadows" val={values.shadows} min={-100} max={100} step={1} k="shadows" />
            <Slider label="Whites" val={values.whites} min={-100} max={100} step={1} k="whites" />
            <Slider label="Blacks" val={values.blacks} min={-100} max={100} step={1} k="blacks" />
          </>
        ) : (
          <>
            <Slider label="Intensity (Mix)" val={values.intensity} min={-1} max={1} step={0.01} k="intensity" />
            <Slider label="Saturation" val={values.saturation} min={-100} max={100} step={1} k="saturation" />
            <Slider label="Vibrance" val={values.vibrance} min={-100} max={100} step={1} k="vibrance" />
            <Slider label="Temperature" val={values.temperature} min={-100} max={100} step={1} k="temperature" />
            <Slider label="Tint" val={values.tint} min={-100} max={100} step={1} k="tint" />
            <Slider label="Hue" val={values.hue} min={-180} max={180} step={1} k="hue" />
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
