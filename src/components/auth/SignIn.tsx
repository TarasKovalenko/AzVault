import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  CardHeader,
  CardFooter,
  Button,
  Text,
  Spinner,
  Badge,
  Field,
  tokens,
} from '@fluentui/react-components';
import {
  ShieldKeyhole24Regular,
  Copy24Regular,
  Open24Regular,
  Checkmark24Regular,
} from '@fluentui/react-icons';
import { authStart, authPoll } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { useMockStore } from '../../stores/mockStore';
import type { DeviceCodeResponse } from '../../types';

export function SignIn() {
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const setSignedIn = useAppStore((s) => s.setSignedIn);
  const mockMode = useMockStore((s) => s.mockMode);
  const mockAvailable = useMockStore((s) => s.mockAvailable);
  const setMockMode = useMockStore((s) => s.setMockMode);

  const startSignIn = useCallback(async () => {
    setError(null);
    try {
      const resp = await authStart();
      setDeviceCode(resp);
      setPolling(true);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!polling || !deviceCode) return;

    const interval = (deviceCode.interval || 5) * 1000;
    pollTimerRef.current = setInterval(async () => {
      try {
        const done = await authPoll(deviceCode.device_code);
        if (done) {
          setPolling(false);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setSignedIn(true, 'User');
        }
      } catch (e) {
        const msg = String(e);
        if (!msg.includes('authorization_pending') && !msg.includes('slow_down')) {
          setPolling(false);
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setError(msg);
        }
      }
    }, interval);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [polling, deviceCode, setSignedIn]);

  const copyCode = useCallback(() => {
    if (deviceCode?.user_code) {
      navigator.clipboard.writeText(deviceCode.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [deviceCode]);

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
                AzVault Operator Login
              </Text>
              <Text block size={200} className="azv-title">
                Azure Key Vault Explorer
              </Text>
            </div>
          }
        />

        <div style={{ padding: '24px 0' }}>
          {!deviceCode && !error && (
            <div style={{ textAlign: 'center' }}>
              <Text block style={{ marginBottom: 10 }}>
                Sign in with your Azure account to browse and manage Key Vault secrets,
                keys, and certificates.
              </Text>
              <Text block size={200} style={{ marginBottom: 18, color: tokens.colorNeutralForeground3 }}>
                Uses the device code flow for secure authentication.
              </Text>
              <div className="azv-signin-terminal azv-mono" style={{ textAlign: 'left' }}>
                <p>$ az login --use-device-code</p>
                <p>&gt; scope: management.azure.com + vault.azure.net</p>
                <p>&gt; session: secure-cache (keyring)</p>
              </div>
            </div>
          )}

          {deviceCode && polling && (
            <div style={{ textAlign: 'center' }}>
              <Text block style={{ marginBottom: 16 }}>
                {deviceCode.message}
              </Text>

              <Field label="Your code">
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px',
                    background: tokens.colorNeutralBackground3,
                    borderRadius: tokens.borderRadiusLarge,
                    marginTop: 8,
                  }}
                >
                  <Text
                    size={700}
                    weight="bold"
                    font="monospace"
                    style={{ letterSpacing: '0.2em' }}
                  >
                    {deviceCode.user_code}
                  </Text>
                  <Button
                    icon={copied ? <Checkmark24Regular /> : <Copy24Regular />}
                    appearance="subtle"
                    onClick={copyCode}
                    title="Copy code"
                  />
                </div>
              </Field>

              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Spinner size="tiny" />
                <Text size={200}>Waiting for authentication...</Text>
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 12,
                background: tokens.colorPaletteRedBackground1,
                borderRadius: tokens.borderRadiusMedium,
                marginBottom: 16,
              }}
            >
              <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{error}</Text>
            </div>
          )}
        </div>

        <CardFooter
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {!deviceCode ? (
            <Button appearance="primary" size="large" onClick={startSignIn} style={{ width: '100%', borderRadius: 999 }}>
              Start Device Code Login
            </Button>
          ) : (
            <Button
              appearance="primary"
              icon={<Open24Regular />}
              onClick={() => window.open(deviceCode.verification_uri, '_blank')}
              style={{ width: '100%', borderRadius: 999 }}
            >
              Open Microsoft Login Page
            </Button>
          )}

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

          {mockAvailable && mockMode && !deviceCode && (
            <Button
              appearance="secondary"
              onClick={() => setSignedIn(true, 'demo@contoso.com')}
              style={{ width: '100%', borderRadius: 999 }}
            >
              Skip sign-in (Mock Data)
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
