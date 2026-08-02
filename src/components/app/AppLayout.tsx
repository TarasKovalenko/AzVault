import { useEffect } from 'react';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { queryClient } from '../../lib/queryClient';
import { authSignOut } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { CommandPalette } from '../command-palette/CommandPalette';
import { NavigationRail } from '../layout/NavigationRail';
import { StatusBar } from '../layout/StatusBar';
import { TopBar } from '../layout/TopBar';
import { SettingsDialog } from '../settings/SettingsDialog';
import { MainContent } from './MainContent';

function useAppEvents() {
  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries();
    window.addEventListener('azv:refresh', refresh);
    return () => window.removeEventListener('azv:refresh', refresh);
  }, []);

  useEffect(() => {
    const signOut = async () => {
      try {
        await authSignOut();
      } catch {
        // The local session still needs to be cleared if Azure sign-out fails.
      }
      useAppStore.getState().signOut();
      queryClient.clear();
    };

    const handleSignOut = () => void signOut();
    window.addEventListener('azv:sign-out', handleSignOut);
    return () => window.removeEventListener('azv:sign-out', handleSignOut);
  }, []);
}

export function AppLayout() {
  useKeyboardShortcuts();
  useAppEvents();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--app-bg)]">
      <TopBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <NavigationRail />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[var(--surface-solid)]">
          <MainContent />
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}
