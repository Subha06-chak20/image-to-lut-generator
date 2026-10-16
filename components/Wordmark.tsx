import React from 'react';
import { BRAND } from '../services/brand';

interface BrandMarkProps {
  /** Tile edge in px. The glyph scales with it. */
  size?: number;
  className?: string;
}

/**
 * The Lutcraft mark.
 *
 * An indigo tile carrying the colour-wheel handle — the app's signature
 * interaction (drag the dot around the wheel) reduced to two shapes so it still
 * reads at 16 px in a browser tab. Deliberately no gradients beyond one
 * restrained two-stop wash, and no decorative extras.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28, className = '' }) => (
  <span
    className={`brand-tile inline-flex items-center justify-center shrink-0 shadow-sm ${className}`}
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
    aria-hidden="true"
  >
    <svg viewBox="0 0 32 32" width={size} height={size} focusable="false">
      <circle
        cx="15"
        cy="17"
        r="8.6"
        fill="none"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="2.8"
      />
      <circle cx="21.2" cy="10.6" r="4" fill="#fff" />
    </svg>
  </span>
);

interface WordmarkProps {
  /** `sm` for the header, `md` for dialogs, `lg` for the loading screen. */
  size?: 'sm' | 'md' | 'lg';
  /** Show the product descriptor beneath the name. */
  descriptor?: boolean;
  /** Force light lettering for use over a dark surface (viewer, loading screen). */
  onDark?: boolean;
  className?: string;
}

const TEXT_SIZE = { sm: 'text-[15px]', md: 'text-lg', lg: 'text-2xl' } as const;
const MARK_SIZE = { sm: 28, md: 32, lg: 40 } as const;
const DESC_SIZE = {
  sm: 'text-[8px] tracking-[0.22em]',
  md: 'text-[9px] tracking-[0.26em]',
  lg: 'text-[10px] tracking-[0.3em]',
} as const;

/**
 * The Lutcraft lockup: mark + two-tone wordmark (+ optional descriptor).
 *
 * The wordmark carries the indigo accent on "craft" — a logotype, so the
 * accent's contrast sits outside the AA text requirement while the descriptor
 * below uses the token that does pass.
 */
const Wordmark: React.FC<WordmarkProps> = ({
  size = 'sm',
  descriptor = false,
  onDark = false,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-2.5 min-w-0 ${className}`}>
    <BrandMark size={MARK_SIZE[size]} />
    <span className="flex flex-col leading-none min-w-0">
      <span
        className={`font-semibold tracking-[-0.02em] whitespace-nowrap ${
          TEXT_SIZE[size]
        } ${onDark ? 'text-white' : 'text-foreground'}`}
      >
        {BRAND.nameLead}
        <span className={onDark ? 'text-brand-soft' : 'text-brand'}>{BRAND.nameTail}</span>
      </span>
      {descriptor && (
        <span
          className={`mt-1 uppercase whitespace-nowrap ${DESC_SIZE[size]} ${
            onDark ? 'text-white/55' : 'text-muted-foreground'
          }`}
        >
          {BRAND.descriptor}
        </span>
      )}
    </span>
  </span>
);

export default Wordmark;
