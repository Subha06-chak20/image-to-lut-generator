
import React, { useRef, useEffect, useState } from 'react';
import { applyLUTToImage } from '../services/lutGenerator';

interface PreviewSectionProps {
  sampleImage: string;
  lutData: string | null;
  isProcessing: boolean;
}

const PreviewSection: React.FC<PreviewSectionProps> = ({ sampleImage, lutData, isProcessing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sampleImgRef = useRef<HTMLImageElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [resolution, setResolution] = useState<{w: number, h: number} | null>(null);

  useEffect(() => {
    const update = () => {
      if (sampleImgRef.current && canvasRef.current) {
        const img = sampleImgRef.current;
        const canvas = canvasRef.current;
        
        // Update Resolution State
        setResolution({ w: img.naturalWidth, h: img.naturalHeight });

        // Keep original resolution for quality, CSS handles display size
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        applyLUTToImage(canvas, img, lutData);
      }
    };
    if (sampleImgRef.current?.complete) update();
    else if (sampleImgRef.current) sampleImgRef.current.onload = update;
  }, [sampleImage, lutData]);

  const handleMove = (xPos: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pos = ((xPos - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(0, Math.min(100, pos)));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) handleMove(e.clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    handleMove(e.touches[0].clientX);
  };

  return (
    <div className="w-full h-full flex flex-col relative group select-none">
      
      {/* Image Container - Center the image within the available space */}
      <div 
        ref={containerRef}
        className="flex-1 relative cursor-ew-resize overflow-hidden flex items-center justify-center bg-zinc-950/50"
        onMouseMove={handleMouseMove}
        onTouchMove={handleTouchMove}
        onMouseDown={() => setIsDragging(true)}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
      >
        <div className="relative max-w-full max-h-full flex items-center justify-center">
            {/* Original Image (Hidden from view, used for source) */}
            <img 
              ref={sampleImgRef} 
              src={sampleImage} 
              className="absolute opacity-0 pointer-events-none" 
              crossOrigin="anonymous" 
            />

            {/* Comparison Logic using two identical background images/canvases cropped via clip-path is tricky 
                because standard <img> fit is simpler.
                Let's use the two-layered approach with object-contain.
             */}
             
             {/* 1. Base Layer (Original) */}
             <div className="relative max-h-full max-w-full">
                <img 
                   src={sampleImage} 
                   className="max-h-[40dvh] md:max-h-[85vh] max-w-full object-contain"
                   draggable={false}
                />
             </div>

             {/* 2. Processed Layer (Overlay) */}
             <div 
               className="absolute inset-0 flex items-center justify-center pointer-events-none"
               style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
             >
                <canvas 
                  ref={canvasRef} 
                  className="max-h-[40dvh] md:max-h-[85vh] max-w-full object-contain" 
                />
             </div>

             {/* Slider Handle */}
             <div 
               className="absolute top-0 bottom-0 w-0.5 bg-white/50 backdrop-blur-sm z-20 pointer-events-none"
               style={{ left: `${sliderPos}%` }}
             >
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <i className="fa-solid fa-left-right text-xs text-black"></i>
                 </div>
             </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="h-8 absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent flex items-end justify-between px-4 pb-2 pointer-events-none">
         <div className="flex gap-4">
            <span className="text-[9px] font-medium text-white/70">Before</span>
            <span className="text-[9px] font-medium text-white/70">After</span>
         </div>
         {resolution && (
           <span className="text-[9px] font-mono text-white/90 bg-black/40 px-2 py-0.5 rounded backdrop-blur-sm">
             {resolution.w} x {resolution.h}
           </span>
         )}
      </div>

      {isProcessing && (
          <div className="absolute inset-0 z-30 bg-background/50 backdrop-blur-sm flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
    </div>
  );
};

export default PreviewSection;
