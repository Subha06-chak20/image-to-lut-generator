import React from 'react';

interface ControlPanelProps {
  /** Whether a grade exists to export. No baked LUT is required any more. */
  canExport: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDownloadLut: () => void;
  onDownloadImage: () => void;
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  canExport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onDownloadLut,
  onDownloadImage,
  onReset,
}) => {
  const iconButton =
    'py-2.5 px-3 rounded-md text-xs font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed';

  return (
    <div className="flex flex-col gap-3">
      {/* History controls */}
      <div className="flex items-center gap-3">
        <button onClick={onUndo} disabled={!canUndo} className={iconButton} title="Undo (Ctrl/Cmd+Z)">
          <i className="fa-solid fa-rotate-left text-[10px]"></i>
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={iconButton} title="Redo (Ctrl/Cmd+Shift+Z)">
          <i className="fa-solid fa-rotate-right text-[10px]"></i>
        </button>
        <span className="text-[10px] text-muted-foreground/60">History</span>
      </div>

      {/* Export controls */}
      <div className="flex flex-col md:flex-row gap-3">
        <button
          disabled={!canExport}
          onClick={onDownloadLut}
          className={`py-2.5 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all md:flex-1
            ${canExport
              ? 'bg-primary text-primary-foreground hover:opacity-90 shadow-md'
              : 'bg-muted text-muted-foreground cursor-not-allowed'}
          `}
        >
          Download .CUBE
          <i className="fa-solid fa-download text-[10px]"></i>
        </button>

        <div className="flex w-full gap-3 md:contents">
          <button
            disabled={!canExport}
            onClick={onDownloadImage}
            className={`py-2.5 rounded-md text-xs font-medium flex items-center justify-center gap-2 transition-all flex-[65] md:flex-1
              ${canExport
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
    </div>
  );
};

export default ControlPanel;
