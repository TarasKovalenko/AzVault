import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardFooter,
  Button,
  Text,
  Badge,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { ShieldKeyhole24Regular, ArrowSync24Regular } from '@fluentui/react-icons';
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
      <Card className="azv-pane" style={{ width: 560, padding: '24px 28px' }}>
        <CardHeader
          image={<ShieldKeyhole24Regular style={{ fontSize: 32, color: tokens.colorBrandForeground1 }} />}
          header={
            <div>
              <Text weight="bold" size={600}>
                AzVault CLI Authentication
              </Text>
              <Text block size={200} className="azv-title">
                Azure Key Vault Explorer
              </Text>
            </div>
          }
        />

        <div style={{ padding: '20px 0' }}>
          <Text block style={{ marginBottom: 10 }}>
            This app uses your existing Azure CLI identity.
          </Text>
          <div className="azv-signin-terminal azv-mono" style={{ textAlign: 'left' }}>
            <p>$ az login</p>
            <p>$ az account set --subscription &lt;subscription-id&gt; (optional)</p>
            <p>$ open AzVault and click "Connect with Azure CLI"</p>
          </div>

          {error && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                background: tokens.colorPaletteRedBackground1,
                borderRadius: tokens.borderRadiusMedium,
              }}
            >
              <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>
            </div>
          )}
        </div>

        <CardFooter style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button
            appearance="primary"
            size="large"
            onClick={checkCliSession}
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            style={{ width: '100%', borderRadius: 999 }}
            disabled={loading}
          >
            {loading ? 'Checking Azure CLI session...' : 'Connect with Azure CLI'}
          </Button>

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
              onClick={() => setSignedIn(true, 'demo@contoso.com')}
              style={{ width: '100%', borderRadius: 999 }}
            >
              Continue with Mock Data
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
