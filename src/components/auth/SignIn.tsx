import {
  Badge,
  Button,
  Card,
  CardFooter,
  CardHeader,
  makeStyles,
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

const useStyles = makeStyles({
  shellCenter: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
  shellCenterWithPadding: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    padding: '20px',
  },
  card: {
    width: '580px',
    padding: '28px 32px',
  },
  headerIcon: {
    fontSize: '28px',
    color: tokens.colorBrandForeground1,
  },
  titleLetterSpacing: {
    letterSpacing: '-0.01em',
  },
  titleMargin: {
    marginTop: '2px',
  },
  contentPadding: {
    padding: '20px 0',
  },
  cliStatusBox: {
    padding: '12px 14px',
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground3,
    marginBottom: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cliStatusTitle: {
    marginBottom: '2px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  tenantText: {
    fontSize: '11px',
  },
  terminalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  terminalComment: {
    opacity: 0.5,
  },
  terminalHint: {
    marginTop: '6px',
    opacity: 0.6,
  },
  copyBtn: {
    color: 'var(--azv-terminal-fg)',
  },
  errorBox: {
    marginTop: '14px',
    padding: '10px 12px',
    background: tokens.colorPaletteRedBackground1,
    borderRadius: '4px',
    fontSize: '12px',
  },
  errorTitle: {
    color: tokens.colorPaletteRedForeground1,
  },
  errorBody: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: '4px',
  },
  errorBodyOpacity: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: '4px',
    opacity: 0.85,
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  connectBtn: {
    width: '100%',
    borderRadius: '4px',
  },
  mockBadgeRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  mockBadge: {
    cursor: 'pointer',
  },
  mockContinueBtn: {
    width: '100%',
    borderRadius: '4px',
  },
});

interface CliCheck {
  cliFound: boolean | null;
  cliVersion: string | null;
  sessionActive: boolean | null;
  userName: string | null;
  tenantId: string | null;
}

export function SignIn() {
  const classes = useStyles();
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
      <div className={`azv-shell ${classes.shellCenter}`}>
        <Spinner label="Checking Azure CLI session..." />
      </div>
    );
  }

  return (
    <div className={`azv-shell ${classes.shellCenterWithPadding}`}>
      <Card className={`azv-pane ${classes.card}`}>
        <CardHeader
          image={<ShieldLock24Regular className={classes.headerIcon} />}
          header={
            <div>
              <Text weight="bold" size={500} className={classes.titleLetterSpacing}>
                AzVault
              </Text>
              <Text block size={200} className={`azv-title ${classes.titleMargin}`}>
                Azure Key Vault Explorer
              </Text>
            </div>
          }
        />

        <div className={classes.contentPadding}>
          {/* CLI Status checks */}
          <div className={classes.cliStatusBox}>
            <Text size={200} weight="semibold" block className={classes.cliStatusTitle}>
              CLI Status
            </Text>
            <div className={classes.statusRow}>
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
            <div className={classes.statusRow}>
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
              <div className={classes.statusRow}>
                <StatusDot ok={true} />
                <Text size={200} className={`azv-mono ${classes.tenantText}`}>
                  Tenant: {cliCheck.tenantId}
                </Text>
              </div>
            )}
          </div>

          {/* Terminal instructions */}
          <div className="azv-terminal">
            <div className={classes.terminalRow}>
              <p>
                <span className="azv-prompt">$</span> <span className="azv-cmd">az login</span>
              </p>
              <Tooltip content={copiedCmd === 'az login' ? 'Copied!' : 'Copy'} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={copiedCmd === 'az login' ? <Checkmark24Regular /> : <Copy24Regular />}
                  onClick={() => copyCommand('az login')}
                  className={classes.copyBtn}
                />
              </Tooltip>
            </div>
            <div className={classes.terminalRow}>
              <p>
                <span className="azv-prompt">$</span>{' '}
                <span className="azv-cmd">az account set</span>{' '}
                <span className="azv-comment">--subscription &lt;id&gt;</span>{' '}
                <span className={classes.terminalComment}># optional</span>
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
                  className={classes.copyBtn}
                />
              </Tooltip>
            </div>
            <p className={classes.terminalHint}>Then click Connect below to verify the session.</p>
          </div>

          {/* Error */}
          {error && (
            <div className={classes.errorBox}>
              <Text size={200} weight="semibold" className={classes.errorTitle}>
                {error.includes('not found') || error.includes('not recognized')
                  ? 'Azure CLI not detected'
                  : error.includes('401') || error.includes('expired')
                    ? 'Session expired'
                    : 'Connection failed'}
              </Text>
              <Text size={200} block className={classes.errorBody}>
                {error}
              </Text>
              <Text size={200} block className={classes.errorBodyOpacity}>
                {error.includes('not found')
                  ? 'Install Azure CLI: https://aka.ms/install-azure-cli'
                  : "Run 'az login' in your terminal, then click Connect."}
              </Text>
            </div>
          )}
        </div>

        <CardFooter className={classes.footer}>
          <Button
            appearance="primary"
            size="large"
            onClick={checkCliSession}
            icon={loading ? <Spinner size="tiny" /> : <PlugConnected24Regular />}
            className={classes.connectBtn}
            disabled={loading}
          >
            {loading ? 'Checking Azure CLI session...' : 'Connect with Azure CLI'}
          </Button>

          {mockAvailable && (
            <div className={classes.mockBadgeRow}>
              <Badge
                appearance={mockMode ? 'filled' : 'outline'}
                color={mockMode ? 'success' : 'informative'}
                className={classes.mockBadge}
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
              className={classes.mockContinueBtn}
            >
              Continue with Mock Data
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
