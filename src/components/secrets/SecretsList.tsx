/**
 * SecretsList.tsx – Secrets data-plane browser.
 *
 * Features:
 * - Paginated table of secrets with search filtering
 * - Bulk selection & delete with confirmation dialog
 * - JSON / CSV export (metadata only, no secret values)
 * - Details drawer for individual secret inspection
 * - Create dialog for new secrets
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Spinner,
  Text,
  tokens,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@fluentui/react-components';
import { Add24Regular, ArrowDownload24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listSecrets, exportItems, deleteSecret } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { ItemTable, renderEnabled, renderDate, renderTags } from '../common/ItemTable';
import { DetailsDrawer } from '../common/DetailsDrawer';
import { CreateSecretDialog } from './CreateSecretDialog';
import {
  filterOutDeletedSecrets,
  getSelectedSecrets,
  isDeleteConfirmationValid,
  nextDeleteProgress,
  pruneSelectedIds,
  removeSucceededSelection,
  toggleSelection,
  toggleSelectionAll,
} from './secretsBulkDeleteLogic';
import { exportSecretMetadata, type ExportFormat } from './secretsExport';
import type { Column } from '../common/ItemTable';
import type { SecretItem } from '../../types';

/** Column definitions for the secrets table. */
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
      if (!item.expires) return <Text size={200} style={{ opacity: 0.4 }}>Never</Text>;
      const expired = new Date(item.expires) < new Date();
      return (
        <Text
          size={200}
          className="azv-mono"
          style={{
            color: expired ? 'var(--azv-danger)' : undefined,
            fontSize: 11,
          }}
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
  const { selectedVaultUri, searchQuery } = useAppStore();
  const queryClient = useQueryClient();
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportMessageTone, setExportMessageTone] = useState<'success' | 'error'>('success');
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState({
    total: 0,
    completed: 0,
    failed: 0,
  });

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  // ── Derived / filtered data ──

  const allSecrets = useMemo(() => secretsQuery.data ?? [], [secretsQuery.data]);
  const filteredSecrets = allSecrets.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()),
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

  // Clean up stale selections when data refreshes
  useEffect(() => {
    const existingIds = new Set(allSecrets.map((s) => s.id));
    setSelectedIds((prev) => {
      const next = pruneSelectedIds(prev, existingIds);
      return next.size === prev.size ? prev : next;
    });
  }, [allSecrets, selectedVaultUri]);

  // Close drawer if the selected secret was deleted
  useEffect(() => {
    if (!selectedSecret) return;
    const stillExists = allSecrets.some((s) => s.id === selectedSecret.id);
    if (!stillExists) {
      setSelectedSecret(null);
      setDrawerOpen(false);
    }
  }, [selectedSecret, allSecrets]);

  // Reset dialog input/error/progress when dialog closes
  useEffect(() => {
    if (!showBulkDeleteConfirm) {
      setDeleteConfirmInput('');
      setBulkDeleteError(null);
      setBulkDeleteProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [showBulkDeleteConfirm]);

  useEffect(() => {
    if (!exportMessage) return;
    const timer = window.setTimeout(() => setExportMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [exportMessage]);

  // ── Handlers ──

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

  const handleSelect = (item: SecretItem) => {
    setSelectedSecret(item);
    setDrawerOpen(true);
  };

  /** Export metadata (never secret values) as JSON or CSV. */
  const handleExport = async (format: ExportFormat) => {
    await exportSecretMetadata(filteredSecrets, format, {
      exportItems,
      download: downloadExport,
      writeClipboard: navigator.clipboard?.writeText
        ? (content) => navigator.clipboard.writeText(content)
        : undefined,
      onError: (error) => {
        setExportMessageTone('error');
        setExportMessage('Export failed.');
        console.error('Export failed:', error);
      },
      onSuccess: (mode) => {
        setExportMessageTone('success');
        setExportMessage(
          mode === 'download'
            ? `${format.toUpperCase()} downloaded.`
            : `${format.toUpperCase()} copied to clipboard.`,
        );
      },
    });
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => toggleSelection(prev, id, checked, bulkDeleteLoading));
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => toggleSelectionAll(prev, visibleIds, checked, bulkDeleteLoading));
  };

  /** Bulk-delete selected secrets with typed confirmation and progress reporting. */
  const handleBulkDelete = async () => {
    if (!selectedVaultUri || !isDeleteConfirmationValid(deleteConfirmInput)) return;

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
        queryClient.setQueryData<SecretItem[]>(
          ['secrets', selectedVaultUri],
          (current) => filterOutDeletedSecrets(current, succeededIds),
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

  const deleteConfirmationValid = isDeleteConfirmationValid(deleteConfirmInput);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text weight="semibold" size={300}>
            Secrets
          </Text>
          <Text className="azv-title">data-plane</Text>
          {secretsQuery.data && (
            <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3 }}>
              ({filteredSecrets.length}
              {searchQuery ? ` / ${secretsQuery.data.length}` : ''})
            </Text>
          )}
          {selectedIds.size > 0 && (
            <Text size={200} className="azv-mono" style={{ color: tokens.colorBrandForeground1 }}>
              {selectedIds.size} selected
            </Text>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('json')}
          >
            JSON
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('csv')}
          >
            CSV
          </Button>
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
            Delete
          </Button>
        </div>
      </div>
      {exportMessage && (
        <div
          style={{
            padding: '6px 16px',
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
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        <ItemTable
          items={visibleSecrets}
          columns={columns}
          loading={secretsQuery.isLoading}
          selectedId={selectedSecret?.id}
          onSelect={handleSelect}
          getItemId={(s) => s.id}
          selectable
          selectedIds={selectedIds}
          selectAllState={selectAllState}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          emptyMessage={
            secretsQuery.isError
              ? `Error: ${secretsQuery.error}`
              : 'No secrets found in this vault'
          }
        />
        {filteredSecrets.length > visibleCount && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <Button onClick={() => setVisibleCount((c) => c + 50)} appearance="secondary" size="small">
              Load 50 more
            </Button>
          </div>
        )}
      </div>

      {/* Details Drawer */}
      <DetailsDrawer
        item={selectedSecret}
        vaultUri={selectedVaultUri!}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onRefresh={() => secretsQuery.refetch()}
      />

      {/* Create Dialog */}
      <CreateSecretDialog
        open={createOpen}
        vaultUri={selectedVaultUri!}
        onClose={() => setCreateOpen(false)}
        onCreated={() => secretsQuery.refetch()}
      />

      {/* Bulk Delete Confirmation */}
      <Dialog
        open={showBulkDeleteConfirm}
        onOpenChange={(_, d) => {
          if (bulkDeleteLoading) return;
          setShowBulkDeleteConfirm(d.open);
        }}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Selected Secrets</DialogTitle>
            <DialogContent>
              <Text size={200}>
                Delete <strong>{selectedSecrets.length}</strong> secret(s)? Recoverable only if
                soft-delete is enabled.
              </Text>

              <details
                style={{
                  marginTop: 12,
                  border: `1px solid ${tokens.colorNeutralStroke2}`,
                  borderRadius: 6,
                  padding: '8px 10px',
                }}
              >
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>Selected items to delete</summary>
                <div style={{ marginTop: 8, maxHeight: 200, overflow: 'auto' }}>
                  {selectedSecrets.length === 0 ? (
                    <Text size={200} style={{ opacity: 0.7 }}>
                      No selected items.
                    </Text>
                  ) : (
                    selectedSecrets.map((item) => (
                      <div key={item.id} style={{ padding: '2px 0' }}>
                        <Text size={200} className="azv-mono">
                          {item.name}
                        </Text>
                      </div>
                    ))
                  )}
                </div>
              </details>

              <div style={{ marginTop: 12 }}>
                <Text size={200}>
                  Type <strong className="azv-mono">delete</strong> to confirm.
                </Text>
                <Input
                  value={deleteConfirmInput}
                  onChange={(_, data) => setDeleteConfirmInput(data.value)}
                  placeholder="delete"
                  disabled={bulkDeleteLoading}
                  style={{ marginTop: 6, width: '100%' }}
                />
              </div>

              {bulkDeleteLoading && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Spinner size="tiny" />
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
            </DialogContent>
            <DialogActions>
              <Button
                appearance="secondary"
                onClick={() => setShowBulkDeleteConfirm(false)}
                disabled={bulkDeleteLoading}
              >
                Cancel
              </Button>
              <Button
                appearance="primary"
                onClick={handleBulkDelete}
                disabled={bulkDeleteLoading || selectedSecrets.length === 0 || !deleteConfirmationValid}
                style={{ background: tokens.colorPaletteRedBackground3 }}
              >
                {bulkDeleteLoading ? <Spinner size="tiny" /> : 'Delete All Selected'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
