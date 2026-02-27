import {
  Button,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
  mergeClasses,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  Add24Regular,
  ArrowDownload24Regular,
  Delete24Regular,
  Search24Regular,
} from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
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
import { CreateSecretDialog } from './CreateSecretDialog';
import { DeleteByPrefixDialog } from './DeleteByPrefixDialog';
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
import { parseSecretsImportJson } from './secretsImport';

const useStyles = makeStyles({
  listRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    gap: '8px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flex: 1,
  },
  countText: {
    color: tokens.colorNeutralForeground3,
  },
  selectedText: {
    color: tokens.colorBrandForeground1,
  },
  searchInput: {
    marginLeft: 'auto',
    maxWidth: '180px',
    fontSize: '12px',
  },
  toolbarButtons: {
    display: 'flex',
    gap: '4px',
  },
  exportMessage: {
    padding: '4px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  exportMessageSuccess: {
    background: tokens.colorPaletteGreenBackground1,
  },
  exportMessageError: {
    background: tokens.colorPaletteRedBackground1,
  },
  exportMessageTextSuccess: {
    color: tokens.colorPaletteGreenForeground1,
  },
  exportMessageTextError: {
    color: tokens.colorPaletteRedForeground1,
  },
  tableWrap: {
    flex: 1,
    overflow: 'auto',
    padding: '0 12px',
    minHeight: 0,
  },
  errorWrap: {
    padding: '16px',
  },
  loadMoreWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: '10px',
  },
  bulkDeleteDetails: {
    marginTop: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '6px',
    padding: '8px 10px',
  },
  bulkDeleteSummary: {
    cursor: 'pointer',
    fontSize: '12px',
  },
  bulkDeleteList: {
    marginTop: '8px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  bulkDeleteItem: {
    padding: '2px 0',
  },
  bulkDeleteProgress: {
    marginTop: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  bulkDeleteError: {
    marginTop: '10px',
    padding: '8px',
    borderRadius: '4px',
    background: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    fontSize: '12px',
  },
  textDim: {
    opacity: 0.4,
  },
  textExpires: {
    fontSize: '11px',
  },
});

export function SecretsList() {
  const classes = useStyles();
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
  const [showPrefixDeleteDialog, setShowPrefixDeleteDialog] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportMessageTone, setExportMessageTone] = useState<'success' | 'error'>('success');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importMessageTone, setImportMessageTone] = useState<'success' | 'error'>('success');
  const [importLoading, setImportLoading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const columns: Column<SecretItem>[] = useMemo(
    () => [
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
              <Text size={200} className={mergeClasses('azv-mono', classes.textDim)}>
                Never
              </Text>
            );
          const expired = new Date(item.expires) < new Date();
          return (
            <Text
              size={200}
              className={mergeClasses('azv-mono', classes.textExpires)}
              style={expired ? { color: 'var(--azv-danger)' } : undefined}
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
    ],
    [classes.textDim, classes.textExpires],
  );

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

  useEffect(() => {
    if (!importMessage) return;
    const timer = window.setTimeout(() => setImportMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [importMessage]);

  // Listen for custom events from command palette
  useEffect(() => {
    const onNewSecret = () => setCreateOpen(true);
    const onFocusSearch = () => {
      const input = document.querySelector<HTMLInputElement>('[data-azv-list-search]');
      input?.focus();
    };
    const onDeleteByPrefix = () => setShowPrefixDeleteDialog(true);
    const onImportSecrets = () => {
      if (!importInputRef.current) return;
      importInputRef.current.value = '';
      importInputRef.current.click();
    };
    window.addEventListener('azv:new-secret', onNewSecret);
    window.addEventListener('azv:focus-search', onFocusSearch);
    window.addEventListener('azv:delete-by-prefix', onDeleteByPrefix);
    window.addEventListener('azv:import-secrets', onImportSecrets);
    return () => {
      window.removeEventListener('azv:new-secret', onNewSecret);
      window.removeEventListener('azv:focus-search', onFocusSearch);
      window.removeEventListener('azv:delete-by-prefix', onDeleteByPrefix);
      window.removeEventListener('azv:import-secrets', onImportSecrets);
    };
  }, []);

  const handleImportButtonClick = () => {
    const input = importInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleImportFromFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedVaultUri) return;

    setImportLoading(true);
    setImportMessage(null);

    try {
      const content = await file.text();
      const { requests } = parseSecretsImportJson(content);
      let successCount = 0;
      const failures: string[] = [];

      for (const request of requests) {
        try {
          await setSecret(selectedVaultUri, request);
          successCount += 1;
        } catch (e) {
          failures.push(`${request.name}: ${String(e)}`);
        }
      }

      await secretsQuery.refetch();

      if (failures.length === 0) {
        setImportMessageTone('success');
        setImportMessage(`Imported ${successCount} secret(s) from ${file.name}.`);
      } else {
        setImportMessageTone('error');
        setImportMessage(
          `Imported ${successCount}/${requests.length} from ${file.name}. Failed: ${failures[0]}`,
        );
      }
    } catch (e) {
      setImportMessageTone('error');
      setImportMessage(`Import failed: ${String(e)}`);
    } finally {
      setImportLoading(false);
    }
  };

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
    <div className={classes.listRoot}>
      {/* Toolbar */}
      <div className={classes.toolbar}>
        <div className={classes.toolbarLeft}>
          <Text weight="semibold" size={300}>
            Secrets
          </Text>
          {secretsQuery.data && (
            <Text size={200} className={mergeClasses('azv-mono', classes.countText)}>
              ({filteredSecrets.length}
              {filterText ? ` / ${allSecrets.length}` : ''})
            </Text>
          )}
          {selectedIds.size > 0 && (
            <Text size={200} className={mergeClasses('azv-mono', classes.selectedText)}>
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
            className={classes.searchInput}
          />
        </div>
        <div className={classes.toolbarButtons}>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportFromFile}
            style={{ display: 'none' }}
          />
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button appearance="subtle" icon={<ArrowDownload24Regular />} size="small">
                Export
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem onClick={() => handleExport('json')}>Export as JSON</MenuItem>
                <MenuItem onClick={() => handleExport('csv')}>Export as CSV</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
          <Button
            appearance="secondary"
            size="small"
            onClick={handleImportButtonClick}
            disabled={!selectedVaultUri || importLoading}
          >
            {importLoading ? 'Importing...' : 'Import JSON'}
          </Button>
          <Button
            appearance="primary"
            icon={<Add24Regular />}
            size="small"
            onClick={() => setCreateOpen(true)}
            disabled={importLoading}
          >
            New
          </Button>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="secondary"
                icon={<Delete24Regular />}
                size="small"
                disabled={bulkDeleteLoading}
              >
                Delete
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem
                  disabled={selectedIds.size === 0}
                  onClick={() => setShowBulkDeleteConfirm(true)}
                >
                  Delete Selected{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                </MenuItem>
                <MenuItem
                  disabled={!selectedVaultUri}
                  onClick={() => setShowPrefixDeleteDialog(true)}
                >
                  Delete by Prefix
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </div>

      {exportMessage && (
        <div
          className={mergeClasses(
            classes.exportMessage,
            exportMessageTone === 'success'
              ? classes.exportMessageSuccess
              : classes.exportMessageError,
          )}
        >
          <Text
            size={200}
            className={mergeClasses(
              'azv-mono',
              exportMessageTone === 'success'
                ? classes.exportMessageTextSuccess
                : classes.exportMessageTextError,
            )}
          >
            {exportMessage}
          </Text>
        </div>
      )}

      {importMessage && (
        <div
          className={mergeClasses(
            classes.exportMessage,
            importMessageTone === 'success'
              ? classes.exportMessageSuccess
              : classes.exportMessageError,
          )}
        >
          <Text
            size={200}
            className={mergeClasses(
              'azv-mono',
              importMessageTone === 'success'
                ? classes.exportMessageTextSuccess
                : classes.exportMessageTextError,
            )}
          >
            {importMessage}
          </Text>
        </div>
      )}

      {/* Table */}
      <div className={classes.tableWrap}>
        {secretsQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[30, 10, 15, 20, 15, 10]} />
        ) : secretsQuery.isError ? (
          <div className={classes.errorWrap}>
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
              <div className={classes.loadMoreWrap}>
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
        <details className={classes.bulkDeleteDetails}>
          <summary className={classes.bulkDeleteSummary}>
            Selected items ({selectedSecrets.length})
          </summary>
          <div className={classes.bulkDeleteList}>
            {selectedSecrets.map((item) => (
              <div key={item.id} className={classes.bulkDeleteItem}>
                <Text size={200} className="azv-mono">
                  {item.name}
                </Text>
              </div>
            ))}
          </div>
        </details>
        {bulkDeleteLoading && (
          <div className={classes.bulkDeleteProgress}>
            <Text size={200}>
              Deleting {bulkDeleteProgress.completed} / {bulkDeleteProgress.total} (failed:{' '}
              {bulkDeleteProgress.failed})
            </Text>
          </div>
        )}
        {bulkDeleteError && <div className={classes.bulkDeleteError}>{bulkDeleteError}</div>}
      </DangerConfirmDialog>

      {/* Delete by prefix */}
      <DeleteByPrefixDialog
        open={showPrefixDeleteDialog}
        allSecrets={allSecrets}
        vaultUri={selectedVaultUri!}
        onDelete={(name) => deleteSecret(selectedVaultUri!, name)}
        onClose={() => setShowPrefixDeleteDialog(false)}
        onCompleted={(deletedIds) => {
          if (selectedVaultUri && deletedIds.length > 0) {
            queryClient.setQueryData<SecretItem[]>(['secrets', selectedVaultUri], (current) =>
              filterOutDeletedSecrets(current, deletedIds),
            );
          }
          secretsQuery.refetch();
        }}
      />
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
