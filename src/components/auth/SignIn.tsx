import { useCallback, useEffect, useState } from 'react';
import azvaultIcon from '../../assets/azvault-icon.png';
import { authStatus } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import { Badge } from '../ui/Badge';
import { Button, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';

interface CliCheck {
  cliFound: boolean | null;
  sessionActive: boolean | null;
  userName: string | null;
  tenantId: string | null;
}

function StatusRow({ ok, children }: { ok: boolean | null; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`size-2 rounded-full ${ok === null ? 'bg-[var(--text-tertiary)]' : ok ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`}
      />
      {children}
    </div>
  );
}

function TerminalCommand({
  command,
  suffix,
  copied,
  onCopy,
}: {
  command: string;
  suffix?: React.ReactNode;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="group flex items-center justify-between gap-3 py-1.5">
      <code className="mono min-w-0 text-[12px]">
        <span className="text-green-400">$</span> <span className="text-cyan-300">{command}</span>{' '}
        {suffix}
      </code>
      <button
        type="button"
        title="Copy command"
        onClick={onCopy}
        className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-400 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
      >
        <Icon name={copied ? 'check' : 'copy'} size={14} />
      </button>
    </div>
  );
}

export function SignIn() {
  const [loading, setLoading] = useState(false);
  const [autoConnecting, setAutoConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);
  const [cliCheck, setCliCheck] = useState<CliCheck>({
    cliFound: null,
    sessionActive: null,
    userName: null,
    tenantId: null,
  });
  const setSignedIn = useAppStore((state) => state.setSignedIn);
  const mockMode = useMockStore((state) => state.mockMode);
  const mockAvailable = useMockStore((state) => state.mockAvailable);
  const setMockMode = useMockStore((state) => state.setMockMode);

  const applyStatus = useCallback(
    (status: Awaited<ReturnType<typeof authStatus>>) => {
      setCliCheck({
        cliFound: true,
        sessionActive: status.signed_in,
        userName: status.user_name,
        tenantId: status.tenant_id,
      });
      if (status.signed_in) setSignedIn(true, status.user_name || 'Azure CLI User');
    },
    [setSignedIn],
  );

  useEffect(() => {
    let mounted = true;
    void authStatus()
      .then((status) => {
        if (mounted) applyStatus(status);
      })
      .catch(() => {
        if (mounted)
          setCliCheck((current) => ({ ...current, cliFound: false, sessionActive: false }));
      })
      .finally(() => {
        if (mounted) setAutoConnecting(false);
      });
    return () => {
      mounted = false;
    };
  }, [applyStatus]);

  const connect = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await authStatus();
      applyStatus(status);
      if (!status.signed_in) setError("Azure CLI session not found. Run 'az login' and retry.");
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  };

  const copy = (command: string) => {
    void navigator.clipboard.writeText(command);
    setCopiedCommand(command);
    window.setTimeout(() => setCopiedCommand(null), 2000);
  };

  if (autoConnecting)
    return (
      <div className="grid h-screen place-items-center bg-[var(--app-bg)]">
        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
          <Spinner />
          Checking Azure CLI session…
        </div>
      </div>
    );

  return (
    <main className="relative grid h-screen place-items-center overflow-auto bg-[radial-gradient(circle_at_50%_-20%,rgba(10,132,255,.2),transparent_45%),var(--app-bg)] p-6">
      <section className="mac-vibrancy w-full max-w-[560px] overflow-hidden rounded-[22px] border border-[var(--stroke)] shadow-[var(--shadow-window)]">
        <header className="flex items-center gap-3 border-b border-[var(--stroke)] px-6 py-5">
          <img src={azvaultIcon} alt="" className="size-11 shrink-0 object-contain" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">AzVault</h1>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">Azure Key Vault Explorer</p>
          </div>
        </header>
        <div className="grid gap-4 p-6">
          <div className="mac-panel grid gap-2 rounded-xl p-3.5">
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              Azure CLI status
            </p>
            <StatusRow ok={cliCheck.cliFound}>
              Azure CLI {cliCheck.cliFound ? 'detected' : 'not found'}
            </StatusRow>
            <StatusRow ok={cliCheck.sessionActive}>
              {cliCheck.sessionActive ? `Signed in as ${cliCheck.userName}` : 'No active session'}
            </StatusRow>
            {cliCheck.tenantId && (
              <StatusRow ok>
                <span className="mono truncate">Tenant {cliCheck.tenantId}</span>
              </StatusRow>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-[#1c1c1e] px-4 py-3 text-zinc-200 shadow-inner">
            <TerminalCommand
              command="az login"
              copied={copiedCommand === 'az login'}
              onCopy={() => copy('az login')}
            />
            <TerminalCommand
              command="az account set"
              suffix={<span className="text-amber-200">--subscription &lt;id&gt;</span>}
              copied={copiedCommand === 'az account set --subscription '}
              onCopy={() => copy('az account set --subscription ')}
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              Run these commands in Terminal, then connect again.
            </p>
          </div>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-[var(--danger)]">
              <p className="font-semibold">Connection failed</p>
              <p className="mt-1 leading-5">{error}</p>
            </div>
          )}
          <Button
            variant="primary"
            size="md"
            loading={loading}
            icon={<Icon name="plug" />}
            onClick={connect}
            className="w-full"
          >
            {loading ? 'Checking session…' : 'Connect with Azure CLI'}
          </Button>
          {mockAvailable && (
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={() => setMockMode(!mockMode)}>
                <Badge tone={mockMode ? 'green' : 'neutral'}>
                  Mock Mode {mockMode ? 'On' : 'Off'}
                </Badge>
              </button>
            </div>
          )}
          {mockAvailable && mockMode && (
            <Button
              icon={<Icon name="refresh" />}
              onClick={() => setSignedIn(true, 'demo@contoso.com')}
              className="w-full"
            >
              Continue with Mock Data
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
