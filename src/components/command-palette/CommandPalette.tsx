import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { formatShortcut } from '../../hooks/useKeyboardShortcuts';
import { useAppStore } from '../../stores/appStore';
import type { PaletteCommand } from '../../types';
import { cn } from '../ui/cn';
import { Icon } from '../ui/Icon';
import { fuzzyFilter } from './fuzzyMatch';

export function CommandPalette() {
  const commandPaletteOpen = useAppStore((state) => state.commandPaletteOpen);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;
  useFocusTrap(dialogRef, commandPaletteOpen);

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
      className="fixed inset-0 z-[1000] flex justify-center bg-black/25 px-6 pt-[14vh] backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) setCommandPaletteOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setCommandPaletteOpen(false);
      }}
    >
      <div
        ref={dialogRef}
        className="mac-vibrancy flex h-fit max-h-[440px] w-[580px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--stroke)] shadow-[var(--shadow-window)]"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--stroke)] px-4 py-3">
          <Icon name="search" className="text-[var(--text-tertiary)]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search or run a command…"
            className="mono h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={filtered.length ? optionId(activeIndex) : undefined}
          />
        </div>

        <div className="overflow-y-auto p-1.5" ref={resultsRef} role="listbox" id={listId}>
          {filtered.length === 0 ? (
            <div className="p-5 text-center text-xs text-[var(--text-tertiary)]">
              No matching commands
            </div>
          ) : (
            filtered.map((result, i) => (
              <button
                type="button"
                key={result.item.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === activeIndex}
                tabIndex={-1}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[13px]',
                  i === activeIndex
                    ? 'bg-[var(--accent)] text-white'
                    : 'hover:bg-[var(--surface-hover)]',
                )}
                onClick={() => execute(result.item)}
                onMouseMove={() => setActiveIndex(i)}
              >
                {result.item.icon && <span className="opacity-65">{result.item.icon}</span>}
                <span className="min-w-0 flex-1">
                  <span>{result.item.label}</span>
                  <span className="ml-2 text-[10px] capitalize opacity-55">
                    {result.item.category}
                  </span>
                </span>
                {result.item.shortcut && (
                  <kbd className="mono ml-auto rounded border border-current/15 px-1.5 py-0.5 text-[10px] opacity-60">
                    {result.item.shortcut}
                  </kbd>
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
  // Subscribe only to the fields that decide which commands are available;
  // actions read the live store so the list is not rebuilt on every store write.
  const activeTab = useAppStore((state) => state.activeTab);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const hasRecentVaults = useAppStore((state) => state.recentVaults.length > 0);
  const mod = formatShortcut('', true);

  return useMemo<PaletteCommand[]>(
    () => [
      {
        id: 'nav-secrets',
        label: 'Go to Secrets',
        category: 'navigation',
        shortcut: `${mod}1`,
        execute: () => useAppStore.getState().setActiveTab('secrets'),
        when: () => !!selectedVaultName,
      },
      {
        id: 'nav-keys',
        label: 'Go to Keys',
        category: 'navigation',
        shortcut: `${mod}2`,
        execute: () => useAppStore.getState().setActiveTab('keys'),
        when: () => !!selectedVaultName,
      },
      {
        id: 'nav-certs',
        label: 'Go to Certificates',
        category: 'navigation',
        shortcut: `${mod}3`,
        execute: () => useAppStore.getState().setActiveTab('certificates'),
        when: () => !!selectedVaultName,
      },
      {
        id: 'nav-dashboard',
        label: 'Go to Overview',
        category: 'navigation',
        shortcut: `${mod}4`,
        execute: () => useAppStore.getState().setActiveTab('dashboard'),
        when: () => !!selectedVaultName,
      },
      {
        id: 'nav-audit',
        label: 'Go to Activity',
        category: 'navigation',
        shortcut: `${mod}5`,
        execute: () => useAppStore.getState().setActiveTab('logs'),
        when: () => !!selectedVaultName,
      },
      {
        id: 'toggle-detail',
        label: 'Toggle Detail Panel',
        category: 'action',
        shortcut: `${mod}\\`,
        execute: () => useAppStore.getState().toggleDetailPanel(),
      },
      {
        id: 'open-settings',
        label: 'Open Settings',
        category: 'settings',
        shortcut: `${mod},`,
        execute: () => useAppStore.getState().setSettingsOpen(true),
      },
      {
        id: 'toggle-theme',
        label: 'Toggle Theme',
        category: 'settings',
        execute: () => {
          const state = useAppStore.getState();
          state.setThemeMode(state.themeMode === 'dark' ? 'light' : 'dark');
        },
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
        when: () => !!selectedVaultName,
      },
      {
        id: 'import-secrets-json',
        label: 'Import Secrets from JSON',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:import-secrets')),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'select-all',
        label: 'Select All Items',
        category: 'action',
        shortcut: `${mod}A`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:select-all')),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'deselect-all',
        label: 'Deselect All',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:deselect-all')),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'export-json',
        label: 'Export as JSON',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export', { detail: 'json' })),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'export-csv',
        label: 'Export as CSV',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export', { detail: 'csv' })),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'copy-vault-uri',
        label: 'Copy Vault URI',
        category: 'action',
        execute: () => {
          const uri = useAppStore.getState().selectedVaultUri;
          if (uri) navigator.clipboard.writeText(uri);
        },
        when: () => !!selectedVaultUri,
      },
      {
        id: 'clear-recent',
        label: 'Clear Recent Vaults',
        category: 'vault',
        execute: () => useAppStore.getState().clearRecentVaults(),
        when: () => hasRecentVaults,
      },
      {
        id: 'export-audit',
        label: 'Export Activity Log',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:export-audit')),
      },
      {
        id: 'toggle-reauth',
        label: 'Toggle Fetch Confirmation',
        category: 'settings',
        execute: () => {
          const state = useAppStore.getState();
          state.setRequireReauthForReveal(!state.requireReauthForReveal);
        },
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
        when: () => !!selectedVaultName && activeTab !== 'dashboard',
      },
      {
        id: 'delete-selected',
        label: 'Delete Selected Items',
        category: 'action',
        shortcut: `${mod}⇧D`,
        execute: () => window.dispatchEvent(new CustomEvent('azv:delete-selected')),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
      {
        id: 'delete-by-prefix',
        label: 'Delete Secrets by Prefix',
        category: 'action',
        execute: () => window.dispatchEvent(new CustomEvent('azv:delete-by-prefix')),
        when: () => activeTab === 'secrets' && !!selectedVaultName,
      },
    ],
    [activeTab, selectedVaultName, selectedVaultUri, hasRecentVaults, mod],
  );
}
