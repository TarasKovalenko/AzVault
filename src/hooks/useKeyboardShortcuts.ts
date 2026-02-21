import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

interface Shortcut {
  key: string;
  meta?: boolean;
  shift?: boolean;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const {
    setCommandPaletteOpen,
    setSettingsOpen,
    toggleSidebar,
    toggleDetailPanel,
    setActiveTab,
    selectedVaultName,
  } = useAppStore();

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      { key: 'k', meta: true, action: () => setCommandPaletteOpen(true) },
      { key: ',', meta: true, action: () => setSettingsOpen(true) },
      { key: 'b', meta: true, action: () => toggleSidebar() },
      { key: '\\', meta: true, action: () => toggleDetailPanel() },
      { key: '1', meta: true, action: () => selectedVaultName && setActiveTab('secrets') },
      { key: '2', meta: true, action: () => selectedVaultName && setActiveTab('keys') },
      { key: '3', meta: true, action: () => selectedVaultName && setActiveTab('certificates') },
      { key: '4', meta: true, action: () => selectedVaultName && setActiveTab('dashboard') },
      { key: '5', meta: true, action: () => selectedVaultName && setActiveTab('logs') },
    ];

    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;

      for (const s of shortcuts) {
        if (
          s.key === e.key.toLowerCase() &&
          (s.meta ? mod : true) &&
          (s.shift ? e.shiftKey : !e.shiftKey)
        ) {
          e.preventDefault();
          s.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    setCommandPaletteOpen,
    setSettingsOpen,
    toggleSidebar,
    toggleDetailPanel,
    setActiveTab,
    selectedVaultName,
  ]);
}

export function formatShortcut(key: string, meta = false, shift = false): string {
  const parts: string[] = [];
  if (meta) parts.push(isMac ? '⌘' : 'Ctrl');
  if (shift) parts.push(isMac ? '⇧' : 'Shift');
  parts.push(key.toUpperCase());
  return parts.join(isMac ? '' : '+');
}
