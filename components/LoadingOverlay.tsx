import React from 'react';
import Wordmark from './Wordmark';
import { BRAND } from '../services/brand';

interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  detail?: string;
}

/**
 * The Lutcraft loading screen.
 *
 * Deliberately dark in both themes: it covers the viewer, and a neutral dark
 * surround keeps the graded frame's appearance predictable while the analysis
 * runs.
 */
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  title = 'Extracting colour profile',
  detail = 'Computing LAB statistics and generating the 3D LUT lattice.',
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-[#0d0d10]/90 backdrop-blur-md flex flex-col items-center justify-center gap-8">
      <Wordmark size="lg" descriptor onDark />

      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-full border-2 border-white/12 border-t-brand-soft animate-spin" />
        <h3 className="text-sm font-semibold text-white tracking-tight">{title}</h3>
        <p className="text-[11px] text-white/45 max-w-xs text-center leading-relaxed">{detail}</p>
      </div>

      <p className="absolute bottom-10 text-[10px] text-white/25">{BRAND.creatorCredit}</p>
    </div>
  );
};

export default LoadingOverlay;
