import { Button, Input, Text, tokens } from '@fluentui/react-components';
import { Search24Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { listCertificates } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { CertificateItem } from '../../types';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import type { Column } from '../common/ItemTable';
import { ItemTable, renderDate, renderEnabled } from '../common/ItemTable';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { SplitPane } from '../common/SplitPane';
import { CertificateDetails } from './CertificateDetails';

const columns: Column<CertificateItem>[] = [
  {
    key: 'name',
    label: 'Name',
    width: '20%',
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
    key: 'subject',
    label: 'Subject',
    width: '20%',
    render: (item) => (
      <Text size={200} className="azv-mono" style={{ opacity: item.subject ? 1 : 0.4 }}>
        {item.subject || '—'}
      </Text>
    ),
  },
  {
    key: 'thumbprint',
    label: 'Thumbprint',
    width: '15%',
    render: (item) => (
      <Text size={200} className="azv-mono" style={{ fontSize: 10, opacity: 0.8 }}>
        {item.thumbprint ? `${item.thumbprint.slice(0, 16)}...` : '—'}
      </Text>
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

export function CertificatesList() {
  const { selectedVaultUri, searchQuery, detailPanelOpen, splitRatio, setSplitRatio } =
    useAppStore();
  const [visibleCount, setVisibleCount] = useState(50);
  const [selectedCert, setSelectedCert] = useState<CertificateItem | null>(null);
  const [localFilter, setLocalFilter] = useState('');

  const certsQuery = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const filterText = localFilter || searchQuery;
  const allCerts = certsQuery.data || [];
  const filteredCerts = allCerts.filter((c) =>
    c.name.toLowerCase().includes(filterText.toLowerCase()),
  );
  const visibleCerts = filteredCerts.slice(0, visibleCount);

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
          Certificates
        </Text>
        {certsQuery.data && (
          <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3 }}>
            ({filteredCerts.length}
            {filterText ? ` / ${allCerts.length}` : ''})
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
        {certsQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[20, 10, 20, 15, 15, 15]} />
        ) : certsQuery.isError ? (
          <div style={{ padding: 16 }}>
            <ErrorMessage error={String(certsQuery.error)} onRetry={() => certsQuery.refetch()} />
          </div>
        ) : allCerts.length === 0 ? (
          <EmptyState
            title="No certificates found"
            description="This vault doesn't contain any certificates."
          />
        ) : filteredCerts.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No certificates match '${filterText}'.`}
            action={{ label: 'Clear Filter', onClick: () => setLocalFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visibleCerts}
              columns={columns}
              loading={false}
              selectedId={selectedCert?.id}
              onSelect={(item) => setSelectedCert(item)}
              getItemId={(c) => c.id}
            />
            {filteredCerts.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
                <Button
                  onClick={() => setVisibleCount((c) => c + 50)}
                  appearance="secondary"
                  size="small"
                >
                  Load 50 more ({filteredCerts.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const detailPane = (
    <CertificateDetails item={selectedCert} onClose={() => setSelectedCert(null)} />
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
