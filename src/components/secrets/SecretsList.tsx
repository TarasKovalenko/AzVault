import { Button, Input, Text, tokens } from '@fluentui/react-components';
import {
  Add24Regular,
  ArrowDownload24Regular,
  Delete24Regular,
  Search24Regular,
} from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { deleteSecret, exportItems, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { SecretItem } from '../../types';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled, renderTags } from '../common/ItemTable';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { CreateSecretDialog } from './CreateSecretDialog';
import { SecretDetails } from './SecretDetails';
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

const columns: Column<SecretItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '30%',
    render: (item) => (
      <Text weight="semibold" size={200} className="azv-mono">
        {item.name}
      </Text>
    ),
  },
  {
    key: 'enabled',
    label: 'Status',
    width: '10%',
    render: (item) => renderEnabled(item.enabled),
  },
  {
    key: 'contentType',
    label: 'Type',
    width: '15%',
    render: (item) => (
      <Text size={200} className="azv-mono" style={{ opacity: item.contentType ? 1 : 0.4 }}>
        {item.contentType || '—'}
      </Text>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: '20%',
    render: (item) => renderDate(item.updated),
  },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    render: (item) => {
      if (!item.expires)
        return (
          <Text size={200} style={{ opacity: 0.4 }}>
            Never
          </Text>
        );
      const expired = new Date(item.expires) < new Date();
      return (
        <Text
          size={200}
          className="azv-mono"
          style={{ color: expired ? 'var(--azv-danger)' : undefined, fontSize: 11 }}
        >
          {renderDate(item.expires)}
        </Text>
      );
    },
  },
  {
    key: 'tags',
    label: 'Tags',
    width: '10%',
    render: (item) => renderTags(item.tags),
  },
];

export function SecretsList() {
  const { selectedVaultUri, searchQuery, detailPanelOpen, splitRatio, setSplitRatio } =
    useAppStore();
  const queryClient = useQueryClient();
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({
    total: 0,
    completed: 0,
    failed: 0,
  });
  const [localFilter, setLocalFilter] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportMessageTone, setExportMessageTone] = useState<'success' | 'error'>('success');

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const allSecrets = useMemo(() => secretsQuery.data ?? [], [secretsQuery.data]);
  const filterText = localFilter || searchQuery;
  const filteredSecrets = allSecrets.filter((s) =>
    s.name.toLowerCase().includes(filterText.toLowerCase()),
  );
  const visibleSecrets = filteredSecrets.slice(0, visibleCount);
  const selectedSecrets = useMemo(
    () => getSelectedSecrets(allSecrets, selectedIds),
    [allSecrets, selectedIds],
  );

  const visibleIds = useMemo(() => visibleSecrets.map((s) => s.id), [visibleSecrets]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds],
  );
  const selectAllState: boolean | 'mixed' =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === visibleIds.length
        ? true
        : 'mixed';

  useEffect(() => {
    const existingIds = new Set(allSecrets.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = pruneSelectedIds(prev, existingIds);
      return next.size === prev.size ? prev : next;
    });
  }, [allSecrets]);

  useEffect(() => {
    if (!selectedSecret) return;
    const stillExists = allSecrets.some((s) => s.id === selectedSecret.id);
    if (!stillExists) setSelectedSecret(null);
  }, [selectedSecret, allSecrets]);

  useEffect(() => {
    if (!showBulkDeleteConfirm) {
      setBulkDeleteError(null);
      setBulkDeleteProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [showBulkDeleteConfirm]);

  useEffect(() => {
    if (!exportMessage) return;
    const timer = window.setTimeout(() => setExportMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [exportMessage]);

  // Listen for custom events from command palette
  useEffect(() => {
    const onNewSecret = () => setCreateOpen(true);
    const onFocusSearch = () => {
      const input = document.querySelector<HTMLInputElement>('[data-azv-list-search]');
      input?.focus();
    };
    window.addEventListener('azv:new-secret', onNewSecret);
    window.addEventListener('azv:focus-search', onFocusSearch);
    return () => {
      window.removeEventListener('azv:new-secret', onNewSecret);
      window.removeEventListener('azv:focus-search', onFocusSearch);
    };
  }, []);

  const downloadExport = (content: string, format: ExportFormat) => {
    const mimeType = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `azvault-secrets-${Date.now()}.${format}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: ExportFormat) => {
    await exportSecretMetadata(filteredSecrets, format, {
      exportItems,
      download: downloadExport,
      writeClipboard: navigator.clipboard?.writeText
        ? (content) => navigator.clipboard.writeText(content)
        : undefined,
      onError: () => {
        setExportMessageTone('error');
        setExportMessage('Export failed.');
      },
      onSuccess: (mode) => {
        setExportMessageTone('success');
        setExportMessage(
          mode === 'download'
            ? `${format.toUpperCase()} downloaded.`
            : `${format.toUpperCase()} copied.`,
        );
      },
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedVaultUri) return;
    const items = selectedSecrets;
    if (items.length === 0) return;

    setBulkDeleteLoading(true);
    setBulkDeleteError(null);
    setBulkDeleteProgress({ total: items.length, completed: 0, failed: 0 });

    const succeededIds: string[] = [];
    let failed = 0;

    try {
      await Promise.all(
        items.map(async (item) => {
          try {
            await deleteSecret(selectedVaultUri, item.name);
            succeededIds.push(item.id);
          } catch {
            failed += 1;
          } finally {
            setBulkDeleteProgress((prev) => nextDeleteProgress(prev, failed));
          }
        }),
      );

      setSelectedIds((prev) => removeSucceededSelection(prev, succeededIds));

      if (selectedVaultUri && succeededIds.length > 0) {
        queryClient.setQueryData<SecretItem[]>(['secrets', selectedVaultUri], (current) =>
          filterOutDeletedSecrets(current, succeededIds),
        );
      }

      if (failed > 0) {
        setBulkDeleteError(`${failed} secret(s) failed to delete. Check permissions.`);
      } else {
        setShowBulkDeleteConfirm(false);
      }

      await secretsQuery.refetch();
    } catch (e) {
      setBulkDeleteError(String(e));
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  const listPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <Text weight="semibold" size={300}>
            Secrets
          </Text>
          {secretsQuery.data && (
            <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3 }}>
              ({filteredSecrets.length}
              {filterText ? ` / ${allSecrets.length}` : ''})
            </Text>
          )}
          {selectedIds.size > 0 && (
            <Text size={200} className="azv-mono" style={{ color: tokens.colorBrandForeground1 }}>
              {selectedIds.size} selected
            </Text>
          )}
          <Input
            data-azv-list-search
            placeholder="Filter..."
            contentBefore={<Search24Regular style={{ fontSize: 14 }} />}
            size="small"
            value={localFilter}
            onChange={(_, d) => setLocalFilter(d.value)}
            style={{ marginLeft: 'auto', maxWidth: 180, fontSize: 12 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('json')}
            title="Export JSON"
          />
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('csv')}
            title="Export CSV"
          />
          <Button
            appearance="primary"
            icon={<Add24Regular />}
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            New
          </Button>
          <Button
            appearance="secondary"
            icon={<Delete24Regular />}
            size="small"
            disabled={selectedIds.size === 0 || bulkDeleteLoading}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            Delete{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </Button>
        </div>
      </div>

      {exportMessage && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
            background:
              exportMessageTone === 'success'
                ? tokens.colorPaletteGreenBackground1
                : tokens.colorPaletteRedBackground1,
          }}
        >
          <Text
            size={200}
            className="azv-mono"
            style={{
              color:
                exportMessageTone === 'success'
                  ? tokens.colorPaletteGreenForeground1
                  : tokens.colorPaletteRedForeground1,
            }}
          >
            {exportMessage}
          </Text>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px', minHeight: 0 }}>
        {secretsQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[30, 10, 15, 20, 15, 10]} />
        ) : secretsQuery.isError ? (
          <div style={{ padding: 16 }}>
            <ErrorMessage
              error={String(secretsQuery.error)}
              onRetry={() => secretsQuery.refetch()}
            />
          </div>
        ) : allSecrets.length === 0 ? (
          <EmptyState
            title="No secrets yet"
            description="This vault doesn't contain any secrets. Create one to get started."
            action={{ label: '+ New Secret', onClick: () => setCreateOpen(true) }}
          />
        ) : filteredSecrets.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No secrets match '${filterText}'. Try a different search term.`}
            action={{ label: 'Clear Filter', onClick: () => setLocalFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visibleSecrets}
              columns={columns}
              loading={false}
              selectedId={selectedSecret?.id}
              onSelect={(item) => setSelectedSecret(item)}
              getItemId={(s) => s.id}
              selectable
              selectedIds={selectedIds}
              selectAllState={selectAllState}
              onToggleSelect={(id, checked) =>
                setSelectedIds((prev) => toggleSelection(prev, id, checked, bulkDeleteLoading))
              }
              onToggleSelectAll={(checked) =>
                setSelectedIds((prev) =>
                  toggleSelectionAll(prev, visibleIds, checked, bulkDeleteLoading),
                )
              }
            />
            {filteredSecrets.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
                <Button
                  onClick={() => setVisibleCount((c) => c + 50)}
                  appearance="secondary"
                  size="small"
                >
                  Load 50 more ({filteredSecrets.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create dialog */}
      <CreateSecretDialog
        open={createOpen}
        vaultUri={selectedVaultUri!}
        onClose={() => setCreateOpen(false)}
        onCreated={() => secretsQuery.refetch()}
      />

      {/* Bulk delete */}
      <DangerConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selectedSecrets.length} Secret${selectedSecrets.length !== 1 ? 's' : ''}`}
        description={
          <>
            Delete <strong>{selectedSecrets.length}</strong> secret(s) from this vault? Recoverable
            only if soft-delete is enabled.
          </>
        }
        confirmText="delete"
        confirmLabel="Delete All Selected"
        dangerLevel="warning"
        loading={bulkDeleteLoading}
        onConfirm={handleBulkDelete}
        onCancel={() => {
          if (!bulkDeleteLoading) setShowBulkDeleteConfirm(false);
        }}
      >
        <details
          style={{
            marginTop: 12,
            border: `1px solid ${tokens.colorNeutralStroke2}`,
            borderRadius: 6,
            padding: '8px 10px',
          }}
        >
          <summary style={{ cursor: 'pointer', fontSize: 12 }}>
            Selected items ({selectedSecrets.length})
          </summary>
          <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
            {selectedSecrets.map((item) => (
              <div key={item.id} style={{ padding: '2px 0' }}>
                <Text size={200} className="azv-mono">
                  {item.name}
                </Text>
              </div>
            ))}
          </div>
        </details>
        {bulkDeleteLoading && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text size={200}>
              Deleting {bulkDeleteProgress.completed} / {bulkDeleteProgress.total} (failed:{' '}
              {bulkDeleteProgress.failed})
            </Text>
          </div>
        )}
        {bulkDeleteError && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              borderRadius: 4,
              background: tokens.colorPaletteRedBackground1,
              color: tokens.colorPaletteRedForeground1,
              fontSize: 12,
            }}
          >
            {bulkDeleteError}
          </div>
        )}
      </DangerConfirmDialog>
    </div>
  );

  const detailPane = (
    <SecretDetails
      item={selectedSecret}
      vaultUri={selectedVaultUri!}
      onClose={() => setSelectedSecret(null)}
      onRefresh={() => secretsQuery.refetch()}
    />
  );

  return (
    <SplitPane
      left={listPane}
      right={detailPane}
      rightVisible={detailPanelOpen}
      defaultRatio={splitRatio}
      minLeft={320}
      minRight={260}
      onRatioChange={setSplitRatio}
    />
  );
}
