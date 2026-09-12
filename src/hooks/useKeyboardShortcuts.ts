import { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import type { ItemTab } from '../types';

function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

const isMac = detectMac();

interface Shortcut {
  key: string;
  shift?: boolean;
  /** Only fires when a vault is selected. */
  needsVault?: boolean;
  /** Only fires while one of these tabs is showing. */
  tabs?: ItemTab[];
  /** Fires even while the caret is in a text field (navigation, not editing). */
  allowInEditable?: boolean;
  /** Fires even while a dialog covers the app. Only the palette wants this. */
  allowInOverlay?: boolean;
  action: () => void;
}

/**
 * A shortcut must not steal a key the caret is using: ⌘A has to select the text
 * in the "type delete to confirm" box, not the rows behind the dialog.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase());
}

function isOverlayOpen(): boolean {
  return document.querySelector('[role="dialog"]') !== null;
}

const emit = (event: string, detail?: unknown) =>
  window.dispatchEvent(new CustomEvent(event, { detail }));

/**
 * Global accelerators. Every shortcut advertised in the command palette and the
 * settings dialog is handled here, so the two never drift apart.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    const store = () => useAppStore.getState();
    const LIST_TABS: ItemTab[] = ['secrets', 'keys', 'certificates', 'logs'];
    const shortcuts: Shortcut[] = [
      {
        key: 'k',
        allowInEditable: true,
        allowInOverlay: true,
        action: () => store().setCommandPaletteOpen(true),
      },
      { key: ',', allowInEditable: true, action: () => store().setSettingsOpen(true) },
      { key: '\\', allowInEditable: true, action: () => store().toggleDetailPanel() },
      {
        key: '1',
        needsVault: true,
        allowInEditable: true,
        action: () => store().setActiveTab('secrets'),
      },
      {
        key: '2',
        needsVault: true,
        allowInEditable: true,
        action: () => store().setActiveTab('keys'),
      },
      {
        key: '3',
        needsVault: true,
        allowInEditable: true,
        action: () => store().setActiveTab('certificates'),
      },
      {
        key: '4',
        needsVault: true,
        allowInEditable: true,
        action: () => store().setActiveTab('dashboard'),
      },
      {
        key: '5',
        needsVault: true,
        allowInEditable: true,
        action: () => store().setActiveTab('logs'),
      },
      { key: 'n', needsVault: true, tabs: ['secrets'], action: () => emit('azv:new-secret') },
      { key: 'r', action: () => emit('azv:refresh') },
      { key: 'f', needsVault: true, tabs: LIST_TABS, action: () => emit('azv:focus-search') },
      { key: 'a', needsVault: true, tabs: ['secrets'], action: () => emit('azv:select-all') },
      {
        key: 'd',
        shift: true,
        needsVault: true,
        tabs: ['secrets'],
        action: () => emit('azv:delete-selected'),
      },
    ];

    const handler = (event: KeyboardEvent) => {
      const mod = isMac ? event.metaKey : event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      const editable = isEditableTarget(event.target);
      const overlayOpen = isOverlayOpen();
      for (const shortcut of shortcuts) {
        if (
          shortcut.key === key &&
          Boolean(shortcut.shift) === event.shiftKey &&
          (shortcut.allowInEditable || !editable) &&
          (shortcut.allowInOverlay || !overlayOpen) &&
          (!shortcut.needsVault || store().selectedVaultName) &&
          (!shortcut.tabs || shortcut.tabs.includes(store().activeTab))
        ) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

export function formatShortcut(key: string, meta = false, shift = false): string {
  const parts: string[] = [];
  if (meta) parts.push(isMac ? '⌘' : 'Ctrl');
  if (shift) parts.push(isMac ? '⇧' : 'Shift');
  parts.push(key.toUpperCase());
  return parts.join(isMac ? '' : '+');
}
