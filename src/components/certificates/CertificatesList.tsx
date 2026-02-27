import { Button, Input, makeStyles, mergeClasses, Text, tokens } from '@fluentui/react-components';
import { Search24Regular } from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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

const useStyles = makeStyles({
  listRoot: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    gap: '8px',
  },
  countText: {
    color: tokens.colorNeutralForeground3,
  },
  searchIcon: {
    fontSize: '14px',
  },
  searchInput: {
    marginLeft: 'auto',
    maxWidth: '180px',
    fontSize: '12px',
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
  subjectDim: {
    opacity: 0.4,
  },
  thumbprint: {
    fontSize: '10px',
    opacity: 0.8,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  expiresNever: {
    opacity: 0.4,
  },
});

export function CertificatesList() {
  const classes = useStyles();
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

  const columns: Column<CertificateItem>[] = useMemo(
    () => [
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
          <Text
            size={200}
            className={mergeClasses('azv-mono', !item.subject && classes.subjectDim)}
          >
            {item.subject || '—'}
          </Text>
        ),
      },
      {
        key: 'thumbprint',
        label: 'Thumbprint',
        width: '15%',
        render: (item) => (
          <Text
            size={200}
            className={mergeClasses('azv-mono', classes.thumbprint)}
            title={item.thumbprint || undefined}
          >
            {item.thumbprint || '—'}
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
              <Text size={200} className={classes.expiresNever}>
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
    ],
    [classes.subjectDim, classes.thumbprint, classes.expiresNever],
  );

  const listPane = (
    <div className={classes.listRoot}>
      <div className={classes.toolbar}>
        <Text weight="semibold" size={300}>
          Certificates
        </Text>
        {certsQuery.data && (
          <Text size={200} className={mergeClasses('azv-mono', classes.countText)}>
            ({filteredCerts.length}
            {filterText ? ` / ${allCerts.length}` : ''})
          </Text>
        )}
        <Input
          placeholder="Filter..."
          contentBefore={<Search24Regular className={classes.searchIcon} />}
          size="small"
          value={localFilter}
          onChange={(_, d) => setLocalFilter(d.value)}
          className={classes.searchInput}
        />
      </div>

      <div className={classes.tableWrap}>
        {certsQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[20, 10, 20, 15, 15, 15]} />
        ) : certsQuery.isError ? (
          <div className={classes.errorWrap}>
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
              <div className={classes.loadMoreWrap}>
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
