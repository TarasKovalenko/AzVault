import { useEffect } from 'react';
import { FluentProvider, webDarkTheme, webLightTheme, tokens } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppStore } from './stores/appStore';
import { SignIn } from './components/auth/SignIn';
import { Sidebar } from './components/layout/Sidebar';
import { TopBar } from './components/layout/TopBar';
import { ContentTabs } from './components/layout/ContentTabs';
import { SecretsList } from './components/secrets/SecretsList';
import { KeysList } from './components/keys/KeysList';
import { CertificatesList } from './components/certificates/CertificatesList';
import { AuditLog } from './components/logs/AuditLog';
import { AccessView } from './components/access/AccessView';
import { StatusBar } from './components/layout/StatusBar';
import { authStatus } from './services/tauri';

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

function MainContent() {
  const { activeTab, selectedVaultName } = useAppStore();

  if (!selectedVaultName) {
    return <ContentTabs />;
  }

  return (
    <>
      <ContentTabs />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'secrets' && <SecretsList />}
        {activeTab === 'keys' && <KeysList />}
        {activeTab === 'certificates' && <CertificatesList />}
        {activeTab === 'access' && <AccessView />}
        {activeTab === 'logs' && <AuditLog />}
      </div>
    </>
  );
}

function AppLayout() {
  return (
    <div className="azv-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar />
        <div
          className="azv-pane"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            background: tokens.colorNeutralBackground1,
            overflow: 'hidden',
            marginLeft: 0,
            borderLeft: 'none',
          }}
        >
          <MainContent />
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

function App() {
  const { isSignedIn, setSignedIn, themeMode } = useAppStore();

  useEffect(() => {
    let mounted = true;
    authStatus()
      .then((s) => {
        if (!mounted || !s.signed_in) return;
        setSignedIn(true, s.user_name ?? 'Azure User');
      })
      .catch(() => {
        // Keep sign-in state false if status check fails
      });
    return () => {
      mounted = false;
    };
  }, [setSignedIn]);

  useEffect(() => {
    document.body.setAttribute('data-theme', themeMode);
  }, [themeMode]);

  return (
    <FluentProvider theme={themeMode === 'dark' ? webDarkTheme : webLightTheme}>
      <QueryClientProvider client={queryClient}>
        {isSignedIn ? <AppLayout /> : <SignIn />}
      </QueryClientProvider>
    </FluentProvider>
  );
}

export default App;
