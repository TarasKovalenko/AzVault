import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../ui/Toast';
import {
  deleteSecret,
  exportItems,
  listSecrets,
  saveExport,
  setSecret,
} from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { SecretItem } from '../../types';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import {
  ItemTable,
  renderDate,
  renderEnabled,
  renderExpiry,
  renderName,
  renderTags,
} from '../common/ItemTable';
import { ListPager, PAGE_SIZE } from '../common/ListPager';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { nextSortState, sortItems } from '../common/useTableSort';
import { CreateSecretDialog } from './CreateSecretDialog';
import { DeleteByPrefixDialog } from './DeleteByPrefixDialog';
import { ImportSecretsDialog, type PendingImport } from './ImportSecretsDialog';
import { SecretDetails } from './SecretDetails';
import { SecretsToolbar } from './SecretsToolbar';
import {
  DELETE_BATCH_SIZE,
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
  { key: 'name', label: 'Name', width: '30%', sortValue: (item) => item.name, render: renderName },
  {
    key: 'enabled',
    label: 'Status',
    width: '10%',
    sortValue: (item) => Number(item.enabled),
    render: (item) => renderEnabled(item.enabled),
  },
  {
    key: 'contentType',
    label: 'Type',
    width: '15%',
    sortValue: (item) => item.contentType ?? '',
    render: (item) => (
      <span className={`mono ${item.contentType ? '' : 'text-[var(--text-tertiary)]'}`}>
        {item.contentType || '—'}
      </span>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: '20%',
    sortValue: (item) => item.updated,
    render: (item) => renderDate(item.updated),
  },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    sortValue: (item) => item.expires,
    render: (item) => renderExpiry(item.expires),
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

export function SecretsList() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const splitRatio = useAppStore((state) => state.splitRatio);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const queryClient = useQueryClient();
  const toast = useToast();
  const importInputRef = useRef<HTMLInputElement>(null);
  const view = useAppStore((state) => state.listViews.secrets);
  const setListView = useAppStore((state) => state.setListView);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState({ total: 0, completed: 0, failed: 0 });
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
  const filter = view.filter;
  const filtered = useMemo(
    () => allSecrets.filter((secret) => secret.name.toLowerCase().includes(filter.toLowerCase())),
    [allSecrets, filter],
  );
  const { sortKey, sortDirection } = view;
  const sort = useMemo(
    () => (sortKey ? { key: sortKey, direction: sortDirection } : null),
    [sortKey, sortDirection],
  );
  const sorted = useMemo(() => sortItems(filtered, columns, sort), [filtered, sort]);
  const visible = sorted.slice(0, view.visibleCount);
  const selectedSecret = allSecrets.find((secret) => secret.id === view.selectedId) ?? null;
  // Bulk actions operate on what the filter currently shows, so the count in the
  // selection bar can never disagree with the rows on screen.
  const selectedSecrets = useMemo(
    () => getSelectedSecrets(filtered, selectedIds),
    [filtered, selectedIds],
  );
  const filteredIds = useMemo(() => filtered.map((secret) => secret.id), [filtered]);
  const selectedMatchCount = filteredIds.filter((id) => selectedIds.has(id)).length;
  const selectAllState: boolean | 'mixed' =
    selectedMatchCount === 0 ? false : selectedMatchCount === filteredIds.length ? true : 'mixed';
  const setFilter = (value: string) =>
    setListView('secrets', { filter: value, visibleCount: PAGE_SIZE });

  // Command-palette handlers are registered once; refs keep them current.
  // Written in an effect, never during render: a discarded concurrent render
  // must not leave a stale closure behind.
  const filteredIdsRef = useRef<string[]>([]);
  const selectedCountRef = useRef(0);
  const exportRef = useRef<(format: ExportFormat) => Promise<void>>(async () => {});

  useEffect(() => {
    const existing = new Set(allSecrets.map((secret) => secret.id));
    setSelectedIds((current) => {
      const next = pruneSelectedIds(current, existing);
      return next.size === current.size ? current : next;
    });
  }, [allSecrets]);
  useEffect(() => {
    filteredIdsRef.current = filteredIds;
    // The count the shortcut acts on has to be the one the user can see, which
    // is the selection inside the current filter.
    selectedCountRef.current = selectedMatchCount;
    exportRef.current = exportData;
  });
  useEffect(() => {
    if (!bulkOpen) {
      setBulkError(null);
      setBulkProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [bulkOpen]);
  // Honour a "new secret" requested from another view before this one existed.
  useEffect(() => {
    if (useAppStore.getState().consumeSecretsAction() === 'new-secret') setCreateOpen(true);
  }, []);

  useEffect(() => {
    const create = () => setCreateOpen(true);
    const prefix = () => setPrefixOpen(true);
    const importFile = () => {
      if (importInputRef.current) {
        importInputRef.current.value = '';
        importInputRef.current.click();
      }
    };
    const selectAll = () => setSelectedIds(new Set(filteredIdsRef.current));
    const deselectAll = () => setSelectedIds(new Set());
    const deleteSelected = () => {
      if (selectedCountRef.current > 0) setBulkOpen(true);
    };
    const exportCurrent = (event: Event) => {
      const format = (event as CustomEvent<ExportFormat>).detail;
      if (format === 'json' || format === 'csv') void exportRef.current(format);
    };
    window.addEventListener('azv:new-secret', create);
    window.addEventListener('azv:delete-by-prefix', prefix);
    window.addEventListener('azv:import-secrets', importFile);
    window.addEventListener('azv:select-all', selectAll);
    window.addEventListener('azv:deselect-all', deselectAll);
    window.addEventListener('azv:delete-selected', deleteSelected);
    window.addEventListener('azv:export', exportCurrent);
    return () => {
      window.removeEventListener('azv:new-secret', create);
      window.removeEventListener('azv:delete-by-prefix', prefix);
      window.removeEventListener('azv:import-secrets', importFile);
      window.removeEventListener('azv:select-all', selectAll);
      window.removeEventListener('azv:deselect-all', deselectAll);
      window.removeEventListener('azv:delete-selected', deleteSelected);
      window.removeEventListener('azv:export', exportCurrent);
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
    await exportSecretMetadata(selectedSecrets.length ? selectedSecrets : filtered, format, {
      exportItems,
      save: saveExport,
      writeClipboard: navigator.clipboard?.writeText
        ? (content) => navigator.clipboard.writeText(content)
        : undefined,
      onError: (error) => toast.error('Export failed', String(error)),
      onSuccess: (mode, target) =>
        toast.success(
          mode === 'file' ? `${format.toUpperCase()} saved` : `${format.toUpperCase()} copied`,
          mode === 'file' ? target : 'Saving failed, so the export went to the clipboard.',
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
      for (let index = 0; index < selectedSecrets.length; index += DELETE_BATCH_SIZE) {
        await Promise.all(
          selectedSecrets.slice(index, index + DELETE_BATCH_SIZE).map(async (secret) => {
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
        matchCount={filtered.length}
        filter={filter}
        selectedCount={selectedMatchCount}
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
        onClearSelection={() => setSelectedIds(new Set())}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => query.refetch()} />
        ) : !allSecrets.length ? (
          <EmptyState
            title="No secrets yet"
            description="This vault has no secrets."
            action={{ label: 'New secret', onClick: () => setCreateOpen(true) }}
          />
        ) : !filtered.length ? (
          <EmptyState
            title="No matches"
            description={`No secrets match “${filter}”.`}
            action={{ label: 'Clear filter', onClick: () => setFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visible}
              columns={columns}
              selectedId={selectedSecret?.id}
              onSelect={(secret) => setListView('secrets', { selectedId: secret.id })}
              getItemId={(secret) => secret.id}
              selectable
              selectedIds={selectedIds}
              selectAllState={selectAllState}
              onToggleSelect={(id, checked) =>
                setSelectedIds((current) => toggleSelection(current, id, checked, bulkLoading))
              }
              onToggleSelectAll={(checked) =>
                setSelectedIds((current) =>
                  toggleSelectionAll(current, filteredIds, checked, bulkLoading),
                )
              }
              selectAllLabel={`Select all ${filteredIds.length} matching secrets`}
              sort={sort}
              onSort={(key) => {
                const next = nextSortState(sort, key);
                setListView('secrets', {
                  sortKey: next?.key ?? null,
                  sortDirection: next?.direction ?? 'asc',
                });
              }}
            />
            <ListPager
              shown={visible.length}
              total={filtered.length}
              onShowMore={() =>
                setListView('secrets', { visibleCount: view.visibleCount + PAGE_SIZE })
              }
            />
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
        title={`Delete ${selectedSecrets.length} secret${selectedSecrets.length === 1 ? '' : 's'}`}
        description="Delete the selected secrets from this vault?"
        confirmText="delete"
        confirmLabel="Delete selected"
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
          onClose={() => setListView('secrets', { selectedId: null })}
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
