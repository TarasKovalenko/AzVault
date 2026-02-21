import { Input, Text, tokens } from '@fluentui/react-components';
import { Search24Regular } from '@fluentui/react-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { PaletteCommand } from '../../types';
import { fuzzyFilter } from './fuzzyMatch';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useAppStore();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const commands = useCommands();
  const filtered = useMemo(() => {
    const available = commands.filter((c) => !c.when || c.when());
    return fuzzyFilter(available, query, (c) => `${c.label} ${c.category}`);
  }, [commands, query]);

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setActiveIndex(0);
  }, []);

  const execute = useCallback(
    (cmd: PaletteCommand) => {
      setCommandPaletteOpen(false);
      requestAnimationFrame(() => cmd.execute());
    },
    [setCommandPaletteOpen],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        execute(filtered[activeIndex].item);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setCommandPaletteOpen(false);
      }
    },
    [filtered, activeIndex, execute, setCommandPaletteOpen],
  );

  useEffect(() => {
    const el = resultsRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="azv-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setCommandPaletteOpen(false);
      }}
    >
      <div className="azv-palette-container" role="dialog" aria-label="Command palette">
        <div className="azv-palette-input">
          <Input
            ref={inputRef}
            value={query}
            onChange={(_, d) => setQuery(d.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or run a command..."
            contentBefore={<Search24Regular style={{ fontSize: 16 }} />}
            style={{
              width: '100%',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
            }}
            autoComplete="off"
          />
        </div>

        <div className="azv-palette-results" ref={resultsRef}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center' }}>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                No matching commands
              </Text>
            </div>
          ) : (
            filtered.map((result, i) => (
              <button
                type="button"
                key={result.item.id}
                className={`azv-palette-item ${i === activeIndex ? 'active' : ''}`}
                onClick={() => execute(result.item)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {result.item.icon && (
                  <span style={{ opacity: 0.6, fontSize: 16, display: 'flex' }}>
                    {result.item.icon}
                  </span>
                )}
                <span>
                  <Text size={200}>{result.item.label}</Text>
                  <Text
                    size={100}
                    style={{
                      color: tokens.colorNeutralForeground3,
                      marginLeft: 8,
                      textTransform: 'capitalize',
                    }}
                  >
                    {result.item.category}
                  </Text>
                </span>
                {result.item.shortcut && (
                  <span className="shortcut azv-mono">{result.item.shortcut}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function useCommands(): PaletteCommand[] {
  const store = useAppStore();
  const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl+';

  return useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'nav-secrets',
        label: 'Go to Secrets',
        category: 'navigation',
        shortcut: `${mod}1`,
        execute: () => store.setActiveTab('secrets'),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'nav-keys',
        label: 'Go to Keys',
        category: 'navigation',
        shortcut: `${mod}2`,
        execute: () => store.setActiveTab('keys'),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'nav-certs',
        label: 'Go to Certificates',
        category: 'navigation',
        shortcut: `${mod}3`,
        execute: () => store.setActiveTab('certificates'),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        category: 'navigation',
        shortcut: `${mod}4`,
        execute: () => store.setActiveTab('dashboard'),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'nav-audit',
        label: 'Go to Audit Log',
        category: 'navigation',
        shortcut: `${mod}5`,
        execute: () => store.setActiveTab('logs'),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        category: 'action',
        shortcut: `${mod}B`,
        execute: () => store.toggleSidebar(),
      },
      {
        id: 'toggle-detail',
        label: 'Toggle Detail Panel',
        category: 'action',
        shortcut: `${mod}\\`,
        execute: () => store.toggleDetailPanel(),
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        category: 'settings',
        shortcut: `${mod},`,
        execute: () => store.setSettingsOpen(true),
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        category: 'settings',
        execute: () => store.setThemeMode(store.themeMode === 'dark' ? 'light' : 'dark'),
      },
      {
        id: 'refresh',
        label: 'Refresh All Data',
        category: 'action',
        shortcut: `${mod}R`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:refresh')),
      },
      {
        id: 'new-secret',
        label: 'New Secret',
        category: 'action',
        shortcut: `${mod}N`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:new-secret')),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'select-all',
        label: 'Select All Items',
        category: 'action',
        shortcut: `${mod}A`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:select-all')),
      },
      {
        id: 'deselect-all',
        label: 'Deselect All',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:deselect-all')),
      },
      {
        id: 'export-json',
        label: 'Export as JSON',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export', { detail: 'json' })),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'export-csv',
        label: 'Export as CSV',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export', { detail: 'csv' })),
        when: () => !!store.selectedVaultName,
      },
      {
        id: 'copy-vault-uri',
        label: 'Copy Vault URI',
        category: 'action',
        execute: () => {
          if (store.selectedVaultUri) navigator.clipboard.writeText(store.selectedVaultUri);
        },
        when: () => !!store.selectedVaultUri,
      },
      {
        id: 'pin-vault',
        label: 'Pin Current Vault',
        category: 'vault',
        execute: () => {
          if (
            store.selectedVaultName &&
            store.selectedVaultUri &&
            store.selectedTenantId &&
            store.selectedSubscriptionId
          ) {
            store.pinVault({
              name: store.selectedVaultName,
              uri: store.selectedVaultUri,
              tenantId: store.selectedTenantId,
              subscriptionId: store.selectedSubscriptionId,
            });
          }
        },
        when: () =>
          !!store.selectedVaultName &&
          !store.pinnedVaults.some((v) => v.uri === store.selectedVaultUri),
      },
      {
        id: 'unpin-vault',
        label: 'Unpin Current Vault',
        category: 'vault',
        execute: () => {
          if (store.selectedVaultUri) store.unpinVault(store.selectedVaultUri);
        },
        when: () => store.pinnedVaults.some((v) => v.uri === store.selectedVaultUri),
      },
      {
        id: 'clear-recent',
        label: 'Clear Recent Vaults',
        category: 'vault',
        execute: () => store.clearRecentVaults(),
        when: () => store.recentVaults.length > 0,
      },
      {
        id: 'export-audit',
        label: 'Export Audit Log',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export-audit')),
      },
      {
        id: 'toggle-reauth',
        label: 'Toggle Re-auth Requirement',
        category: 'settings',
        execute: () => store.setRequireReauthForReveal(!store.requireReauthForReveal),
      },
      {
        id: 'sign-out',
        label: 'Sign Out',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:sign-out')),
      },
      {
        id: 'focus-search',
        label: 'Focus Search',
        category: 'action',
        shortcut: `${mod}F`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:focus-search')),
      },
      {
        id: 'delete-selected',
        label: 'Delete Selected Items',
        category: 'action',
        shortcut: `${mod}⇧D`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:delete-selected')),
      },
    ],
    [store, mod],
  );
}
