import { Badge, Button, Input, Text, tokens } from '@fluentui/react-components';
import { Search24Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listKeys } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { KeyItem } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled } from '../common/ItemTable';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { KeyDetails } from './KeyDetails';

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
      if (!item.expires)
        return (
          <Text size={200} style={{ opacity: 0.4 }}>
            Never
          </Text>
        );
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
  const { selectedVaultUri, searchQuery, detailPanelOpen, splitRatio, setSplitRatio } =
    useAppStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedKey, setSelectedKey] = useState<KeyItem | null>(null);
  const [localFilter, setLocalFilter] = useState('');

  const keysQuery = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filterText = localFilter || searchQuery;
  const allKeys = keysQuery.data || [];
  const filteredKeys = allKeys.filter((k) =>
    k.name.toLowerCase().includes(filterText.toLowerCase()),
  );
  const visibleKeys = filteredKeys.slice(0, visibleCount);

  const listPane = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 12px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
          gap: 8,
        }}
      >
        <Text weight="semibold" size={300}>
          Keys
        </Text>
        {keysQuery.data && (
          <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3 }}>
            ({filteredKeys.length}
            {filterText ? ` / ${allKeys.length}` : ''})
          </Text>
        )}
        <Input
          placeholder="Filter..."
          contentBefore={<Search24Regular style={{ fontSize: 14 }} />}
          size="small"
          value={localFilter}
          onChange={(_, d) => setLocalFilter(d.value)}
          style={{ marginLeft: 'auto', maxWidth: 180, fontSize: 12 }}
        />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px', minHeight: 0 }}>
        {keysQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[25, 10, 10, 25, 15, 15]} />
        ) : keysQuery.isError ? (
          <div style={{ padding: 16 }}>
            <ErrorMessage error={String(keysQuery.error)} onRetry={() => keysQuery.refetch()} />
          </div>
        ) : allKeys.length === 0 ? (
          <EmptyState title="No keys found" description="This vault doesn't contain any keys." />
        ) : filteredKeys.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No keys match '${filterText}'.`}
            action={{ label: 'Clear Filter', onClick: () => setLocalFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visibleKeys}
              columns={columns}
              loading={false}
              selectedId={selectedKey?.id}
              onSelect={(item) => setSelectedKey(item)}
              getItemId={(k) => k.id}
            />
            {filteredKeys.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
                <Button
                  onClick={() => setVisibleCount((c) => c + 50)}
                  appearance="secondary"
                  size="small"
                >
                  Load 50 more ({filteredKeys.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const detailPane = <KeyDetails item={selectedKey} onClose={() => setSelectedKey(null)} />;

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
