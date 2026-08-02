import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeDisabled = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeDisabled?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, closeDisabled]);

  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] grid place-items-center bg-black/25 p-6 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`mac-vibrancy ${width} w-full overflow-hidden rounded-2xl border border-[var(--stroke)] shadow-[var(--shadow-window)]`}
      >
        <header className="flex items-start gap-3 border-b border-[var(--stroke)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="modal-title" className="text-[15px] font-semibold">
              {title}
            </h2>
            {description && (
              <div className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                {description}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={closeDisabled}
            onClick={onClose}
            className="grid size-7 place-items-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] disabled:opacity-40"
          >
            <Icon name="close" size={14} />
          </button>
        </header>
        {children && <div className="max-h-[70vh] overflow-auto px-5 py-4">{children}</div>}
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-[var(--stroke)] bg-[var(--surface-muted)] px-5 py-3">
            {footer}
          </footer>
        )}
      </section>
    </div>,
    document.body,
  );
}
