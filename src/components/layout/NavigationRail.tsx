import { formatShortcut } from '../../hooks/useKeyboardShortcuts';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';
import { cn } from '../ui/cn';
import { Icon, type IconName } from '../ui/Icon';

const items: Array<{ value: ItemTab; label: string; icon: IconName; shortcut: string }> = [
  { value: 'secrets', label: 'Secrets', icon: 'lock', shortcut: '1' },
  { value: 'keys', label: 'Keys', icon: 'key', shortcut: '2' },
  { value: 'certificates', label: 'Certificates', icon: 'certificate', shortcut: '3' },
  { value: 'dashboard', label: 'Overview', icon: 'home', shortcut: '4' },
  { value: 'logs', label: 'Activity', icon: 'activity', shortcut: '5' },
];

const itemClass =
  'grid w-full place-items-center gap-1 rounded-[11px] px-1 py-1.5 text-[var(--text-secondary)] transition disabled:opacity-35';

export function NavigationRail() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  return (
    <nav
      className="mac-vibrancy flex w-[84px] shrink-0 flex-col items-center border-r border-[var(--stroke)] px-2 py-3"
      aria-label="Primary navigation"
    >
      <div className="grid w-full gap-1">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            title={`${item.label} (${formatShortcut(item.shortcut, true)})`}
            aria-current={activeTab === item.value ? 'page' : undefined}
            disabled={!selectedVaultName}
            onClick={() => setActiveTab(item.value)}
            className={cn(
              itemClass,
              activeTab === item.value
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
            )}
          >
            <Icon name={item.icon} size={18} />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        title={`Settings (${formatShortcut(',', true)})`}
        onClick={() => setSettingsOpen(true)}
        className={cn(itemClass, 'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]')}
      >
        <Icon name="settings" size={18} />
        <span className="text-[10px] font-medium leading-none">Settings</span>
      </button>
    </nav>
  );
}
