import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  Checkmark24Regular,
  Copy24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Timer24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import { useCallback, useState } from 'react';
import { useAutoHide } from '../../hooks/useAutoHide';
import { getSecretValue } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { SecretValue } from '../../types';

interface RevealSecretValueProps {
  secretName: string;
  vaultUri: string;
}

export function RevealSecretValue({ secretName, vaultUri }: RevealSecretValueProps) {
  const { requireReauthForReveal, autoHideSeconds, clipboardClearSeconds, disableClipboardCopy } =
    useAppStore();

  const [secretValue, setSecretValue] = useState<SecretValue | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showFetchConfirm, setShowFetchConfirm] = useState(false);
  const [reauthConfirmed, setReauthConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipboardWarning, setClipboardWarning] = useState(false);

  const { isRevealed, secondsLeft, reveal, hide } = useAutoHide({
    timeoutSeconds: autoHideSeconds,
    onHide: () => {},
  });

  const handleFetchValue = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const val = await getSecretValue(vaultUri, secretName);
      setSecretValue(val);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  }, [secretName, vaultUri]);

  const confirmAndFetch = useCallback(async () => {
    if (requireReauthForReveal && !reauthConfirmed) {
      setFetchError('Re-authentication confirmation required.');
      return;
    }
    setShowFetchConfirm(false);
    await handleFetchValue();
  }, [handleFetchValue, requireReauthForReveal, reauthConfirmed]);

  const handleCopy = useCallback(() => {
    if (!secretValue?.value || disableClipboardCopy) return;
    navigator.clipboard.writeText(secretValue.value);
    setCopied(true);
    setClipboardWarning(true);
    setTimeout(() => setCopied(false), 2000);
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
      setClipboardWarning(false);
    }, clipboardClearSeconds * 1000);
  }, [secretValue, clipboardClearSeconds, disableClipboardCopy]);

  const handleRevealToggle = useCallback(() => {
    if (!isRevealed) reveal();
    else hide();
  }, [isRevealed, reveal, hide]);

  const clearValue = useCallback(() => {
    setSecretValue(null);
    hide();
    setFetchError(null);
    setCopied(false);
    setClipboardWarning(false);
    setReauthConfirmed(false);
  }, [hide]);

  return (
    <div>
      <Text weight="semibold" size={300} block style={{ marginBottom: 8 }}>
        Secret Value
      </Text>

      {!secretValue ? (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 6,
            border: `1px solid ${tokens.colorNeutralStroke2}`,
            background: tokens.colorNeutralBackground3,
          }}
        >
          <Text
            block
            size={200}
            style={{ color: tokens.colorNeutralForeground3, marginBottom: 8, lineHeight: 1.5 }}
          >
            Values are never loaded automatically. Fetching will retrieve the value from Azure Key
            Vault and hold it in memory only.
          </Text>
          <Button
            appearance="primary"
            size="small"
            icon={fetching ? <Spinner size="tiny" /> : <Eye24Regular />}
            onClick={() => setShowFetchConfirm(true)}
            disabled={fetching}
          >
            {fetching ? 'Fetching...' : 'Fetch Value'}
          </Button>
        </div>
      ) : (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 6,
            border: `1px solid ${tokens.colorNeutralStroke2}`,
            background: tokens.colorNeutralBackground3,
          }}
        >
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Input
              type={isRevealed ? 'text' : 'password'}
              value={secretValue.value}
              readOnly
              style={{ flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
            />
            <Tooltip content={isRevealed ? 'Hide' : 'Reveal'} relationship="label">
              <Button
                icon={isRevealed ? <EyeOff24Regular /> : <Eye24Regular />}
                appearance="subtle"
                size="small"
                onClick={handleRevealToggle}
              />
            </Tooltip>
            {!disableClipboardCopy && (
              <Tooltip content={copied ? 'Copied!' : 'Copy'} relationship="label">
                <Button
                  icon={copied ? <Checkmark24Regular /> : <Copy24Regular />}
                  appearance="subtle"
                  size="small"
                  onClick={handleCopy}
                />
              </Tooltip>
            )}
            <Button appearance="subtle" size="small" onClick={clearValue} style={{ fontSize: 11 }}>
              Clear
            </Button>
          </div>

          {isRevealed && secondsLeft > 0 && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11 }}
            >
              <Timer24Regular style={{ fontSize: 13, opacity: 0.6 }} />
              <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                Auto-hide in {secondsLeft}s
              </Text>
            </div>
          )}

          {clipboardWarning && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 6,
                padding: '4px 8px',
                background: tokens.colorPaletteYellowBackground1,
                borderRadius: 4,
                fontSize: 11,
              }}
            >
              <Warning24Regular
                style={{ fontSize: 13, color: tokens.colorPaletteYellowForeground1 }}
              />
              <Text size={100} style={{ color: tokens.colorPaletteYellowForeground1 }}>
                Clipboard will be cleared in {clipboardClearSeconds}s
              </Text>
            </div>
          )}
        </div>
      )}

      {fetchError && (
        <div
          style={{
            marginTop: 8,
            padding: '8px 12px',
            background: tokens.colorPaletteRedBackground1,
            borderRadius: 4,
          }}
        >
          <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
            {fetchError}
          </Text>
        </div>
      )}

      {/* Fetch confirmation dialog */}
      <Dialog open={showFetchConfirm} onOpenChange={(_, d) => setShowFetchConfirm(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Confirm Secret Fetch</DialogTitle>
            <DialogContent>
              <Text size={200} style={{ lineHeight: 1.5 }}>
                Fetching will retrieve the current value from Azure Key Vault. The value is held in
                memory only and is never written to disk or logs. It will be cleared when you close
                this panel or after {autoHideSeconds} seconds.
              </Text>
              {requireReauthForReveal && (
                <div style={{ marginTop: 10 }}>
                  <Button
                    appearance={reauthConfirmed ? 'primary' : 'secondary'}
                    onClick={() => setReauthConfirmed((v) => !v)}
                    size="small"
                  >
                    {reauthConfirmed ? 'Re-auth confirmed' : 'Confirm re-authentication'}
                  </Button>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowFetchConfirm(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={confirmAndFetch} disabled={fetching}>
                Fetch
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
