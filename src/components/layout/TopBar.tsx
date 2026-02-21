import {
  Avatar,
  Badge,
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSync24Regular,
  Info24Regular,
  PersonCircle24Regular,
  Search24Regular,
  Settings24Regular,
  SignOut24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from '@fluentui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { authSignOut } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function TopBar() {
  const {
    userName,
    themeMode,
    setThemeMode,
    setCommandPaletteOpen,
    setSettingsOpen,
    signOut: storeSignOut,
  } = useAppStore();
  const queryClient = useQueryClient();
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  const handleSignOut = async () => {
    try {
      await authSignOut();
    } catch {
      /* ignore */
    }
    storeSignOut();
    queryClient.clear();
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const shortcutLabel = useMemo(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
      return '⌘K';
    }
    return 'Ctrl+K';
  }, []);

  return (
    <div
      className="azv-pane"
      style={{
        borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        background: tokens.colorNeutralBackground2,
        margin: 0,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
        padding: '4px 12px',
        display: 'flex',
        alignItems: 'center',
        minHeight: 44,
        gap: 8,
      }}
    >
      {/* Logo */}
      <Text
        weight="bold"
        size={300}
        className="azv-mono"
        style={{
          color: tokens.colorBrandForeground1,
          letterSpacing: '0.08em',
          flexShrink: 0,
          marginRight: 4,
        }}
      >
        AZVAULT
      </Text>

      {/* Workspace Switcher */}
      <WorkspaceSwitcher />

      {/* Command palette trigger */}
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        style={{
          flex: 1,
          maxWidth: 420,
          margin: '0 8px',
          padding: '5px 12px',
          borderRadius: 4,
          border: `1px solid ${tokens.colorNeutralStroke1}`,
          background: tokens.colorNeutralBackground1,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 12,
          color: tokens.colorNeutralForeground3,
        }}
      >
        <Search24Regular style={{ fontSize: 14, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Search or run a command...</span>
        <span className="azv-kbd">{shortcutLabel}</span>
      </button>

      {/* Right-side controls */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
        {mockMode && (
          <Badge appearance="filled" color="danger" size="small">
            MOCK
          </Badge>
        )}

        <Button
          icon={themeMode === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
          appearance="subtle"
          size="small"
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
        />

        <Button
          icon={<ArrowSync24Regular />}
          appearance="subtle"
          size="small"
          onClick={handleRefresh}
          title="Refresh all data"
        />

        <Menu>
          <MenuTrigger>
            <Button
              appearance="subtle"
              size="small"
              icon={<Avatar name={userName || 'User'} size={20} color="brand" />}
            />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<PersonCircle24Regular />} disabled>
                {userName || 'Azure User'}
              </MenuItem>
              <MenuItem icon={<Settings24Regular />} onClick={() => setSettingsOpen(true)}>
                Settings
              </MenuItem>
              {mockAvailable && (
                <MenuItem icon={<Settings24Regular />} onClick={() => setMockMode(!mockMode)}>
                  {mockMode ? 'Disable Mock Mode' : 'Enable Mock Mode'}
                </MenuItem>
              )}
              <MenuItem icon={<Info24Regular />} disabled>
                AzVault v0.1.0
              </MenuItem>
              <MenuItem icon={<SignOut24Regular />} onClick={handleSignOut}>
                Sign Out
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </div>
  );
}
