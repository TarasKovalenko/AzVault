import { useAppStore } from '../../../stores/appStore';
import { useMockStore } from '../../../stores/mockStore';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';
import { UserMenu } from './UserMenu';

export function TopBarActions() {
  const themeMode = useAppStore((state) => state.themeMode);
  const setThemeMode = useAppStore((state) => state.setThemeMode);
  const mockMode = useMockStore((state) => state.mockMode);
  const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
  const actionClass =
    'grid size-8 place-items-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]';

  return (
    <div className="no-drag ml-auto flex items-center gap-1">
      {mockMode && <Badge tone="orange">MOCK</Badge>}
      <button
        type="button"
        className={actionClass}
        title={`Switch to ${nextTheme} appearance`}
        aria-label={`Switch to ${nextTheme} appearance`}
        onClick={() => setThemeMode(nextTheme)}
      >
        <Icon name={themeMode === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button
        type="button"
        className={actionClass}
        title="Refresh all data"
        aria-label="Refresh all data"
        onClick={() => window.dispatchEvent(new CustomEvent('azv:refresh'))}
      >
        <Icon name="refresh" />
      </button>
      <UserMenu />
    </div>
  );
}
