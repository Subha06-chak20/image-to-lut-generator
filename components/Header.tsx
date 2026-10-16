
import React from 'react';

interface HeaderProps {
  isProcessing: boolean;
  /** The backend that is actually painting the preview. */
  renderMode?: 'gpu' | 'cpu';
}

const Header: React.FC<HeaderProps> = ({ isProcessing, renderMode = 'cpu' }) => {
  const gpu = renderMode === 'gpu';
  return (
    <header className="h-14 bg-background border-b border-border px-4 md:px-6 flex items-center justify-between shrink-0 z-50">
      <div className="flex items-center gap-3">
        {/* Minimal White Dot Logo */}
        <div className="w-8 h-8 flex items-center justify-center">
           <div className="w-2.5 h-2.5 bg-foreground rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]"></div>
        </div>
        <h1 className="text-sm font-semibold tracking-wide text-foreground">
          S.CHAK STUDIO
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Acceleration indicator — mirrors what the preview is really using. */}
        <div
          className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary"
          title={
            gpu
              ? 'GPU acceleration is active (WebGL2)'
              : 'Using CPU rendering — enable GPU acceleration in Settings'
          }
        >
          <i
            className={`fa-solid ${
              gpu ? 'fa-bolt text-primary' : 'fa-microchip text-muted-foreground'
            } text-[10px]`}
          ></i>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            {gpu ? 'GPU · WebGL2' : 'CPU'}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary">
          <div className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`}></div>
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
             {isProcessing ? 'Processing' : 'System Ready'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default Header;
