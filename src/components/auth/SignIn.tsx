/**
 * SignIn.tsx – Azure CLI authentication screen.
 *
 * Shows a terminal-style panel with instructions for `az login`,
 * then validates the CLI session via the Tauri backend.
 * Mock-mode toggle is available when VITE_ENABLE_MOCK_MODE=true.
 */

import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSync24Regular,
  PlugConnected24Regular,
  ShieldLock24Regular,
} from '@fluentui/react-icons';
import { useState } from 'react';
import { authStatus } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';

export function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSignedIn = useAppStore((s) => s.setSignedIn);
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  /** Probe Azure CLI for an active session. */
  const checkCliSession = async () => {
    setError(null);
    setLoading(true);
    try {
      const status = await authStatus();
      if (status.signed_in) {
        setSignedIn(true, status.user_name || 'Azure CLI User');
      } else {
        setError("Azure CLI session not found. Run 'az login' in your terminal and retry.");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="azv-shell"
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        padding: 20,
      }}
    >
      <Card className="azv-pane" style={{ width: 560, padding: '28px 32px' }}>
        <CardHeader
          image={
            <ShieldLock24Regular style={{ fontSize: 28, color: tokens.colorBrandForeground1 }} />
          }
          header={
            <div>
              <Text weight="bold" size={500} style={{ letterSpacing: '-0.01em' }}>
                AzVault
              </Text>
              <Text block size={200} className="azv-title" style={{ marginTop: 2 }}>
                Azure Key Vault Explorer
              </Text>
            </div>
          }
        />

        <div style={{ padding: '20px 0' }}>
          <Text
            block
            size={200}
            style={{ marginBottom: 12, color: tokens.colorNeutralForeground2 }}
          >
            Authenticate using your existing Azure CLI identity.
          </Text>

          {/* Terminal-style instruction panel */}
          <div className="azv-terminal">
            <p>
              <span className="azv-prompt">$</span> <span className="azv-cmd">az login</span>
            </p>
            <p>
              <span className="azv-prompt">$</span> <span className="azv-cmd">az account set</span>{' '}
              <span className="azv-comment">--subscription &lt;id&gt;</span>{' '}
              <span style={{ opacity: 0.5 }}># optional</span>
            </p>
            <p style={{ marginTop: 6, opacity: 0.6 }}>
              Then click Connect below to verify the session.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                marginTop: 14,
                padding: '10px 12px',
                background: tokens.colorPaletteRedBackground1,
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                {error}
              </Text>
            </div>
          )}
        </div>

        <CardFooter style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            appearance="primary"
            size="large"
            onClick={checkCliSession}
            icon={loading ? <Spinner size="tiny" /> : <PlugConnected24Regular />}
            style={{ width: '100%', borderRadius: 4 }}
            disabled={loading}
          >
            {loading ? 'Checking Azure CLI session…' : 'Connect with Azure CLI'}
          </Button>

          {/* Mock mode controls (dev builds only) */}
          {mockAvailable && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
              <Badge
                appearance={mockMode ? 'filled' : 'outline'}
                color={mockMode ? 'success' : 'informative'}
                style={{ cursor: 'pointer' }}
                onClick={() => setMockMode(!mockMode)}
              >
                {mockMode ? 'Mock Mode ON' : 'Mock Mode OFF'}
              </Badge>
            </div>
          )}

          {mockAvailable && mockMode && (
            <Button
              appearance="secondary"
              icon={<ArrowSync24Regular />}
              onClick={() => setSignedIn(true, 'demo@contoso.com')}
              style={{ width: '100%', borderRadius: 4 }}
            >
              Continue with Mock Data
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
