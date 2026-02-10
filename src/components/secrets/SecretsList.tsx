import { useState } from 'react';
import { Button, Text, tokens } from '@fluentui/react-components';
import { Add24Regular, ArrowDownload24Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { listSecrets, exportItems } from '../../services/tauri';
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

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filteredSecrets = (secretsQuery.data || []).filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const visibleSecrets = filteredSecrets.slice(0, visibleCount);

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
    </div>
  );
}
