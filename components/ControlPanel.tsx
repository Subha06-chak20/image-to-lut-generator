
import React from 'react';

interface ControlPanelProps {
  hasLut: boolean;
  onDownloadLut: () => void;
  onDownloadImage: () => void;
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({ hasLut, onDownloadLut, onDownloadImage, onReset }) => {
  return (
    <div className="flex flex-col md:flex-row gap-3">
      {/* Mobile: Row 1 (Full Width) | Desktop: Left side (Flex-1) */}
      <button 
        disabled={!hasLut}
        onClick={onDownloadLut}
        className={`py-2.5 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all md:flex-1
          ${hasLut 
            ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-md' 
            : 'bg-muted text-muted-foreground cursor-not-allowed'}
        `}
      >
        Download .CUBE
        <i className="fa-solid fa-download text-[10px]"></i>
      </button>

      {/* Mobile: Row 2 (Split 65/35) | Desktop: Flattens to be siblings with above */}
      <div className="flex w-full gap-3 md:contents">
        <button 
          disabled={!hasLut}
          onClick={onDownloadImage}
          className={`py-2.5 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all flex-[65] md:flex-1
            ${hasLut 
              ? 'bg-secondary text-foreground hover:bg-secondary/80 border border-border' 
              : 'bg-muted text-muted-foreground cursor-not-allowed'}
          `}
        >
          Save Image
          <i className="fa-solid fa-image text-[10px]"></i>
        </button>

        <button 
          onClick={onReset}
          className="py-2.5 px-4 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors flex-[35] md:flex-none md:w-auto"
        >
          Reset
        </button>
      </div>
    </div>
  );
};

export default ControlPanel;
