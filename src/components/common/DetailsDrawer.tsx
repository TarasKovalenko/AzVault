/**
 * DetailsDrawer.tsx – Secret details side panel.
 *
 * Provides:
 * - Secret metadata display (name, dates, tags)
 * - Secure fetch-on-demand for secret values (never auto-loaded)
 * - Reveal/copy with auto-clipboard-clear after 30 seconds
 * - Delete, recover, and purge actions with confirmation dialogs
 * - Optional re-authentication gate before fetching values
 */

import { useState, useCallback } from 'react';
import {
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  OverlayDrawer,
  Button,
  Text,
  Badge,
  Field,
  Input,
  Divider,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  tokens,
  Spinner,
  Tooltip,
} from '@fluentui/react-components';
import {
  Dismiss24Regular,
  Eye24Regular,
  EyeOff24Regular,
  Copy24Regular,
  Delete24Regular,
  ArrowUndo24Regular,
  Warning24Regular,
  Checkmark24Regular,
} from '@fluentui/react-icons';
import { format } from 'date-fns';
import type { SecretItem, SecretValue } from '../../types';
import { getSecretValue, deleteSecret, recoverSecret, purgeSecret } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';

interface DetailsDrawerProps {
  item: SecretItem | null;
  vaultUri: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => void;
}

export function DetailsDrawer({ item, vaultUri, open, onClose, onRefresh }: DetailsDrawerProps) {
  const [secretValue, setSecretValue] = useState<SecretValue | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [showFetchConfirm, setShowFetchConfirm] = useState(false);
  const [reauthConfirmed, setReauthConfirmed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [clipboardWarning, setClipboardWarning] = useState(false);
  const { requireReauthForReveal } = useAppStore();

  /** Fetch the secret value from Azure Key Vault. */
  const handleFetchValue = useCallback(async () => {
    if (!item) return;
    setFetching(true);
    setFetchError(null);
    try {
      const val = await getSecretValue(vaultUri, item.name);
      setSecretValue(val);
      setRevealed(false);
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setFetching(false);
    }
  }, [item, vaultUri]);

  /** Gate fetch behind optional re-auth confirmation. */
  const confirmAndFetch = useCallback(async () => {
    if (requireReauthForReveal && !reauthConfirmed) {
      setFetchError('Re-authentication confirmation required before fetching secret values.');
      return;
    }
    setShowFetchConfirm(false);
    await handleFetchValue();
  }, [handleFetchValue, requireReauthForReveal, reauthConfirmed]);

  /** Copy value to clipboard with auto-clear after 30 seconds. */
  const handleCopy = useCallback(() => {
    if (!secretValue?.value) return;
    navigator.clipboard.writeText(secretValue.value);
    setCopied(true);
    setClipboardWarning(true);

    // Security: clear clipboard after 30s to prevent lingering secrets
    setTimeout(() => {
      navigator.clipboard.writeText('').catch(() => {});
      setClipboardWarning(false);
    }, 30_000);

    setTimeout(() => setCopied(false), 2000);
  }, [secretValue]);

  /** Delete secret (recoverable if soft-delete is enabled). */
  const handleDelete = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      await deleteSecret(vaultUri, item.name);
      setShowDeleteDialog(false);
      onRefresh();
      onClose();
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh, onClose]);

  /** Recover a soft-deleted secret. */
  const handleRecover = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      await recoverSecret(vaultUri, item.name);
      onRefresh();
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh]);

  /** Permanently purge a deleted secret (irreversible). */
  const handlePurge = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      await purgeSecret(vaultUri, item.name);
      setShowPurgeDialog(false);
      onRefresh();
      onClose();
    } catch (e) {
      setFetchError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh, onClose]);

  /** Reset transient state when closing the drawer. */
  const handleClose = () => {
    setSecretValue(null);
    setRevealed(false);
    setFetchError(null);
    setCopied(false);
    setClipboardWarning(false);
    setReauthConfirmed(false);
    setShowFetchConfirm(false);
    onClose();
  };

  if (!item) return null;

  return (
    <>
      <OverlayDrawer
        open={open}
        onOpenChange={(_, d) => {
          if (!d.open) handleClose();
        }}
        position="end"
        size="medium"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={handleClose} />
            }
          >
            <span className="azv-mono">{item.name}</span>
          </DrawerHeaderTitle>
        </DrawerHeader>

        <DrawerBody style={{ padding: '0 24px 24px' }}>
          {/* Status badges */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className="azv-status-dot"
                style={{
                  background: item.enabled ? 'var(--azv-success)' : 'var(--azv-danger)',
                }}
              />
              <Text size={200}>{item.enabled ? 'Active' : 'Disabled'}</Text>
            </div>
            {item.managed && (
              <Badge appearance="outline" color="informative" size="small">
                Managed
              </Badge>
            )}
            {item.expires && new Date(item.expires) < new Date() && (
              <Badge appearance="filled" color="danger" size="small">
                Expired
              </Badge>
            )}
          </div>

          {/* Metadata fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <MetadataField label="Name" value={item.name} mono />
            <MetadataField label="ID" value={item.id} mono />
            <MetadataField label="Content Type" value={item.contentType || '—'} />
            <MetadataField
              label="Created"
              value={item.created ? format(new Date(item.created), 'PPpp') : '—'}
            />
            <MetadataField
              label="Updated"
              value={item.updated ? format(new Date(item.updated), 'PPpp') : '—'}
            />
            <MetadataField
              label="Expires"
              value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
            />
            <MetadataField
              label="Not Before"
              value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '—'}
            />

            {item.tags && Object.keys(item.tags).length > 0 && (
              <Field label="Tags">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(item.tags).map(([k, v]) => (
                    <Badge
                      key={k}
                      appearance="outline"
                      size="medium"
                      className="azv-tag-pill"
                      title={`${k}: ${v}`}
                    >
                      <span className="azv-tag-text">
                        {k}: {v}
                      </span>
                    </Badge>
                  ))}
                </div>
              </Field>
            )}
          </div>

          <Divider style={{ margin: '20px 0' }} />

          {/* Secret Value Section */}
          <Text weight="semibold" size={300} block style={{ marginBottom: 10 }}>
            Secret Value
          </Text>

          {!secretValue ? (
            <div>
              <Text block size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: 8 }}>
                Values are never loaded automatically. Click to fetch on-demand.
              </Text>
              <Button
                appearance="primary"
                size="small"
                icon={fetching ? <Spinner size="tiny" /> : <Eye24Regular />}
                onClick={() => setShowFetchConfirm(true)}
                disabled={fetching}
              >
                {fetching ? 'Fetching…' : 'Fetch Value'}
              </Button>
            </div>
          ) : (
            <div>
              <Field label="Value">
                <div style={{ display: 'flex', gap: 4, alignItems: 'start' }}>
                  <Input
                    type={revealed ? 'text' : 'password'}
                    value={secretValue.value}
                    readOnly
                    style={{ flex: 1, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                  />
                  <Tooltip content={revealed ? 'Hide' : 'Reveal'} relationship="label">
                    <Button
                      icon={revealed ? <EyeOff24Regular /> : <Eye24Regular />}
                      appearance="subtle"
                      size="small"
                      onClick={() => setRevealed(!revealed)}
                    />
                  </Tooltip>
                  <Tooltip content={copied ? 'Copied!' : 'Copy'} relationship="label">
                    <Button
                      icon={copied ? <Checkmark24Regular /> : <Copy24Regular />}
                      appearance="subtle"
                      size="small"
                      onClick={handleCopy}
                    />
                  </Tooltip>
                </div>
              </Field>

              {clipboardWarning && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    padding: '5px 10px',
                    background: tokens.colorPaletteYellowBackground1,
                    borderRadius: 4,
                    fontSize: 11,
                  }}
                >
                  <Warning24Regular
                    style={{ fontSize: 13, color: tokens.colorPaletteYellowForeground1 }}
                  />
                  <Text size={100} style={{ color: tokens.colorPaletteYellowForeground1 }}>
                    Clipboard will be cleared in 30s
                  </Text>
                </div>
              )}
            </div>
          )}

          {/* Error banner */}
          {fetchError && (
            <div
              style={{
                marginTop: 12,
                padding: 10,
                background: tokens.colorPaletteRedBackground1,
                borderRadius: 4,
              }}
            >
              <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                {fetchError}
              </Text>
            </div>
          )}

          <Divider style={{ margin: '20px 0' }} />

          {/* Danger zone actions */}
          <Text weight="semibold" size={300} block style={{ marginBottom: 10 }}>
            Actions
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              appearance="secondary"
              icon={<ArrowUndo24Regular />}
              size="small"
              onClick={handleRecover}
              disabled={actionLoading}
            >
              Recover
            </Button>
            <Button
              appearance="secondary"
              icon={<Delete24Regular />}
              size="small"
              onClick={() => setShowDeleteDialog(true)}
              style={{ color: 'var(--azv-danger)' }}
            >
              Delete
            </Button>
            <Button
              appearance="secondary"
              icon={<Warning24Regular />}
              size="small"
              onClick={() => setShowPurgeDialog(true)}
              style={{ color: 'var(--azv-danger)' }}
            >
              Purge
            </Button>
          </div>
        </DrawerBody>
      </OverlayDrawer>

      {/* ── Fetch confirmation dialog ── */}
      <Dialog open={showFetchConfirm} onOpenChange={(_, d) => setShowFetchConfirm(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Confirm Secret Fetch</DialogTitle>
            <DialogContent>
              <Text size={200}>
                Fetching will request the value from Azure Key Vault and hold it in
                memory for this session only.
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

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={showDeleteDialog} onOpenChange={(_, d) => setShowDeleteDialog(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Secret</DialogTitle>
            <DialogContent>
              Delete <strong className="azv-mono">{item.name}</strong>? Recoverable if soft-delete
              is enabled on the vault.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleDelete}
                disabled={actionLoading}
                style={{ background: tokens.colorPaletteRedBackground3 }}
              >
                {actionLoading ? <Spinner size="tiny" /> : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* ── Purge confirmation dialog ── */}
      <Dialog open={showPurgeDialog} onOpenChange={(_, d) => setShowPurgeDialog(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Purge Secret Permanently</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Warning24Regular style={{ color: 'var(--azv-danger)' }} />
                <Text weight="semibold" style={{ color: 'var(--azv-danger)' }}>
                  This action is irreversible.
                </Text>
              </div>
              <Text size={200}>
                Purging <strong className="azv-mono">{item.name}</strong> will permanently remove it.
              </Text>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowPurgeDialog(false)}>
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handlePurge}
                disabled={actionLoading}
                style={{ background: tokens.colorPaletteRedBackground3 }}
              >
                {actionLoading ? <Spinner size="tiny" /> : 'Purge Permanently'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

/** Small helper to display a label + value metadata row. */
function MetadataField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Field label={label}>
      <Text
        size={200}
        font={mono ? 'monospace' : undefined}
        style={{ wordBreak: 'break-all', color: tokens.colorNeutralForeground1, fontSize: 12 }}
      >
        {value}
      </Text>
    </Field>
  );
}
