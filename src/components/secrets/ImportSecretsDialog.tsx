import type { CreateSecretRequest } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface PendingImport {
  fileName: string;
  fileSizeBytes: number;
  requests: CreateSecretRequest[];
  duplicateNamesInFile: string[];
  existingSecretNames: string[];
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportSecretsDialog({
  pending,
  open,
  loading,
  onCancel,
  onConfirm,
}: {
  pending: PendingImport | null;
  open: boolean;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={loading}
      title="Import Secrets"
      description="Review the file before creating secrets or new versions."
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={onConfirm}>
            Import Secrets
          </Button>
        </>
      }
    >
      {pending && (
        <div className="grid gap-3">
          <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-xs">
            <dt className="text-[var(--text-tertiary)]">File</dt>
            <dd className="mono break-all">{pending.fileName}</dd>
            <dt className="text-[var(--text-tertiary)]">Size</dt>
            <dd className="mono">{fileSize(pending.fileSizeBytes)}</dd>
            <dt className="text-[var(--text-tertiary)]">Secrets</dt>
            <dd className="mono">{pending.requests.length}</dd>
            <dt className="text-[var(--text-tertiary)]">Updating existing</dt>
            <dd className="mono">{pending.existingSecretNames.length}</dd>
          </dl>
          {pending.duplicateNamesInFile.length > 0 && (
            <div className="rounded-lg bg-orange-500/10 p-2.5 text-xs text-[var(--warning)]">
              Duplicate names: {pending.duplicateNamesInFile.join(', ')}
            </div>
          )}
          {pending.existingSecretNames.length > 0 && (
            <div className="rounded-lg bg-orange-500/10 p-2.5 text-xs text-[var(--warning)]">
              New versions will be created for: {pending.existingSecretNames.slice(0, 5).join(', ')}
              {pending.existingSecretNames.length > 5
                ? ` (+${pending.existingSecretNames.length - 5} more)`
                : ''}
            </div>
          )}
          <div className="rounded-xl border border-[var(--stroke)] bg-[var(--surface-muted)] p-2">
            <p className="px-1 pb-1 text-[11px] font-semibold text-[var(--text-secondary)]">
              Secrets to import
            </p>
            <div className="max-h-44 overflow-auto">
              {pending.requests.slice(0, 30).map((request, index) => (
                <div key={`${request.name}-${index}`} className="mono rounded-md px-2 py-1 text-xs">
                  {request.name}
                </div>
              ))}
              {pending.requests.length > 30 && (
                <p className="px-2 py-1 text-[10px] text-[var(--text-tertiary)]">
                  +{pending.requests.length - 30} more
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
