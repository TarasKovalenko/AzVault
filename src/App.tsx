import {
  FluentProvider,
  makeStyles,
  Toaster,
  tokens,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';
import { LockClosed24Regular } from '@fluentui/react-icons';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { SignIn } from './components/auth/SignIn';
import { CertificatesList } from './components/certificates/CertificatesList';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { EmptyState } from './components/common/EmptyState';
import { KeysList } from './components/keys/KeysList';
import { ContentTabs } from './components/layout/ContentTabs';
import { Sidebar } from './components/layout/Sidebar';
import { StatusBar } from './components/layout/StatusBar';
import { TopBar } from './components/layout/TopBar';
import { AuditLog } from './components/logs/AuditLog';
import { SecretsList } from './components/secrets/SecretsList';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { VaultDashboard } from './components/vault/VaultDashboard';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { APP_TOASTER_ID } from './lib/toast';
import { useAppStore } from './stores/appStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const msg = String(error);
        if (msg.includes('401') || msg.includes('403')) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  middle: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  pane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    overflow: 'hidden',
    marginLeft: '0',
    borderLeft: 'none',
  },
  tabContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
});

function MainContent() {
  const { activeTab, selectedVaultName } = useAppStore();
  const classes = useStyles();

  if (!selectedVaultName) {
    return (
      <EmptyState
        icon={<LockClosed24Regular />}
        title="Select a Key Vault"
        description="Use the workspace switcher in the top bar — pick a tenant, then a subscription, then a vault — to browse its secrets, keys, and certificates. Press ⌘K / Ctrl+K to search anything."
      />
    );
  }

  return (
    <>
      <ContentTabs />
      <div className={classes.tabContent}>
        {activeTab === 'dashboard' && <VaultDashboard />}
        {activeTab === 'secrets' && <SecretsList />}
        {activeTab === 'keys' && <KeysList />}
        {activeTab === 'certificates' && <CertificatesList />}
        {activeTab === 'logs' && <AuditLog />}
      </div>
    </>
  );
}

function AppLayout() {
  useKeyboardShortcuts();
  const classes = useStyles();

  useEffect(() => {
    const onRefresh = () => queryClient.invalidateQueries();
    window.addEventListener('azv:refresh', onRefresh);
    return () => window.removeEventListener('azv:refresh', onRefresh);
  }, []);

  useEffect(() => {
    const onSignOut = async () => {
      const { authSignOut } = await import('./services/tauri');
      try {
        await authSignOut();
      } catch {
        /* ignore */
      }
      useAppStore.getState().signOut();
      queryClient.clear();
    };
    window.addEventListener('azv:sign-out', onSignOut);
    return () => window.removeEventListener('azv:sign-out', onSignOut);
  }, []);

  return (
    <div className={`azv-shell ${classes.shell}`}>
      <TopBar />
      <div className={classes.middle}>
        <Sidebar />
        <div className={`azv-pane ${classes.pane}`}>
          <MainContent />
        </div>
      </div>
      <StatusBar />
      <CommandPalette />
      <SettingsDialog />
    </div>
  );
}

function App() {
  const { isSignedIn, themeMode } = useAppStore();

  useEffect(() => {
    document.body.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  return (
    <FluentProvider theme={themeMode === 'dark' ? webDarkTheme : webLightTheme}>
      <QueryClientProvider client={queryClient}>
        {isSignedIn ? <AppLayout /> : <SignIn />}
        <Toaster toasterId={APP_TOASTER_ID} position="bottom-end" />
      </QueryClientProvider>
    </FluentProvider>
  );
}

export default App;
