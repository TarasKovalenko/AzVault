import { formatShortcut } from '../../../hooks/useKeyboardShortcuts';
import { useAppStore } from '../../../stores/appStore';
import { Icon } from '../../ui/Icon';

export function CommandPaletteTrigger() {
  const openCommandPalette = useAppStore((state) => state.setCommandPaletteOpen);
  return (
    <button
      type="button"
      onClick={() => openCommandPalette(true)}
      className="no-drag mx-auto flex h-8 min-w-40 max-w-sm flex-1 items-center gap-2 rounded-[10px] border border-[var(--stroke-strong)] bg-[var(--surface-raised)] px-2.5 text-xs text-[var(--text-tertiary)] shadow-sm hover:bg-[var(--surface-solid)]"
    >
      <Icon name="search" size={14} />
      <span className="min-w-0 flex-1 truncate text-left">Search or run a command</span>
      <kbd className="rounded-md border border-[var(--stroke)] bg-[var(--surface-muted)] px-1.5 py-0.5 font-sans text-[10px]">
        {formatShortcut('K', true)}
      </kbd>
    </button>
  );
}
