import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutoHide } from '../../hooks/useAutoHide';
import { getSecretValue } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { SecretValue } from '../../types';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Modal } from '../ui/Modal';

export function RevealSecretValue({
  secretName,
  vaultUri,
}: {
  secretName: string;
  vaultUri: string;
}) {
  const requireConfirmation = useAppStore((state) => state.requireReauthForReveal);
  const autoHideSeconds = useAppStore((state) => state.autoHideSeconds);
  const clipboardClearSeconds = useAppStore((state) => state.clipboardClearSeconds);
  const disableClipboardCopy = useAppStore((state) => state.disableClipboardCopy);
  const [secretValue, setSecretValue] = useState<SecretValue | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [clipboardWarning, setClipboardWarning] = useState(false);
  const requestRef = useRef(0);
  const { isRevealed, secondsLeft, reveal, hide } = useAutoHide({
    timeoutSeconds: autoHideSeconds,
    onHide: () => setSecretValue(null),
  });
  const fetchValue = useCallback(async () => {
    const request = ++requestRef.current;
    setFetching(true);
    setError(null);
    try {
      const result = await getSecretValue(vaultUri, secretName);
      if (request === requestRef.current) setSecretValue(result);
    } catch (caught) {
      if (request === requestRef.current) setError(String(caught));
    } finally {
      if (request === requestRef.current) setFetching(false);
    }
  }, [secretName, vaultUri]);
  useEffect(() => {
    requestRef.current += 1;
    setSecretValue(null);
    setFetching(false);
    setError(null);
    setConfirmOpen(false);
    setConfirmed(false);
    setCopied(false);
    setClipboardWarning(false);
    hide();
  }, [hide]);
  const confirmFetch = async () => {
    if (requireConfirmation && !confirmed)
      return setError('Confirmation required before fetching secret value.');
    setConfirmOpen(false);
    await fetchValue();
  };
  const copy = () => {
    if (!secretValue?.value || disableClipboardCopy) return;
    void navigator.clipboard.writeText(secretValue.value);
    setCopied(true);
    setClipboardWarning(true);
    window.setTimeout(() => setCopied(false), 2000);
    window.setTimeout(() => {
      void navigator.clipboard.writeText('').catch(() => undefined);
      setClipboardWarning(false);
    }, clipboardClearSeconds * 1000);
  };
  const clear = () => {
    setSecretValue(null);
    hide();
    setError(null);
    setCopied(false);
    setClipboardWarning(false);
    setConfirmed(false);
  };
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        Secret Value
      </h3>
      <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface-muted)] p-3">
        {!secretValue ? (
          <>
            <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
              Values are only fetched on demand and held in memory.
            </p>
            <Button
              variant="primary"
              size="xs"
              loading={fetching}
              icon={<Icon name="eye" />}
              onClick={() => setConfirmOpen(true)}
            >
              Fetch Value
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <Input
                className="mono min-w-0 flex-1"
                type={isRevealed ? 'text' : 'password'}
                value={secretValue.value}
                readOnly
              />
              <button
                type="button"
                title={isRevealed ? 'Hide' : 'Reveal'}
                onClick={() => (isRevealed ? hide() : reveal())}
                className="grid size-8 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"
              >
                <Icon name={isRevealed ? 'eye-off' : 'eye'} size={15} />
              </button>
              {!disableClipboardCopy && (
                <button
                  type="button"
                  title={copied ? 'Copied' : 'Copy'}
                  onClick={copy}
                  className="grid size-8 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"
                >
                  <Icon name={copied ? 'check' : 'copy'} size={15} />
                </button>
              )}
              <Button size="xs" variant="ghost" onClick={clear}>
                Clear
              </Button>
            </div>
            {isRevealed && secondsLeft > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                <Icon name="timer" size={12} />
                Auto-hide in {secondsLeft}s
              </p>
            )}
            {clipboardWarning && (
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-orange-500/10 px-2 py-1.5 text-[10px] text-[var(--warning)]">
                <Icon name="warning" size={12} />
                Clipboard clears in {clipboardClearSeconds}s
              </p>
            )}
          </>
        )}
      </div>
      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Fetch Secret Value"
        description={`The value stays in memory and is cleared after ${autoHideSeconds} seconds.`}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={fetching} onClick={confirmFetch}>
              Fetch
            </Button>
          </>
        }
      >
        {requireConfirmation && (
          <button
            type="button"
            onClick={() => setConfirmed((value) => !value)}
            className={`w-full rounded-xl border p-3 text-left text-xs ${confirmed ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--stroke)]'}`}
          >
            <span className="flex items-center gap-2">
              <Icon name={confirmed ? 'check' : 'shield'} />
              {confirmed
                ? 'Fetch intent confirmed'
                : 'Confirm that you intend to fetch this sensitive value'}
            </span>
          </button>
        )}
      </Modal>
    </section>
  );
}
