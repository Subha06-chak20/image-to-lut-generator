import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; also rendered as the dialog header. */
  title: string;
  /** Small line under the title. */
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel. */
  width?: string;
}

/**
 * A centred dialog, portalled to `<body>`.
 *
 * Portalled for the same reason the precision wheel panel is: the sidebar is a
 * `z-10` stacking context, so a dialog rendered inside it would be trapped
 * beneath the viewer's toolbar. Escape and a backdrop press both close it.
 *
 * z-[150] sits above the loading overlay and the app chrome but below the
 * floating precision panel (z-[200]), which is deliberately never blocked.
 */
const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-charcoal-scrim animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} max-h-[calc(100vh-2rem)] flex flex-col bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl overflow-hidden animate-scale-in`}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-0.5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <i className="fa-solid fa-xmark text-xs"></i>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="px-5 py-3 border-t border-border bg-card/50 shrink-0">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default Modal;
