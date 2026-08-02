import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listKeys } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { KeyItem } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled } from '../common/ItemTable';
import { ListToolbar } from '../common/ListToolbar';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { KeyDetails } from './KeyDetails';

const columns: Column<KeyItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '25%',
    render: (item) => <span className="mono font-semibold">{item.name}</span>,
  },
  { key: 'enabled', label: 'Status', width: '10%', render: (item) => renderEnabled(item.enabled) },
  {
    key: 'keyType',
    label: 'Type',
    width: '10%',
    render: (item) => <Badge>{item.keyType || '?'}</Badge>,
  },
  {
    key: 'keyOps',
    label: 'Operations',
    width: '25%',
    render: (item) => (
      <div className="flex flex-wrap gap-1">
        {(item.keyOps || []).map((operation) => (
          <Badge key={operation} tone="blue">
            {operation}
          </Badge>
        ))}
      </div>
    ),
  },
  { key: 'updated', label: 'Updated', width: '15%', render: (item) => renderDate(item.updated) },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    render: (item) =>
      !item.expires ? (
        <span className="text-[var(--text-tertiary)]">Never</span>
      ) : (
        <span className={new Date(item.expires) < new Date() ? 'text-[var(--danger)]' : undefined}>
          {renderDate(item.expires)}
        </span>
      ),
  },
];

export function KeysList() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const splitRatio = useAppStore((state) => state.splitRatio);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedKey, setSelectedKey] = useState<KeyItem | null>(null);
  const [filter, setFilter] = useState('');
  const query = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const allItems = query.data || [];
  const filtered = allItems.filter((item) =>
    item.name.toLowerCase().includes(filter.toLowerCase()),
  );
  const visible = filtered.slice(0, visibleCount);

  const list = (
    <div className="flex h-full flex-col">
      <ListToolbar
        title="Keys"
        count={query.data ? filtered.length : undefined}
        total={allItems.length}
        filter={filter}
        onFilterChange={setFilter}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton columns={[25, 10, 10, 25, 15, 15]} />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => query.refetch()} />
        ) : allItems.length === 0 ? (
          <EmptyState title="No keys found" description="This vault doesn't contain any keys." />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No keys match '${filter}'.`}
            action={{ label: 'Clear Filter', onClick: () => setFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visible}
              columns={columns}
              selectedId={selectedKey?.id}
              onSelect={setSelectedKey}
              getItemId={(item) => item.id}
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
    </div>
  );
  return (
    <SplitPane
      left={list}
      right={<KeyDetails item={selectedKey} onClose={() => setSelectedKey(null)} />}
      rightVisible={detailPanelOpen}
      defaultRatio={splitRatio}
      minLeft={320}
      minRight={260}
      onRatioChange={setSplitRatio}
    />
  );
}
