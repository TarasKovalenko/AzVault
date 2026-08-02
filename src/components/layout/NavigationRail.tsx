import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';
import { cn } from '../ui/cn';
import { Icon, type IconName } from '../ui/Icon';

const items: Array<{ value: ItemTab; label: string; icon: IconName }> = [
  { value: 'dashboard', label: 'Overview', icon: 'home' },
  { value: 'secrets', label: 'Secrets', icon: 'lock' },
  { value: 'keys', label: 'Keys', icon: 'key' },
  { value: 'certificates', label: 'Certificates', icon: 'certificate' },
  { value: 'logs', label: 'Activity', icon: 'activity' },
];

export function NavigationRail() {
  const activeTab = useAppStore((state) => state.activeTab);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen);

  return (
    <nav
      className="mac-vibrancy flex w-[68px] shrink-0 flex-col items-center border-r border-[var(--stroke)] px-2 py-3"
      aria-label="Primary navigation"
    >
      <div className="grid gap-1.5">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={activeTab === item.value ? 'page' : undefined}
            disabled={!selectedVaultName}
            onClick={() => setActiveTab(item.value)}
            className={cn(
              'relative grid size-10 place-items-center rounded-[11px] text-[var(--text-secondary)] transition disabled:opacity-35',
              activeTab === item.value
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
            )}
          >
            <Icon name={item.icon} size={19} />
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
        className="grid size-10 place-items-center rounded-[11px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
      >
        <Icon name="settings" size={19} />
      </button>
    </nav>
  );
}
