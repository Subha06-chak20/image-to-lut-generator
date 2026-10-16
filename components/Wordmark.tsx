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
 * The official 3D translucent curved mark with gradient layers, scaled cleanly
 * across all sizes.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28, className = '' }) => (
  <img
    src="/mark.png"
    alt={BRAND.name}
    width={size}
    height={size}
    className={`inline-block shrink-0 object-contain drop-shadow-sm select-none ${className}`}
    style={{ width: size, height: size }}
    draggable={false}
  />
);

export interface LogoImageProps {
  className?: string;
  onDark?: boolean;
  height?: number | string;
}

/**
 * Full Lutcraft logo image lockup (mark + stylized lettering).
 * Automatically displays light/dark variant according to active theme.
 */
export const LogoImage: React.FC<LogoImageProps> = ({ className = '', onDark, height = 36 }) => (
  <>
    <img
      src="/logo.png"
      alt={`${BRAND.name} — ${BRAND.descriptor}`}
      className={`object-contain select-none ${
        onDark === true ? 'hidden' : onDark === false ? 'inline-block' : 'inline-block dark:hidden'
      } ${className}`}
      style={{ height }}
      draggable={false}
    />
    <img
      src="/logo-dark.png"
      alt={`${BRAND.name} — ${BRAND.descriptor}`}
      className={`object-contain select-none ${
        onDark === true ? 'inline-block' : onDark === false ? 'hidden' : 'hidden dark:inline-block'
      } ${className}`}
      style={{ height }}
      draggable={false}
    />
  </>
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
