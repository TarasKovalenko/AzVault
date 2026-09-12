import type { ReactNode } from 'react';
import { Icon } from '../ui/Icon';

/**
 * The title row and status line shared by every detail pane (secret, key,
 * certificate). Extra badges for the resource go in `children`.
 */
export function DetailPaneHeader({
  title,
  enabled,
  onClose,
  children,
}: {
  title: string;
  enabled: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="mono truncate text-[15px] font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid size-7 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span
            className={`size-1.5 rounded-full ${enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`}
          />
          {enabled ? 'Active' : 'Disabled'}
        </span>
        {children}
      </div>
    </>
  );
}
