import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listCertificates } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { CertificateItem } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled } from '../common/ItemTable';
import { ListToolbar } from '../common/ListToolbar';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { Button } from '../ui/Button';
import { CertificateDetails } from './CertificateDetails';

const columns: Column<CertificateItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '20%',
    render: (item) => <span className="mono font-semibold">{item.name}</span>,
  },
  { key: 'enabled', label: 'Status', width: '10%', render: (item) => renderEnabled(item.enabled) },
  {
    key: 'subject',
    label: 'Subject',
    width: '20%',
    render: (item) => (
      <span className={`mono ${item.subject ? '' : 'text-[var(--text-tertiary)]'}`}>
        {item.subject || '—'}
      </span>
    ),
  },
  {
    key: 'thumbprint',
    label: 'Thumbprint',
    width: '15%',
    render: (item) => (
      <span
        className="mono block truncate text-[10px] text-[var(--text-secondary)]"
        title={item.thumbprint || undefined}
      >
        {item.thumbprint || '—'}
      </span>
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

export function CertificatesList() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const splitRatio = useAppStore((state) => state.splitRatio);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedCertificate, setSelectedCertificate] = useState<CertificateItem | null>(null);
  const [filter, setFilter] = useState('');
  const query = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
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
        title="Certificates"
        count={query.data ? filtered.length : undefined}
        total={allItems.length}
        filter={filter}
        onFilterChange={setFilter}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton columns={[20, 10, 20, 15, 15, 15]} />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => query.refetch()} />
        ) : allItems.length === 0 ? (
          <EmptyState
            title="No certificates found"
            description="This vault doesn't contain any certificates."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No certificates match '${filter}'.`}
            action={{ label: 'Clear Filter', onClick: () => setFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visible}
              columns={columns}
              selectedId={selectedCertificate?.id}
              onSelect={setSelectedCertificate}
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
      right={
        <CertificateDetails
          item={selectedCertificate}
          onClose={() => setSelectedCertificate(null)}
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
