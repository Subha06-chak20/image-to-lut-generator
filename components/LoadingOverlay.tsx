
import React from 'react';

interface LoadingOverlayProps {
  isVisible: boolean;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible }) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center">
      <div className="relative">
        <div className="w-24 h-24 border-4 border-zinc-800 border-t-indigo-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <i className="fa-solid fa-palette text-indigo-500 text-xl animate-pulse"></i>
        </div>
      </div>
      <div className="mt-8 text-center">
        <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Extracting Color DNA</h3>
        <p className="text-zinc-500 text-sm max-w-xs">
          Computing LAB statistics and generating 3D LUT lattice using Reinhard transfer...
        </p>
      </div>
      <div className="absolute bottom-12 flex gap-4">
        <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce [animation-delay:-0.3s]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce [animation-delay:-0.15s]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-zinc-600 animate-bounce"></div>
      </div>
    </div>
  );
};

export default LoadingOverlay;
