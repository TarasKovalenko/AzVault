import {
  Badge,
  Button,
  Divider,
  Field,
  makeStyles,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowUndo24Regular,
  Delete24Regular,
  Dismiss24Regular,
  Edit24Regular,
  Key24Regular,
  Warning24Regular,
} from '@fluentui/react-icons';
import { format } from 'date-fns';
import { useCallback, useState } from 'react';
import { deleteSecret, purgeSecret, recoverSecret } from '../../services/tauri';
import type { SecretItem } from '../../types';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { CreateSecretDialog } from './CreateSecretDialog';
import { RevealSecretValue } from './RevealSecretValue';

const useStyles = makeStyles({
  root: {
    height: '100%',
    overflow: 'auto',
    padding: '16px 20px',
  },
  emptyRoot: {
    height: '100%',
  },
  emptyIcon: {
    fontSize: '36px',
    opacity: 0.3,
  },
  emptyTitle: {
    color: tokens.colorNeutralForeground3,
  },
  emptySubtitle: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '240px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  statusBadges: {
    display: 'flex',
    gap: '6px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tagsRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  divider: {
    margin: '16px 0',
  },
  actionsTitle: {
    marginBottom: '8px',
  },
  actionsRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  actionsRowSecond: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '8px',
  },
  dangerButton: {
    color: 'var(--azv-danger)',
  },
  errorBox: {
    marginTop: '10px',
    padding: '8px 12px',
    background: tokens.colorPaletteRedBackground1,
    borderRadius: '4px',
  },
  errorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  metaValue: {
    wordBreak: 'break-all',
    color: tokens.colorNeutralForeground1,
    fontSize: '12px',
  },
  metadataSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
});

interface SecretDetailsProps {
  item: SecretItem | null;
  vaultUri: string;
  onClose: () => void;
  onRefresh: () => void;
}

export function SecretDetails({ item, vaultUri, onClose, onRefresh }: SecretDetailsProps) {
  const classes = useStyles();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await deleteSecret(vaultUri, item.name);
      setShowDeleteDialog(false);
      onRefresh();
      onClose();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh, onClose]);

  const handleRecover = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await recoverSecret(vaultUri, item.name);
      onRefresh();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh]);

  const handlePurge = useCallback(async () => {
    if (!item) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await purgeSecret(vaultUri, item.name);
      setShowPurgeDialog(false);
      onRefresh();
      onClose();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setActionLoading(false);
    }
  }, [item, vaultUri, onRefresh, onClose]);

  if (!item) {
    return (
      <div className={`azv-empty ${classes.emptyRoot}`}>
        <Key24Regular className={classes.emptyIcon} />
        <Text size={300} weight="semibold" className={classes.emptyTitle}>
          No secret selected
        </Text>
        <Text size={200} className={classes.emptySubtitle}>
          Click a row in the table to view its metadata, fetch its value, or manage it.
        </Text>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <Text weight="semibold" size={400} className="azv-mono">
          {item.name}
        </Text>
        <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
      </div>

      {/* Status badges */}
      <div className={classes.statusBadges}>
        <div className={classes.statusRow}>
          <span
            className="azv-status-dot"
            style={{ background: item.enabled ? 'var(--azv-success)' : 'var(--azv-danger)' }}
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

      {/* Metadata */}
      <div className={classes.metadataSection}>
        <MetaField label="Name" value={item.name} mono />
        <MetaField label="ID" value={item.id} mono />
        <MetaField label="Content Type" value={item.contentType || '—'} />
        <MetaField
          label="Created"
          value={item.created ? format(new Date(item.created), 'PPpp') : '—'}
        />
        <MetaField
          label="Updated"
          value={item.updated ? format(new Date(item.updated), 'PPpp') : '—'}
        />
        <MetaField
          label="Expires"
          value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
        />
        <MetaField
          label="Not Before"
          value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '—'}
        />

        {item.tags && Object.keys(item.tags).length > 0 && (
          <Field label="Tags">
            <div className={classes.tagsRow}>
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

      <Divider className={classes.divider} />

      {/* Secret Value */}
      <RevealSecretValue secretName={item.name} vaultUri={vaultUri} />

      <Divider className={classes.divider} />

      {/* Actions */}
      <Text weight="semibold" size={300} block className={classes.actionsTitle}>
        Actions
      </Text>
      <div className={classes.actionsRow}>
        <Button
          appearance="primary"
          icon={<Edit24Regular />}
          size="small"
          onClick={() => setShowEditDialog(true)}
          disabled={actionLoading}
        >
          Edit
        </Button>
        <Button
          appearance="secondary"
          icon={<ArrowUndo24Regular />}
          size="small"
          onClick={handleRecover}
          disabled={actionLoading}
        >
          Recover
        </Button>
      </div>
      <div className={classes.actionsRowSecond}>
        <Button
          appearance="secondary"
          icon={<Delete24Regular />}
          size="small"
          onClick={() => setShowDeleteDialog(true)}
          className={classes.dangerButton}
          disabled={actionLoading}
        >
          Delete
        </Button>
        <Button
          appearance="secondary"
          icon={<Warning24Regular />}
          size="small"
          onClick={() => setShowPurgeDialog(true)}
          className={classes.dangerButton}
          disabled={actionLoading}
        >
          Purge Permanently
        </Button>
      </div>

      {actionError && (
        <div className={classes.errorBox}>
          <Text size={200} className={classes.errorText}>
            {actionError}
          </Text>
        </div>
      )}

      {/* Edit dialog */}
      <CreateSecretDialog
        open={showEditDialog}
        vaultUri={vaultUri}
        mode="edit"
        initialName={item.name}
        initialValue=""
        initialContentType={item.contentType}
        initialEnabled={item.enabled}
        initialExpires={item.expires}
        initialTags={item.tags}
        onClose={() => setShowEditDialog(false)}
        onCreated={() => {
          setShowEditDialog(false);
          onRefresh();
        }}
      />

      {/* Delete confirmation */}
      <DangerConfirmDialog
        open={showDeleteDialog}
        title="Delete Secret"
        description={
          <>
            Delete <strong className="azv-mono">{item.name}</strong>? If soft-delete is enabled on
            this vault, you can recover it within the retention period. Otherwise, this action is
            permanent.
          </>
        }
        confirmText="delete"
        confirmLabel="Delete"
        dangerLevel="warning"
        loading={actionLoading}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      {/* Purge confirmation */}
      <DangerConfirmDialog
        open={showPurgeDialog}
        title="Purge Secret Permanently"
        description={
          <>
            Purging <strong className="azv-mono">{item.name}</strong> will permanently destroy it
            and all its versions. This cannot be undone, even with soft-delete enabled.
          </>
        }
        confirmText="purge"
        confirmLabel="Purge Permanently"
        dangerLevel="critical"
        loading={actionLoading}
        onConfirm={handlePurge}
        onCancel={() => setShowPurgeDialog(false)}
      />
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const classes = useStyles();
  return (
    <Field label={label}>
      <Text size={200} font={mono ? 'monospace' : undefined} className={classes.metaValue}>
        {value}
      </Text>
    </Field>
  );
}
