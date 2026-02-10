/**
 * KeysList.tsx – Cryptographic keys browser.
 *
 * Displays key metadata (type, operations, dates) in a paginated table.
 * Individual keys can be inspected in the metadata drawer.
 */

import { useState } from 'react';
import { Text, Badge, Button, tokens } from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { listKeys } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { ItemTable, renderEnabled, renderDate } from '../common/ItemTable';
import { ItemMetadataDrawer } from '../common/ItemMetadataDrawer';
import type { Column } from '../common/ItemTable';
import type { KeyItem } from '../../types';

/** Column definitions for the keys table. */
const columns: Column<KeyItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '25%',
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
    key: 'keyType',
    label: 'Type',
    width: '10%',
    render: (item) => (
      <Badge appearance="outline" size="small">
        {item.keyType || '?'}
      </Badge>
    ),
  },
  {
    key: 'keyOps',
    label: 'Operations',
    width: '25%',
    render: (item) => (
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {(item.keyOps || []).map((op) => (
          <Badge key={op} size="small" appearance="outline" color="informative">
            {op}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: '15%',
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
        <Text size={200} style={{ color: expired ? 'var(--azv-danger)' : undefined }}>
          {renderDate(item.expires)}
        </Text>
      );
    },
  },
];

export function KeysList() {
  const { selectedVaultUri, searchQuery } = useAppStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedKey, setSelectedKey] = useState<KeyItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const keysQuery = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filteredKeys = (keysQuery.data || []).filter((k) =>
    k.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const visibleKeys = filteredKeys.slice(0, visibleCount);

  /** Extract version segment from a key ID URL. */
  const extractVersion = (id: string): string => {
    const parts = id.split('/');
    const idx = parts.findIndex((p) => p === 'keys');
    return idx >= 0 ? parts[idx + 2] || '—' : '—';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 16px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
        }}
      >
        <Text weight="semibold" size={300}>
          Keys
        </Text>
        <Text className="azv-title" style={{ marginLeft: 8 }}>
          crypto
        </Text>
        {keysQuery.data && (
          <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3, marginLeft: 8 }}>
            ({filteredKeys.length}
            {searchQuery ? ` / ${keysQuery.data.length}` : ''})
          </Text>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        <ItemTable
          items={visibleKeys}
          columns={columns}
          loading={keysQuery.isLoading}
          onSelect={(item) => {
            setSelectedKey(item);
            setDrawerOpen(true);
          }}
          getItemId={(k) => k.id}
          emptyMessage={
            keysQuery.isError
              ? `Error: ${keysQuery.error}`
              : 'No keys found in this vault'
          }
        />
        {filteredKeys.length > visibleCount && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
            <Button onClick={() => setVisibleCount((c) => c + 50)} appearance="secondary" size="small">
              Load 50 more
            </Button>
          </div>
        )}
      </div>

      {/* Metadata Drawer */}
      <ItemMetadataDrawer
        title={selectedKey?.name || 'Key'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        enabled={selectedKey?.enabled}
        tags={selectedKey?.tags}
        metadata={{
          Name: selectedKey?.name,
          Version: selectedKey ? extractVersion(selectedKey.id) : '—',
          'Key Type': selectedKey?.keyType,
          'Key Ops': selectedKey?.keyOps?.join(', ') || '—',
          Created: selectedKey?.created,
          Updated: selectedKey?.updated,
          Expires: selectedKey?.expires || 'Never',
          'Not Before': selectedKey?.notBefore,
          ID: selectedKey?.id,
        }}
      />
    </div>
  );
}
