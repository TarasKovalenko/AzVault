import { format } from 'date-fns';
import { useCallback, useState } from 'react';
import { deleteSecret, purgeSecret } from '../../services/tauri';
import type { SecretItem } from '../../types';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { DetailField } from '../common/DetailField';
import { EmptyState } from '../common/EmptyState';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { CreateSecretDialog } from './CreateSecretDialog';
import { RevealSecretValue } from './RevealSecretValue';

export function SecretDetails({
  item,
  vaultUri,
  onClose,
  onRefresh,
}: {
  item: SecretItem | null;
  vaultUri: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runAction = useCallback(
    async (action: 'delete' | 'purge') => {
      if (!item) return;
      setLoading(true);
      setError(null);
      try {
        if (action === 'delete') await deleteSecret(vaultUri, item.name);
        else await purgeSecret(vaultUri, item.name);
        setDeleteOpen(false);
        setPurgeOpen(false);
        onRefresh();
        onClose();
      } catch (caught) {
        setError(String(caught));
      } finally {
        setLoading(false);
      }
    },
    [item, vaultUri, onRefresh, onClose],
  );
  if (!item)
    return (
      <EmptyState
        icon={<Icon name="lock" />}
        title="No secret selected"
        description="Select a row to inspect metadata, fetch its value, or manage it."
      />
    );
  const expired = Boolean(item.expires && new Date(item.expires) < new Date());
  return (
    <div className="h-full overflow-auto p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="mono truncate text-[15px] font-semibold">{item.name}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid size-7 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span
            className={`size-1.5 rounded-full ${item.enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`}
          />
          {item.enabled ? 'Active' : 'Disabled'}
        </span>
        {item.managed && <Badge tone="blue">Managed</Badge>}
        {expired && <Badge tone="red">Expired</Badge>}
      </div>
      <dl>
        <DetailField label="Name" value={item.name} mono />
        <DetailField label="ID" value={item.id} mono />
        <DetailField label="Content Type" value={item.contentType || '—'} />
        <DetailField
          label="Created"
          value={item.created ? format(new Date(item.created), 'PPpp') : '—'}
        />
        <DetailField
          label="Updated"
          value={item.updated ? format(new Date(item.updated), 'PPpp') : '—'}
        />
        <DetailField
          label="Expires"
          value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
        />
        <DetailField
          label="Not Before"
          value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '—'}
        />
        {item.tags && Object.keys(item.tags).length ? (
          <DetailField label="Tags">
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.tags).map(([key, value]) => (
                <Badge key={key}>
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </DetailField>
        ) : null}
      </dl>
      <div className="my-5 border-t border-[var(--stroke)]" />
      <RevealSecretValue
        key={`${vaultUri}:${item.name}`}
        secretName={item.name}
        vaultUri={vaultUri}
      />
      <div className="my-5 border-t border-[var(--stroke)]" />
      <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
          Actions
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="xs"
            icon={<Icon name="edit" />}
            onClick={() => setEditOpen(true)}
            disabled={loading}
          >
            Edit
          </Button>
          <Button
            size="xs"
            icon={<Icon name="delete" />}
            onClick={() => setDeleteOpen(true)}
            disabled={loading}
          >
            Delete
          </Button>
        </div>
      </section>
      <section className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-[var(--danger)]">
          <Icon name="warning" size={14} />
          Danger zone
        </h3>
        <p className="my-2 text-[11px] leading-4 text-[var(--text-secondary)]">
          Purging permanently destroys this secret and every version.
        </p>
        <Button
          variant="danger"
          size="xs"
          icon={<Icon name="warning" />}
          onClick={() => setPurgeOpen(true)}
          disabled={loading}
        >
          Purge Permanently
        </Button>
      </section>
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 p-2.5 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <CreateSecretDialog
        open={editOpen}
        vaultUri={vaultUri}
        mode="edit"
        initialName={item.name}
        initialValue=""
        initialContentType={item.contentType}
        initialEnabled={item.enabled}
        initialExpires={item.expires}
        initialTags={item.tags}
        onClose={() => setEditOpen(false)}
        onCreated={() => {
          setEditOpen(false);
          onRefresh();
        }}
      />
      <DangerConfirmDialog
        open={deleteOpen}
        title="Delete Secret"
        description={
          <>
            Delete <strong className="mono">{item.name}</strong>? It may be recoverable if
            soft-delete is enabled.
          </>
        }
        confirmText="delete"
        confirmLabel="Delete"
        loading={loading}
        onConfirm={() => runAction('delete')}
        onCancel={() => setDeleteOpen(false)}
      />
      <DangerConfirmDialog
        open={purgeOpen}
        title="Purge Secret Permanently"
        description={
          <>
            Permanently destroy <strong className="mono">{item.name}</strong> and all versions. This
            cannot be undone.
          </>
        }
        confirmText="purge"
        confirmLabel="Purge Permanently"
        dangerLevel="critical"
        loading={loading}
        onConfirm={() => runAction('purge')}
        onCancel={() => setPurgeOpen(false)}
      />
    </div>
  );
}
