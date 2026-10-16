import React, { useEffect, useRef, useState } from 'react';
import Wordmark from './Wordmark';
import { ThemeId } from '../services/settings/store';

interface HeaderProps {
  /** The loaded project / image name, or a neutral placeholder. */
  projectName: string;
  isProcessing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onImportReference: () => void;
  onImportTarget: () => void;
  /** The export control, supplied by the shell so there is one implementation. */
  exportSlot?: React.ReactNode;
  theme: ThemeId;
  onToggleTheme: () => void;
  onOpenAbout: () => void;
  onOpenSettings: () => void;
}

const ICON_BUTTON =
  'w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent';

/** A lightweight dropdown: closes on an outside press, Escape or a selection. */
const Dropdown: React.FC<{
  label: string;
  icon: string;
  ariaLabel: string;
  align?: 'left' | 'right';
  primary?: boolean;
  items: { id: string; label: string; icon: string; onSelect: () => void }[];
}> = ({ label, icon, ariaLabel, align = 'left', primary = false, items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref} data-header-dropdown>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        className={
          primary
            ? 'flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-md text-[11px] font-medium bg-brand text-primary-foreground hover:opacity-90 transition-opacity'
            : `${ICON_BUTTON} ${open ? 'bg-secondary text-foreground' : ''}`
        }
      >
        <i className={`fa-solid ${icon} text-[11px]`}></i>
        <span className="hidden md:inline">{label}</span>
        <i className="fa-solid fa-chevron-down text-[7px] opacity-70 hidden md:inline"></i>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1.5 min-w-[190px] bg-popover border border-border rounded-lg shadow-xl shadow-black/20 py-1 z-50 animate-fade-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] text-foreground/85 hover:text-foreground hover:bg-secondary transition-colors text-left"
            >
              <i className={`fa-solid ${item.icon} text-[10px] w-3.5 text-center text-muted-foreground`}></i>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * The application header.
 *
 * Identity, project context and the working actions (import, history, export,
 * appearance, settings) — and nothing else. The rendering/status readouts that
 * used to live here are technical detail, so they moved to
 * Settings → Advanced → System Diagnostics.
 */
const Header: React.FC<HeaderProps> = ({
  projectName,
  isProcessing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onImportReference,
  onImportTarget,
  exportSlot,
  theme,
  onToggleTheme,
  onOpenAbout,
  onOpenSettings,
}) => (
  <header className="h-14 bg-card border-b border-border px-3 md:px-5 flex items-center gap-3 shrink-0 z-50 theme-shell">
    {/* Brand */}
    <div className="flex items-center shrink-0" data-brand="lutcraft">
      <Wordmark size="sm" descriptor className="hidden xl:inline-flex" />
      <Wordmark size="sm" className="xl:hidden" />
    </div>

    <div className="w-px h-6 bg-border hidden md:block shrink-0" aria-hidden="true" />

    {/* Project context */}
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <i className="fa-solid fa-image text-[10px] text-muted-foreground shrink-0 hidden sm:block"></i>
      <span
        className="text-[11px] font-medium text-foreground/90 truncate hidden sm:block"
        title={projectName}
      >
        {projectName}
      </span>
      {isProcessing && (
        <span
          className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0"
          role="status"
          aria-label="Working"
        ></span>
      )}
    </div>

    {/* Actions */}
    <div className="flex items-center gap-1.5 shrink-0">
      <Dropdown
        label="Import"
        icon="fa-arrow-up-from-bracket"
        ariaLabel="Import an image or video"
        primary
        items={[
          {
            id: 'reference',
            label: 'Import reference image',
            icon: 'fa-wand-magic-sparkles',
            onSelect: onImportReference,
          },
          {
            id: 'target',
            label: 'Import target image or video',
            icon: 'fa-clapperboard',
            onSelect: onImportTarget,
          },
        ]}
      />

      <div className="flex items-center gap-0.5">
        <button onClick={onUndo} disabled={!canUndo} className={ICON_BUTTON} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
          <i className="fa-solid fa-rotate-left text-[11px]"></i>
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={ICON_BUTTON} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
          <i className="fa-solid fa-rotate-right text-[11px]"></i>
        </button>
      </div>

      {exportSlot}

      <div className="w-px h-6 bg-border hidden md:block" aria-hidden="true" />

      <button
        onClick={onToggleTheme}
        className={ICON_BUTTON}
        title={theme === 'dark' ? 'Switch to Light Studio' : 'Switch to Dark Studio'}
        aria-label="Toggle studio theme"
        data-theme-toggle
      >
        <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'} text-[11px]`}></i>
      </button>

      <button onClick={onOpenAbout} className={ICON_BUTTON} title="About Lutcraft" aria-label="About Lutcraft">
        <i className="fa-solid fa-circle-info text-[11px]"></i>
      </button>

      <button onClick={onOpenSettings} className={ICON_BUTTON} title="Settings" aria-label="Settings" data-open-settings>
        <i className="fa-solid fa-gear text-[11px]"></i>
      </button>
    </div>
  </header>
);

export default Header;
