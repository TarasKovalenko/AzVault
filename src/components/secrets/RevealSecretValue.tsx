import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  makeStyles,
  Spinner,
  Text,
  tokens,
  Tooltip,
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

const useStyles = makeStyles({
  sectionTitle: {
    marginBottom: '8px',
  },
  box: {
    padding: '12px 14px',
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground3,
  },
  hintText: {
    color: tokens.colorNeutralForeground3,
    marginBottom: '8px',
    lineHeight: 1.5,
  },
  row: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '12px',
  },
  clearButton: {
    fontSize: '11px',
  },
  autoHideRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    fontSize: '11px',
  },
  timerIcon: {
    fontSize: '13px',
    opacity: 0.6,
  },
  autoHideText: {
    color: tokens.colorNeutralForeground3,
  },
  clipboardWarning: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    padding: '4px 8px',
    background: tokens.colorPaletteYellowBackground1,
    borderRadius: '4px',
    fontSize: '11px',
  },
  warningIcon: {
    fontSize: '13px',
    color: tokens.colorPaletteYellowForeground1,
  },
  warningText: {
    color: tokens.colorPaletteYellowForeground1,
  },
  fetchError: {
    marginTop: '8px',
    padding: '8px 12px',
    background: tokens.colorPaletteRedBackground1,
    borderRadius: '4px',
  },
  fetchErrorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  dialogContent: {
    lineHeight: 1.5,
  },
  reauthSection: {
    marginTop: '10px',
  },
});

interface RevealSecretValueProps {
  secretName: string;
  vaultUri: string;
}

export function RevealSecretValue({ secretName, vaultUri }: RevealSecretValueProps) {
  const styles = useStyles();
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
    onHide: () => setSecretValue(null),
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
      setFetchError('Confirmation required before fetching secret value.');
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
      <Text weight="semibold" size={300} block className={styles.sectionTitle}>
        Secret Value
      </Text>

      {!secretValue ? (
        <div className={styles.box}>
          <Text block size={200} className={styles.hintText}>
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
        <div className={styles.box}>
          <div className={styles.row}>
            <Input
              type={isRevealed ? 'text' : 'password'}
              value={secretValue.value}
              readOnly
              className={styles.input}
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
            <Button appearance="subtle" size="small" onClick={clearValue} className={styles.clearButton}>
              Clear
            </Button>
          </div>

          {isRevealed && secondsLeft > 0 && (
            <div className={styles.autoHideRow}>
              <Timer24Regular className={styles.timerIcon} />
              <Text size={100} className={styles.autoHideText}>
                Auto-hide in {secondsLeft}s
              </Text>
            </div>
          )}

          {clipboardWarning && (
            <div className={styles.clipboardWarning}>
              <Warning24Regular className={styles.warningIcon} />
              <Text size={100} className={styles.warningText}>
                Clipboard will be cleared in {clipboardClearSeconds}s
              </Text>
            </div>
          )}
        </div>
      )}

      {fetchError && (
        <div className={styles.fetchError}>
          <Text size={200} className={styles.fetchErrorText}>
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
              <Text size={200} className={styles.dialogContent}>
                Fetching will retrieve the current value from Azure Key Vault. The value is held in
                memory only and is never written to disk or logs. It will be cleared when you close
                this panel or after {autoHideSeconds} seconds.
              </Text>
              {requireReauthForReveal && (
                <div className={styles.reauthSection}>
                  <Button
                    appearance={reauthConfirmed ? 'primary' : 'secondary'}
                    onClick={() => setReauthConfirmed((v) => !v)}
                    size="small"
                  >
                    {reauthConfirmed ? 'Confirmation complete' : 'Confirm fetch intent'}
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
