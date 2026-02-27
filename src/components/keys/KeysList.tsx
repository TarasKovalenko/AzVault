import { Badge, Button, Input, makeStyles, Text, tokens } from '@fluentui/react-components';
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
  keyOpsWrap: {
    display: 'flex',
    gap: '3px',
    flexWrap: 'wrap',
  },
  expiresNever: {
    opacity: 0.4,
  },
});

function KeyOpsCell({ item }: { item: KeyItem }) {
  const classes = useStyles();
  return (
    <div className={classes.keyOpsWrap}>
      {(item.keyOps || []).map((op) => (
        <Badge key={op} size="small" appearance="outline" color="informative">
          {op}
        </Badge>
      ))}
    </div>
  );
}

function ExpiresCell({ item }: { item: KeyItem }) {
  const classes = useStyles();
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
}

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
    render: (item) => <KeyOpsCell item={item} />,
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
    render: (item) => <ExpiresCell item={item} />,
  },
];

export function KeysList() {
  const classes = useStyles();
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
    <div className={classes.listRoot}>
      <div className={classes.toolbar}>
        <Text weight="semibold" size={300}>
          Keys
        </Text>
        {keysQuery.data && (
          <Text size={200} className={`azv-mono ${classes.countText}`}>
            ({filteredKeys.length}
            {filterText ? ` / ${allKeys.length}` : ''})
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
        {keysQuery.isLoading ? (
          <LoadingSkeleton rows={8} columns={[25, 10, 10, 25, 15, 15]} />
        ) : keysQuery.isError ? (
          <div className={classes.errorWrap}>
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
              <div className={classes.loadMoreWrap}>
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
