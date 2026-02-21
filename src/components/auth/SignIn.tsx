import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  Spinner,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowSync24Regular,
  Checkmark24Regular,
  Copy24Regular,
  PlugConnected24Regular,
  ShieldLock24Regular,
} from '@fluentui/react-icons';
import { useEffect, useState } from 'react';
import { authStatus } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';

interface CliCheck {
  cliFound: boolean | null;
  cliVersion: string | null;
  sessionActive: boolean | null;
  userName: string | null;
  tenantId: string | null;
}

export function SignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cliCheck, setCliCheck] = useState<CliCheck>({
    cliFound: null,
    cliVersion: null,
    sessionActive: null,
    userName: null,
    tenantId: null,
  });
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [autoConnecting, setAutoConnecting] = useState(true);
  const setSignedIn = useAppStore((s) => s.setSignedIn);
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  const copyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  useEffect(() => {
    let mounted = true;
    const probeSession = async () => {
      try {
        const status = await authStatus();
        if (!mounted) return;
        setCliCheck({
          cliFound: true,
          cliVersion: null,
          sessionActive: status.signed_in,
          userName: status.user_name,
          tenantId: status.tenant_id,
        });
        if (status.signed_in) {
          setSignedIn(true, status.user_name || 'Azure CLI User');
        }
      } catch {
        if (!mounted) return;
        setCliCheck((prev) => ({
          ...prev,
          cliFound: false,
          sessionActive: false,
        }));
      } finally {
        if (mounted) setAutoConnecting(false);
      }
    };
    probeSession();
    return () => {
      mounted = false;
    };
  }, [setSignedIn]);

  const checkCliSession = async () => {
    setError(null);
    setLoading(true);
    try {
      const status = await authStatus();
      setCliCheck((prev) => ({
        ...prev,
        cliFound: true,
        sessionActive: status.signed_in,
        userName: status.user_name,
        tenantId: status.tenant_id,
      }));
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

  const StatusDot = ({ ok }: { ok: boolean | null }) => (
    <span
      className="azv-status-dot"
      style={{
        background:
          ok === null ? 'var(--azv-scroll-thumb)' : ok ? 'var(--azv-success)' : 'var(--azv-danger)',
      }}
    />
  );

  if (autoConnecting) {
    return (
      <div
        className="azv-shell"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}
      >
        <Spinner label="Checking Azure CLI session..." />
      </div>
    );
  }

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
      <Card className="azv-pane" style={{ width: 580, padding: '28px 32px' }}>
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
          {/* CLI Status checks */}
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              border: `1px solid ${tokens.colorNeutralStroke2}`,
              background: tokens.colorNeutralBackground3,
              marginBottom: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <Text size={200} weight="semibold" block style={{ marginBottom: 2 }}>
              CLI Status
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot ok={cliCheck.cliFound} />
              <Text size={200}>
                Azure CLI:{' '}
                {cliCheck.cliFound === null
                  ? 'Checking...'
                  : cliCheck.cliFound
                    ? 'Found'
                    : 'Not found'}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <StatusDot ok={cliCheck.sessionActive} />
              <Text size={200}>
                Session:{' '}
                {cliCheck.sessionActive === null
                  ? 'Checking...'
                  : cliCheck.sessionActive
                    ? `Signed in as ${cliCheck.userName}`
                    : 'Not signed in'}
              </Text>
            </div>
            {cliCheck.tenantId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot ok={true} />
                <Text size={200} className="azv-mono" style={{ fontSize: 11 }}>
                  Tenant: {cliCheck.tenantId}
                </Text>
              </div>
            )}
          </div>

          {/* Terminal instructions */}
          <div className="azv-terminal">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p>
                <span className="azv-prompt">$</span> <span className="azv-cmd">az login</span>
              </p>
              <Tooltip content={copiedCmd === 'az login' ? 'Copied!' : 'Copy'} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={copiedCmd === 'az login' ? <Checkmark24Regular /> : <Copy24Regular />}
                  onClick={() => copyCommand('az login')}
                  style={{ color: 'var(--azv-terminal-fg)' }}
                />
              </Tooltip>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p>
                <span className="azv-prompt">$</span>{' '}
                <span className="azv-cmd">az account set</span>{' '}
                <span className="azv-comment">--subscription &lt;id&gt;</span>{' '}
                <span style={{ opacity: 0.5 }}># optional</span>
              </p>
              <Tooltip
                content={copiedCmd === 'az account set --subscription ' ? 'Copied!' : 'Copy'}
                relationship="label"
              >
                <Button
                  appearance="subtle"
                  size="small"
                  icon={
                    copiedCmd === 'az account set --subscription ' ? (
                      <Checkmark24Regular />
                    ) : (
                      <Copy24Regular />
                    )
                  }
                  onClick={() => copyCommand('az account set --subscription ')}
                  style={{ color: 'var(--azv-terminal-fg)' }}
                />
              </Tooltip>
            </div>
            <p style={{ marginTop: 6, opacity: 0.6 }}>
              Then click Connect below to verify the session.
            </p>
          </div>

          {/* Error */}
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
              <Text
                size={200}
                weight="semibold"
                style={{ color: tokens.colorPaletteRedForeground1 }}
              >
                {error.includes('not found') || error.includes('not recognized')
                  ? 'Azure CLI not detected'
                  : error.includes('401') || error.includes('expired')
                    ? 'Session expired'
                    : 'Connection failed'}
              </Text>
              <Text
                size={200}
                block
                style={{ color: tokens.colorPaletteRedForeground1, marginTop: 4 }}
              >
                {error}
              </Text>
              <Text
                size={200}
                block
                style={{ color: tokens.colorPaletteRedForeground1, marginTop: 4, opacity: 0.85 }}
              >
                {error.includes('not found')
                  ? 'Install Azure CLI: https://aka.ms/install-azure-cli'
                  : "Run 'az login' in your terminal, then click Connect."}
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
