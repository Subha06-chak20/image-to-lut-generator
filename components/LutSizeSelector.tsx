import React from 'react';
import { LUT_SIZES, LUTSize } from '../services/lut/build';

interface LutSizeSelectorProps {
  value: LUTSize;
  onChange: (v: LUTSize) => void;
  disabled?: boolean;
}

/**
 * Lattice-size selector for the generated LUT.
 * 33 is the industry default; 17 is lighter, 65 is smoother for heavy grades.
 */
const LutSizeSelector: React.FC<LutSizeSelectorProps> = ({ value, onChange, disabled }) => {
  return (
    <div className={`space-y-2 ${disabled ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        LUT Lattice
      </span>
      <div className="grid grid-cols-3 p-1 bg-muted rounded-lg">
        {LUT_SIZES.map((size) => (
          <button
            key={size}
            onClick={() => onChange(size)}
            className={`py-1.5 text-xs font-medium rounded-md transition-all duration-200
              ${value === size
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'}`}
          >
            {size}<sup>3</sup>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LutSizeSelector;
