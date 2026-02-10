import { useEffect, useMemo, useState } from 'react';
import { Button, Text, tokens, Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent, DialogActions, Spinner } from '@fluentui/react-components';
import { Add24Regular, ArrowDownload24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { listSecrets, exportItems, deleteSecret } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { ItemTable, renderEnabled, renderDate, renderTags } from '../common/ItemTable';
import { DetailsDrawer } from '../common/DetailsDrawer';
import { CreateSecretDialog } from './CreateSecretDialog';
import type { Column } from '../common/ItemTable';
import type { SecretItem } from '../../types';

const columns: Column<SecretItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '30%',
    render: (item) => (
      <Text weight="semibold" size={200}>
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
    label: 'Content Type',
    width: '15%',
    render: (item) => <Text size={200}>{item.contentType || '-'}</Text>,
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
      if (!item.expires) return <Text size={200}>Never</Text>;
      const expired = new Date(item.expires) < new Date();
      return (
        <Text size={200} style={{ color: expired ? tokens.colorPaletteRedForeground1 : undefined }}>
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
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filteredSecrets = (secretsQuery.data || []).filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const visibleSecrets = filteredSecrets.slice(0, visibleCount);
  const visibleIds = useMemo(() => visibleSecrets.map((s) => s.id), [visibleSecrets]);
  const selectedVisibleCount = useMemo(
    () => visibleIds.filter((id) => selectedIds.has(id)).length,
    [visibleIds, selectedIds]
  );
  const selectAllState: boolean | 'mixed' =
    selectedVisibleCount === 0
      ? false
      : selectedVisibleCount === visibleIds.length
        ? true
        : 'mixed';

  useEffect(() => {
    const existingIds = new Set((secretsQuery.data || []).map((s) => s.id));
    setSelectedIds((prev) => {
      const next = new Set<string>();
      prev.forEach((id) => {
        if (existingIds.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [secretsQuery.data, selectedVaultUri]);

  useEffect(() => {
    if (!selectedSecret) return;
    const stillExists = (secretsQuery.data || []).some((s) => s.id === selectedSecret.id);
    if (!stillExists) {
      setSelectedSecret(null);
      setDrawerOpen(false);
    }
  }, [selectedSecret, secretsQuery.data]);

  const handleSelect = (item: SecretItem) => {
    setSelectedSecret(item);
    setDrawerOpen(true);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    const metadata = filteredSecrets.map(({ name, enabled, created, updated, expires, contentType, tags }) => ({
      name,
      enabled,
      created,
      updated,
      expires,
      contentType,
      tags: tags ? JSON.stringify(tags) : '',
    }));
    try {
      const result = await exportItems(JSON.stringify(metadata), format);
      // Copy to clipboard for now
      await navigator.clipboard.writeText(result);
    } catch {
      // Error handled silently
    }
  };

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        visibleIds.forEach((id) => next.add(id));
      } else {
        visibleIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!selectedVaultUri) return;

    setBulkDeleteLoading(true);
    setBulkDeleteError(null);
    try {
      const selectedItems = filteredSecrets.filter((s) => selectedIds.has(s.id));
      const results = await Promise.allSettled(
        selectedItems.map((s) => deleteSecret(selectedVaultUri, s.name))
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) {
        setBulkDeleteError(`${failed} secret(s) failed to delete. Check permissions and retry.`);
      } else {
        setShowBulkDeleteConfirm(false);
      }
      setSelectedIds(new Set());
      await secretsQuery.refetch();
    } catch (e) {
      setBulkDeleteError(String(e));
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
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
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }} className="azv-mono">
              ({filteredSecrets.length}
              {searchQuery ? ` of ${secretsQuery.data.length}` : ''})
            </Text>
          )}
          {selectedIds.size > 0 && (
            <Text size={200} style={{ color: tokens.colorBrandForeground1 }} className="azv-mono">
              selected: {selectedIds.size}
            </Text>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('json')}
          >
            Export JSON
          </Button>
          <Button
            appearance="subtle"
            icon={<ArrowDownload24Regular />}
            size="small"
            onClick={() => handleExport('csv')}
          >
            Export CSV
          </Button>
          <Button
            appearance="primary"
            icon={<Add24Regular />}
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            New Secret
          </Button>
          <Button
            appearance="secondary"
            icon={<Delete24Regular />}
            size="small"
            disabled={selectedIds.size === 0}
            onClick={() => setShowBulkDeleteConfirm(true)}
          >
            Delete Selected
          </Button>
        </div>
      </div>

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
          <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Button onClick={() => setVisibleCount((c) => c + 50)} appearance="secondary">
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

      <Dialog open={showBulkDeleteConfirm} onOpenChange={(_, d) => setShowBulkDeleteConfirm(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete Selected Secrets</DialogTitle>
            <DialogContent>
              You are about to delete <strong>{selectedIds.size}</strong> secret(s).
              This action is reversible only if soft-delete is enabled on the vault.
              {bulkDeleteError && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 8,
                    borderRadius: tokens.borderRadiusSmall,
                    background: tokens.colorPaletteRedBackground1,
                    color: tokens.colorPaletteRedForeground1,
                  }}
                >
                  {bulkDeleteError}
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleteLoading}>
                Cancel
              </Button>
              <Button appearance="primary" onClick={handleBulkDelete} disabled={bulkDeleteLoading}>
                {bulkDeleteLoading ? <Spinner size="tiny" /> : 'Delete all selected'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
