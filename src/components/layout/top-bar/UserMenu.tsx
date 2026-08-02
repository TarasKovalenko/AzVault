import { useAppStore } from '../../../stores/appStore';
import { useMockStore } from '../../../stores/mockStore';
import { Dropdown, DropdownItem } from '../../ui/Dropdown';
import { Icon } from '../../ui/Icon';

export function UserMenu() {
  const userName = useAppStore((state) => state.userName);
  const openSettings = useAppStore((state) => state.setSettingsOpen);
  const mockMode = useMockStore((state) => state.mockMode);
  const mockAvailable = useMockStore((state) => state.mockAvailable);
  const setMockMode = useMockStore((state) => state.setMockMode);
  const initials = (userName || 'User')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dropdown
      align="end"
      trigger={
        <button
          type="button"
          aria-label="User menu"
          className="grid size-8 place-items-center rounded-full bg-[var(--accent)] text-[10px] font-semibold text-white shadow-sm"
        >
          {initials}
        </button>
      }
    >
      <div className="border-b border-[var(--stroke)] px-2.5 py-2">
        <p className="truncate text-xs font-semibold">{userName || 'Azure User'}</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">Signed in with Azure CLI</p>
      </div>
      <DropdownItem icon={<Icon name="settings" />} onClick={() => openSettings(true)}>
        Settings
      </DropdownItem>
      {mockAvailable && (
        <DropdownItem icon={<Icon name="plug" />} onClick={() => setMockMode(!mockMode)}>
          {mockMode ? 'Disable Mock Mode' : 'Enable Mock Mode'}
        </DropdownItem>
      )}
      <DropdownItem icon={<Icon name="info" />} disabled>
        AzVault v1.0.1
      </DropdownItem>
      <div className="my-1 border-t border-[var(--stroke)]" />
      <DropdownItem
        icon={<Icon name="sign-out" />}
        onClick={() => window.dispatchEvent(new CustomEvent('azv:sign-out'))}
      >
        Sign Out
      </DropdownItem>
    </Dropdown>
  );
}
