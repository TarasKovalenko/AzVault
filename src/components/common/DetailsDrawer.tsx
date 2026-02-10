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

  const confirmAndFetch = useCallback(async () => {
    if (requireReauthForReveal && !reauthConfirmed) {
      setFetchError('Re-authentication confirmation is required before fetching a secret value.');
      return;
    }
    setShowFetchConfirm(false);
    await handleFetchValue();
  }, [handleFetchValue, requireReauthForReveal, reauthConfirmed]);

  const handleCopy = useCallback(() => {
    if (secretValue?.value) {
      navigator.clipboard.writeText(secretValue.value);
      setCopied(true);
      setClipboardWarning(true);

      // Clear clipboard after 30 seconds
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {});
        setClipboardWarning(false);
      }, 30000);

      setTimeout(() => setCopied(false), 2000);
    }
  }, [secretValue]);

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
        onOpenChange={(_, d) => { if (!d.open) handleClose(); }}
        position="end"
        size="medium"
      >
        <DrawerHeader>
          <DrawerHeaderTitle
            action={
              <Button
                appearance="subtle"
                icon={<Dismiss24Regular />}
                onClick={handleClose}
              />
            }
          >
            {item.name}
          </DrawerHeaderTitle>
        </DrawerHeader>
        <DrawerBody style={{ padding: '0 24px 24px' }}>
          {/* Status badges */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <Badge
              appearance="filled"
              color={item.enabled ? 'success' : 'danger'}
            >
              {item.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {item.managed && (
              <Badge appearance="outline" color="informative">
                Managed
              </Badge>
            )}
            {item.expires && new Date(item.expires) < new Date() && (
              <Badge appearance="filled" color="danger">
                Expired
              </Badge>
            )}
          </div>

          {/* Metadata fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <MetadataField label="Name" value={item.name} />
            <MetadataField label="ID" value={item.id} mono />
            <MetadataField label="Content Type" value={item.contentType || '-'} />
            <MetadataField
              label="Created"
              value={item.created ? format(new Date(item.created), 'PPpp') : '-'}
            />
            <MetadataField
              label="Updated"
              value={item.updated ? format(new Date(item.updated), 'PPpp') : '-'}
            />
            <MetadataField
              label="Expires"
              value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
            />
            <MetadataField
              label="Not Before"
              value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '-'}
            />

            {item.tags && Object.keys(item.tags).length > 0 && (
              <Field label="Tags">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                  {Object.entries(item.tags).map(([k, v]) => (
                    <Badge key={k} appearance="outline" size="medium" className="azv-tag-pill" title={`${k}: ${v}`}>
                      <span className="azv-tag-text">{k}: {v}</span>
                    </Badge>
                  ))}
                </div>
              </Field>
            )}
          </div>

          <Divider style={{ margin: '20px 0' }} />

          {/* Secret Value Section */}
          <Text weight="semibold" size={400} block style={{ marginBottom: 12 }}>
            Secret Value
          </Text>

          {!secretValue ? (
            <div>
              <Text block size={200} style={{ color: tokens.colorNeutralForeground3, marginBottom: 8 }}>
                Secret values are not loaded automatically for security. Click below to fetch.
              </Text>
              <Button
                appearance="primary"
                icon={fetching ? <Spinner size="tiny" /> : <Eye24Regular />}
                onClick={() => setShowFetchConfirm(true)}
                disabled={fetching}
              >
                {fetching ? 'Fetching...' : 'Fetch Secret Value'}
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
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <Tooltip content={revealed ? 'Hide' : 'Reveal'} relationship="label">
                    <Button
                      icon={revealed ? <EyeOff24Regular /> : <Eye24Regular />}
                      appearance="subtle"
                      onClick={() => setRevealed(!revealed)}
                    />
                  </Tooltip>
                  <Tooltip content={copied ? 'Copied!' : 'Copy to clipboard'} relationship="label">
                    <Button
                      icon={copied ? <Checkmark24Regular /> : <Copy24Regular />}
                      appearance="subtle"
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
                    padding: '6px 10px',
                    background: tokens.colorPaletteYellowBackground1,
                    borderRadius: tokens.borderRadiusMedium,
                  }}
                >
                  <Warning24Regular style={{ fontSize: 14, color: tokens.colorPaletteYellowForeground1 }} />
                  <Text size={200} style={{ color: tokens.colorPaletteYellowForeground1 }}>
                    Secret copied. Clipboard will be cleared in 30 seconds.
                  </Text>
                </div>
              )}
            </div>
          )}

          {fetchError && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                background: tokens.colorPaletteRedBackground1,
                borderRadius: tokens.borderRadiusMedium,
              }}
            >
              <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                {fetchError}
              </Text>
            </div>
          )}

          <Divider style={{ margin: '20px 0' }} />

          {/* Actions */}
          <Text weight="semibold" size={400} block style={{ marginBottom: 12 }}>
            Actions
          </Text>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              appearance="secondary"
              icon={<ArrowUndo24Regular />}
              onClick={handleRecover}
              disabled={actionLoading}
            >
              Recover (if deleted)
            </Button>
            <Button
              appearance="secondary"
              icon={<Delete24Regular />}
              onClick={() => setShowDeleteDialog(true)}
              style={{ color: tokens.colorPaletteRedForeground1 }}
            >
              Delete
            </Button>
            <Button
              appearance="secondary"
              icon={<Warning24Regular />}
              onClick={() => setShowPurgeDialog(true)}
              style={{ color: tokens.colorPaletteRedForeground1 }}
            >
              Purge (permanent)
            </Button>
          </div>
        </DrawerBody>
      </OverlayDrawer>

      {/* Delete Confirmation */}
      <Dialog open={showFetchConfirm} onOpenChange={(_, d) => setShowFetchConfirm(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Confirm Secret Fetch</DialogTitle>
            <DialogContent>
              Secret values are sensitive. Fetching will request the value from Azure Key Vault and keep it in memory only for this session.
              {requireReauthForReveal && (
                <div style={{ marginTop: 10 }}>
                  <Button
                    appearance={reauthConfirmed ? 'primary' : 'secondary'}
                    onClick={() => setReauthConfirmed((v) => !v)}
                    size="small"
                  >
                    {reauthConfirmed ? 'Re-auth confirmed' : 'Confirm recent re-authentication'}
                  </Button>
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowFetchConfirm(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={confirmAndFetch} disabled={fetching}>
                Fetch value
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={(_, d) => setShowDeleteDialog(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Secret</DialogTitle>
            <DialogContent>
              Are you sure you want to delete <strong>{item.name}</strong>? If soft-delete is enabled,
              the secret can be recovered.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleDelete} disabled={actionLoading}
                style={{ background: tokens.colorPaletteRedBackground3 }}>
                {actionLoading ? <Spinner size="tiny" /> : 'Delete'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* Purge Confirmation */}
      <Dialog open={showPurgeDialog} onOpenChange={(_, d) => setShowPurgeDialog(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Purge Secret Permanently</DialogTitle>
            <DialogContent>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Warning24Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
                <Text weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>
                  This action is irreversible!
                </Text>
              </div>
              Purging <strong>{item.name}</strong> will permanently remove it.
              It cannot be recovered after purging.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowPurgeDialog(false)}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handlePurge} disabled={actionLoading}
                style={{ background: tokens.colorPaletteRedBackground3 }}>
                {actionLoading ? <Spinner size="tiny" /> : 'Purge Permanently'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}

function MetadataField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Field label={label}>
      <Text
        size={200}
        font={mono ? 'monospace' : undefined}
        style={{
          wordBreak: 'break-all',
          color: tokens.colorNeutralForeground1,
        }}
      >
        {value}
      </Text>
    </Field>
  );
}
