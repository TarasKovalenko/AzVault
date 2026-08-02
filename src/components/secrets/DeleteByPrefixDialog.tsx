import { useEffect, useMemo, useState } from 'react';
import type { SecretItem } from '../../types';
import { Button, Spinner } from '../ui/Button';
import { Input } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { filterSecretsByPrefix } from './secretsBulkDeleteLogic';

export function DeleteByPrefixDialog({
  open,
  allSecrets,
  vaultUri,
  onDelete,
  onClose,
  onCompleted,
}: {
  open: boolean;
  allSecrets: SecretItem[];
  vaultUri: string;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
  onCompleted: (deletedIds: string[]) => void;
}) {
  const [prefix, setPrefix] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, failed: 0 });
  const matches = useMemo(() => filterSecretsByPrefix(allSecrets, prefix), [allSecrets, prefix]);
  const valid = confirmation.trim() === 'delete' && matches.length > 0;
  useEffect(() => {
    if (!open) {
      setPrefix('');
      setConfirmation('');
      setError(null);
      setProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [open]);
  const remove = async () => {
    if (!vaultUri || !matches.length) return;
    setLoading(true);
    setError(null);
    setProgress({ total: matches.length, completed: 0, failed: 0 });
    try {
      const results = await Promise.all(
        matches.map(async (item) => {
          try {
            await onDelete(item.name);
            return { id: item.id, ok: true };
          } catch {
            return { id: item.id, ok: false };
          } finally {
            setProgress((current) => ({ ...current, completed: current.completed + 1 }));
          }
        }),
      );
      const succeeded = results.filter((result) => result.ok).map((result) => result.id);
      const failed = results.length - succeeded.length;
      setProgress((current) => ({ ...current, failed }));
      onCompleted(succeeded);
      if (failed) setError(`${failed} secret(s) failed to delete. Check permissions.`);
      else onClose();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      closeDisabled={loading}
      title="Delete Secrets by Prefix"
      description="Every secret whose name starts with this prefix will be soft-deleted."
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} disabled={!valid} onClick={remove}>
            Delete {matches.length} Secret{matches.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Input
          className="mono"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
          placeholder="staging-"
          disabled={loading}
          autoFocus
        />
        <p className="text-xs text-[var(--text-secondary)]">
          Matching secrets:{' '}
          <strong className={matches.length ? 'text-[var(--danger)]' : ''}>{matches.length}</strong>
        </p>
        {prefix && (
          <div className="max-h-48 overflow-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface-muted)] p-2">
            {matches.length ? (
              matches.map((item) => (
                <div key={item.id} className="mono rounded-md px-2 py-1 text-xs">
                  {item.name}
                </div>
              ))
            ) : (
              <p className="p-2 text-xs italic text-[var(--text-tertiary)]">
                No secrets match this prefix.
              </p>
            )}
          </div>
        )}
        {matches.length > 0 && (
          <div className="grid gap-1.5 text-xs text-[var(--text-secondary)]">
            <span>
              Type <strong className="mono">delete</strong> to confirm:
            </span>
            <Input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              placeholder="delete"
              disabled={loading}
            />
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-xs">
            <Spinner size="sm" />
            Deleting {progress.completed} / {progress.total}
            {progress.failed ? ` (${progress.failed} failed)` : ''}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-500/10 p-2.5 text-xs text-[var(--danger)]">{error}</div>
        )}
      </div>
    </Modal>
  );
}
