/**
 * TopBar.tsx – Application header bar.
 *
 * Contains the app logo, global search input, theme toggle,
 * refresh button, and user menu.
 */

import {
  Avatar,
  Badge,
  Button,
  Input,
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
  ShieldLock24Regular,
  SignOut24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from '@fluentui/react-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { authSignOut } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';

export function TopBar() {
  const searchInputWrapRef = useRef<HTMLDivElement>(null);
  const {
    userName,
    selectedVaultName,
    searchQuery,
    setSearchQuery,
    themeMode,
    setThemeMode,
    requireReauthForReveal,
    setRequireReauthForReveal,
    signOut: storeSignOut,
  } = useAppStore();
  const queryClient = useQueryClient();
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  /** Sign out – clear Tauri auth, Zustand state, and query cache. */
  const handleSignOut = async () => {
    try {
      await authSignOut();
    } catch {
      // Ignore sign-out errors – we clear local state regardless
    }
    storeSignOut();
    queryClient.clear();
  };

  /** Invalidate all cached queries to force a fresh fetch. */
  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  const shortcutLabel = useMemo(() => {
    if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform)) {
      return 'Cmd+K';
    }
    return 'Ctrl+K';
  }, []);

  useEffect(() => {
    const onGlobalShortcut = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (!isShortcut) return;
      event.preventDefault();
      const input = searchInputWrapRef.current?.querySelector('input');
      if (!input) return;
      input.focus();
      input.select();
    };

    window.addEventListener('keydown', onGlobalShortcut);
    return () => window.removeEventListener('keydown', onGlobalShortcut);
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
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        minHeight: 46,
        gap: 10,
      }}
    >
      {/* Logo + vault context */}
      <div style={{ minWidth: 200, display: 'flex', flexDirection: 'column' }}>
        <Text
          weight="bold"
          size={300}
          className="azv-mono"
          style={{ color: tokens.colorBrandForeground1, letterSpacing: '0.08em' }}
        >
          AZVAULT
        </Text>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
          <span
            className="azv-status-dot"
            style={{
              background: selectedVaultName ? 'var(--azv-success)' : 'var(--azv-scroll-thumb)',
              width: 6,
              height: 6,
            }}
          />
          <Text size={100} className="azv-mono" style={{ opacity: 0.7 }}>
            {selectedVaultName ? selectedVaultName : 'no vault'}
          </Text>
          <span className="azv-kbd">{shortcutLabel}</span>
        </div>
      </div>

      {/* Global search */}
      <div ref={searchInputWrapRef} style={{ flex: 1, maxWidth: 480, margin: '0 8px' }}>
        <Input
          placeholder="Search secrets, keys, certificates…"
          contentBefore={<Search24Regular style={{ fontSize: 15 }} />}
          size="small"
          value={searchQuery}
          onChange={(_, d) => setSearchQuery(d.value)}
          style={{
            width: '100%',
            borderRadius: 4,
            background: tokens.colorNeutralBackground1,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
          }}
        />
      </div>

      {/* Right-side controls */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Mock data indicator */}
        {mockMode && (
          <Badge appearance="filled" color="danger" size="small">
            MOCK
          </Badge>
        )}

        {/* Theme toggle */}
        <Button
          icon={themeMode === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
          appearance="subtle"
          size="small"
          onClick={() => setThemeMode(themeMode === 'dark' ? 'light' : 'dark')}
          title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
        />

        {/* Refresh */}
        <Button
          icon={<ArrowSync24Regular />}
          appearance="subtle"
          size="small"
          onClick={handleRefresh}
          title="Refresh all data"
        />

        {/* User menu */}
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
              {mockAvailable && (
                <MenuItem icon={<Settings24Regular />} onClick={() => setMockMode(!mockMode)}>
                  {mockMode ? 'Disable Mock Mode' : 'Enable Mock Mode'}
                </MenuItem>
              )}
              <MenuItem
                icon={<ShieldLock24Regular />}
                onClick={() => setRequireReauthForReveal(!requireReauthForReveal)}
              >
                {requireReauthForReveal ? 'Disable re-auth on reveal' : 'Require re-auth on reveal'}
              </MenuItem>
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
