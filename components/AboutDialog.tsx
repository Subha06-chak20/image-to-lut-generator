import React from 'react';
import Modal from './Modal';
import Wordmark, { LogoImage } from './Wordmark';
import { BRAND } from '../services/brand';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** The working colour space / engine summary, so About reflects real config. */
  extra?: React.ReactNode;
}

const CAPABILITIES = [
  { icon: 'fa-circle-half-stroke', label: 'Precision colour wheels' },
  { icon: 'fa-chart-line', label: 'Curves & sliders' },
  { icon: 'fa-eye', label: 'Wipe & A/B compare' },
  { icon: 'fa-wave-square', label: 'Waveform · parade · vectorscope' },
  { icon: 'fa-cube', label: '3D LUT generation' },
  { icon: 'fa-file-export', label: '.CUBE / .3DL / CLF / HALD export' },
];

/**
 * The About dialog: the one place the product identity, version, tagline and
 * creator credit are stated in full.
 */
const AboutDialog: React.FC<AboutDialogProps> = ({ open, onClose, extra }) => (
  <Modal
    open={open}
    onClose={onClose}
    title="About Lutcraft"
    subtitle={`Version ${BRAND.version}`}
    width="max-w-md"
    footer={
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-foreground">{BRAND.creatorCredit}</span>
        <button
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-md text-[11px] font-medium bg-brand text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Close
        </button>
      </div>
    }
  >
    <div className="flex flex-col items-center text-center py-2">
      <LogoImage height={52} />
      <p className="mt-3 text-[11px] text-muted-foreground">{BRAND.descriptor}</p>
    </div>

    <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2">
      {CAPABILITIES.map((c) => (
        <div key={c.label} className="flex items-center gap-2 min-w-0">
          <i className={`fa-solid ${c.icon} text-[10px] text-brand/80 shrink-0`}></i>
          <span className="text-[10px] text-muted-foreground truncate">{c.label}</span>
        </div>
      ))}
    </div>

    {extra && <div className="mt-5">{extra}</div>}

    <p className="mt-5 text-[10px] leading-relaxed text-muted-foreground">
      Lutcraft is an independent colour-grading and LUT-authoring studio. All grading,
      analysis and LUT generation run entirely in your browser — no uploads, no server.
    </p>
  </Modal>
);

export default AboutDialog;
