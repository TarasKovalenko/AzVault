import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAppToast } from '../../lib/toast';
import { deleteSecret, exportItems, listSecrets, setSecret } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { SecretItem } from '../../types';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled, renderTags } from '../common/ItemTable';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { Button } from '../ui/Button';
import { CreateSecretDialog } from './CreateSecretDialog';
import { DeleteByPrefixDialog } from './DeleteByPrefixDialog';
import { ImportSecretsDialog, type PendingImport } from './ImportSecretsDialog';
import { SecretDetails } from './SecretDetails';
import { SecretsToolbar } from './SecretsToolbar';
import {
  filterOutDeletedSecrets,
  getSelectedSecrets,
  nextDeleteProgress,
  pruneSelectedIds,
  removeSucceededSelection,
  toggleSelection,
  toggleSelectionAll,
} from './secretsBulkDeleteLogic';
import { type ExportFormat, exportSecretMetadata } from './secretsExport';
import { parseSecretsImportJson } from './secretsImport';

const columns: Column<SecretItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '30%',
    render: (item) => <span className="mono font-semibold">{item.name}</span>,
  },
  { key: 'enabled', label: 'Status', width: '10%', render: (item) => renderEnabled(item.enabled) },
  {
    key: 'contentType',
    label: 'Type',
    width: '15%',
    render: (item) => (
      <span className={`mono ${item.contentType ? '' : 'text-[var(--text-tertiary)]'}`}>
        {item.contentType || '—'}
      </span>
    ),
  },
  { key: 'updated', label: 'Updated', width: '20%', render: (item) => renderDate(item.updated) },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    render: (item) =>
      !item.expires ? (
        <span className="mono text-[var(--text-tertiary)]">Never</span>
      ) : (
        <span className={new Date(item.expires) < new Date() ? 'text-[var(--danger)]' : undefined}>
          {renderDate(item.expires)}
        </span>
      ),
  },
  { key: 'tags', label: 'Tags', width: '10%', render: (item) => renderTags(item.tags) },
];

function prepareImport(file: File, content: string, existingSecrets: SecretItem[]): PendingImport {
  const { requests } = parseSecretsImportJson(content);
  const existing = new Map(
    existingSecrets.map((secret) => [secret.name.toLowerCase(), secret.name]),
  );
  const counts = new Map<string, number>();
  const canonical = new Map<string, string>();
  for (const request of requests) {
    const key = request.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!canonical.has(key)) canonical.set(key, request.name);
  }
  const duplicateNamesInFile = Array.from(counts)
    .filter(([, count]) => count > 1)
    .map(([name]) => canonical.get(name) ?? name)
    .sort((a, b) => a.localeCompare(b));
  const existingSecretNames = Array.from(
    new Set(
      requests
        .filter((request) => existing.has(request.name.toLowerCase()))
        .map((request) => existing.get(request.name.toLowerCase()) ?? request.name),
    ),
  ).sort((a, b) => a.localeCompare(b));
  return {
    fileName: file.name,
    fileSizeBytes: file.size,
    requests,
    duplicateNamesInFile,
    existingSecretNames,
  };
}

function download(content: string, format: ExportFormat) {
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `azvault-secrets-${Date.now()}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

export function SecretsList() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const splitRatio = useAppStore((state) => state.splitRatio);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const queryClient = useQueryClient();
  const toast = useAppToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, completed: 0, failed: 0 });
  const [filter, setFilter] = useState('');
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const query = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const allSecrets = useMemo(() => query.data ?? [], [query.data]);
  const filtered = allSecrets.filter((secret) =>
    secret.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const visible = filtered.slice(0, visibleCount);
  const selectedSecrets = useMemo(
    () => getSelectedSecrets(allSecrets, selectedIds),
    [allSecrets, selectedIds],
  );
  const visibleIds = useMemo(() => visible.map((secret) => secret.id), [visible]);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const selectAllState: boolean | 'mixed' =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === visibleIds.length
        ? true
        : 'mixed';

  useEffect(() => {
    const existing = new Set(allSecrets.map((secret) => secret.id));
    setSelectedIds((current) => {
      const next = pruneSelectedIds(current, existing);
      return next.size === current.size ? current : next;
    });
  }, [allSecrets]);
  useEffect(() => {
    if (selectedSecret && !allSecrets.some((secret) => secret.id === selectedSecret.id))
      setSelectedSecret(null);
  }, [selectedSecret, allSecrets]);
  useEffect(() => {
    if (!bulkOpen) {
      setBulkError(null);
      setBulkProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [bulkOpen]);
  useEffect(() => {
    const create = () => setCreateOpen(true);
    const focus = () => document.querySelector<HTMLInputElement>('[data-azv-list-search]')?.focus();
    const prefix = () => setPrefixOpen(true);
    const importFile = () => {
      if (importInputRef.current) {
        importInputRef.current.value = '';
        importInputRef.current.click();
      }
    };
    window.addEventListener('azv:new-secret', create);
    window.addEventListener('azv:focus-search', focus);
    window.addEventListener('azv:delete-by-prefix', prefix);
    window.addEventListener('azv:import-secrets', importFile);
    return () => {
      window.removeEventListener('azv:new-secret', create);
      window.removeEventListener('azv:focus-search', focus);
      window.removeEventListener('azv:delete-by-prefix', prefix);
      window.removeEventListener('azv:import-secrets', importFile);
    };
  }, []);

  const chooseImport = () => {
    if (importInputRef.current) {
      importInputRef.current.value = '';
      importInputRef.current.click();
    }
  };
  const readImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedVaultUri) return;
    setImportLoading(true);
    try {
      setPendingImport(prepareImport(file, await file.text(), allSecrets));
      setImportOpen(true);
    } catch (caught) {
      toast.error('Import failed', String(caught));
    } finally {
      setImportLoading(false);
    }
  };
  const confirmImport = async () => {
    if (!pendingImport || !selectedVaultUri) return;
    setImportLoading(true);
    const failures: string[] = [];
    let successes = 0;
    try {
      for (const request of pendingImport.requests) {
        try {
          await setSecret(selectedVaultUri, request);
          successes += 1;
        } catch (caught) {
          failures.push(`${request.name}: ${String(caught)}`);
        }
      }
      await query.refetch();
      if (!failures.length)
        toast.success(
          'Import complete',
          `Imported ${successes} secret(s) from ${pendingImport.fileName}.`,
        );
      else
        toast.error(
          `Imported ${successes}/${pendingImport.requests.length}`,
          `${failures.length} failed. First error: ${failures[0]}`,
        );
    } finally {
      setImportLoading(false);
      setImportOpen(false);
      setPendingImport(null);
    }
  };
  const exportData = async (format: ExportFormat) => {
    await exportSecretMetadata(filtered, format, {
      exportItems,
      download,
      writeClipboard: navigator.clipboard?.writeText
        ? (content) => navigator.clipboard.writeText(content)
        : undefined,
      onError: () => toast.error('Export failed'),
      onSuccess: (mode) =>
        toast.success(
          mode === 'download'
            ? `${format.toUpperCase()} downloaded`
            : `${format.toUpperCase()} copied`,
        ),
    });
  };
  const bulkDelete = async () => {
    if (!selectedVaultUri || !selectedSecrets.length) return;
    setBulkLoading(true);
    setBulkError(null);
    setBulkProgress({ total: selectedSecrets.length, completed: 0, failed: 0 });
    const succeeded: string[] = [];
    let failed = 0;
    try {
      for (let index = 0; index < selectedSecrets.length; index += 5) {
        await Promise.all(
          selectedSecrets.slice(index, index + 5).map(async (secret) => {
            try {
              await deleteSecret(selectedVaultUri, secret.name);
              succeeded.push(secret.id);
            } catch {
              failed += 1;
            } finally {
              setBulkProgress((current) => nextDeleteProgress(current, failed));
            }
          }),
        );
      }
      setSelectedIds((current) => removeSucceededSelection(current, succeeded));
      queryClient.setQueryData<SecretItem[]>(['secrets', selectedVaultUri], (current) =>
        filterOutDeletedSecrets(current, succeeded),
      );
      if (failed) setBulkError(`${failed} secret(s) failed to delete.`);
      else setBulkOpen(false);
      await query.refetch();
    } catch (caught) {
      setBulkError(String(caught));
    } finally {
      setBulkLoading(false);
    }
  };

  const list = (
    <div className="flex h-full flex-col">
      <SecretsToolbar
        count={query.data ? filtered.length : undefined}
        total={allSecrets.length}
        filter={filter}
        selectedCount={selectedIds.size}
        importing={importLoading}
        deleting={bulkLoading}
        inputRef={importInputRef}
        onFilter={setFilter}
        onFile={readImport}
        onImport={chooseImport}
        onExport={exportData}
        onCreate={() => setCreateOpen(true)}
        onDeleteSelected={() => setBulkOpen(true)}
        onDeletePrefix={() => setPrefixOpen(true)}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => query.refetch()} />
        ) : !allSecrets.length ? (
          <EmptyState
            title="No secrets yet"
            description="This vault doesn't contain any secrets."
            action={{ label: 'New Secret', onClick: () => setCreateOpen(true) }}
          />
        ) : !filtered.length ? (
          <EmptyState
            title="No matches"
            description={`No secrets match '${filter}'.`}
            action={{ label: 'Clear Filter', onClick: () => setFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visible}
              columns={columns}
              selectedId={selectedSecret?.id}
              onSelect={setSelectedSecret}
              getItemId={(secret) => secret.id}
              selectable
              selectedIds={selectedIds}
              selectAllState={selectAllState}
              onToggleSelect={(id, checked) =>
                setSelectedIds((current) => toggleSelection(current, id, checked, bulkLoading))
              }
              onToggleSelectAll={(checked) =>
                setSelectedIds((current) =>
                  toggleSelectionAll(current, visibleIds, checked, bulkLoading),
                )
              }
            />
            {filtered.length > visibleCount && (
              <div className="flex justify-center p-3">
                <Button onClick={() => setVisibleCount((count) => count + 50)}>
                  Load 50 more ({filtered.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <CreateSecretDialog
        open={createOpen}
        vaultUri={selectedVaultUri!}
        onClose={() => setCreateOpen(false)}
        onCreated={() => query.refetch()}
      />
      <DangerConfirmDialog
        open={bulkOpen}
        title={`Delete ${selectedSecrets.length} Secrets`}
        description="Delete the selected secrets from this vault?"
        confirmText="delete"
        confirmLabel="Delete Selected"
        loading={bulkLoading}
        onConfirm={bulkDelete}
        onCancel={() => {
          if (!bulkLoading) setBulkOpen(false);
        }}
      >
        <details className="mt-3 rounded-xl border border-[var(--stroke)] p-2 text-xs">
          <summary>Selected items ({selectedSecrets.length})</summary>
          <div className="mono mt-2 max-h-40 overflow-auto">
            {selectedSecrets.map((secret) => (
              <div key={secret.id} className="px-1 py-0.5">
                {secret.name}
              </div>
            ))}
          </div>
        </details>
        {bulkLoading && (
          <p className="mt-2 text-xs">
            Deleting {bulkProgress.completed} / {bulkProgress.total} ({bulkProgress.failed} failed)
          </p>
        )}
        {bulkError && (
          <p className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-[var(--danger)]">
            {bulkError}
          </p>
        )}
      </DangerConfirmDialog>
      <DeleteByPrefixDialog
        open={prefixOpen}
        allSecrets={allSecrets}
        vaultUri={selectedVaultUri!}
        onDelete={(name) => deleteSecret(selectedVaultUri!, name)}
        onClose={() => setPrefixOpen(false)}
        onCompleted={(deletedIds) => {
          if (selectedVaultUri)
            queryClient.setQueryData<SecretItem[]>(['secrets', selectedVaultUri], (current) =>
              filterOutDeletedSecrets(current, deletedIds),
            );
          void query.refetch();
        }}
      />
      <ImportSecretsDialog
        pending={pendingImport}
        open={importOpen}
        loading={importLoading}
        onCancel={() => {
          if (!importLoading) {
            setImportOpen(false);
            setPendingImport(null);
          }
        }}
        onConfirm={confirmImport}
      />
    </div>
  );
  return (
    <SplitPane
      left={list}
      right={
        <SecretDetails
          item={selectedSecret}
          vaultUri={selectedVaultUri!}
          onClose={() => setSelectedSecret(null)}
          onRefresh={() => {
            void query.refetch();
          }}
        />
      }
      rightVisible={detailPanelOpen}
      defaultRatio={splitRatio}
      minLeft={320}
      minRight={260}
      onRatioChange={setSplitRatio}
    />
  );
}
