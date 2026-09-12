import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useMemo } from 'react';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';
import { EmptyState } from './EmptyState';
import { ErrorMessage } from './ErrorMessage';
import type { Column } from './ItemTable';
import { ItemTable } from './ItemTable';
import { ListPager, PAGE_SIZE } from './ListPager';
import { ListToolbar } from './ListToolbar';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SplitPane } from './SplitPane';
import { nextSortState, sortItems } from './useTableSort';

interface VaultItemsListProps<T extends { id: string; name: string }> {
  /** Plural resource label used in headings and messages, e.g. "Keys". */
  title: string;
  /** Lowercase plural noun used inside sentences, e.g. "keys". */
  noun: string;
  /** Tab this list belongs to; its view state is kept per tab. */
  tab: Extract<ItemTab, 'keys' | 'certificates'>;
  queryKey: string;
  fetchItems: (vaultUri: string) => Promise<T[]>;
  columns: Column<T>[];
  skeletonColumns?: number[];
  /** Rendered in the right-hand pane for the current selection. */
  renderDetails: (item: T | null, clearSelection: () => void) => ReactNode;
}

/**
 * Shared read-only browser for a vault resource collection (keys, certificates).
 * Owns filtering, sorting, paging, selection and the list/detail split so the
 * resource modules only describe their columns and detail pane.
 *
 * View state lives in the store rather than local state: switching tabs unmounts
 * this component, and an operator who filtered 4,000 secrets down to twelve
 * should not lose that by glancing at the overview.
 */
export function VaultItemsList<T extends { id: string; name: string }>({
  title,
  noun,
  tab,
  queryKey,
  fetchItems,
  columns,
  skeletonColumns,
  renderDetails,
}: VaultItemsListProps<T>) {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const splitRatio = useAppStore((state) => state.splitRatio);
  const setSplitRatio = useAppStore((state) => state.setSplitRatio);
  const view = useAppStore((state) => state.listViews[tab]);
  const setListView = useAppStore((state) => state.setListView);

  const query = useQuery({
    queryKey: [queryKey, selectedVaultUri],
    queryFn: () => fetchItems(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const allItems = useMemo(() => query.data ?? [], [query.data]);
  const filtered = useMemo(
    () => allItems.filter((item) => item.name.toLowerCase().includes(view.filter.toLowerCase())),
    [allItems, view.filter],
  );
  // Rebuilding this object every render would re-sort the whole unpaged list on
  // every keystroke, which is exactly the case the big-vault comment warns about.
  const { sortKey, sortDirection } = view;
  const sort = useMemo(
    () => (sortKey ? { key: sortKey, direction: sortDirection } : null),
    [sortKey, sortDirection],
  );
  const sorted = useMemo(() => sortItems(filtered, columns, sort), [filtered, columns, sort]);
  const visible = sorted.slice(0, view.visibleCount);
  // The selection is stored by id: the item itself is replaced on every refetch.
  const selected = allItems.find((item) => item.id === view.selectedId) ?? null;

  const setFilter = (filter: string) => setListView(tab, { filter, visibleCount: PAGE_SIZE });
  const clearSelection = () => setListView(tab, { selectedId: null });

  const list = (
    <div className="flex h-full flex-col">
      <ListToolbar
        title={title}
        count={query.data ? filtered.length : undefined}
        total={allItems.length}
        filter={view.filter}
        onFilterChange={setFilter}
      />
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton columns={skeletonColumns} />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => query.refetch()} />
        ) : allItems.length === 0 ? (
          <EmptyState title={`No ${noun} yet`} description={`This vault has no ${noun}.`} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No matches"
            description={`No ${noun} match “${view.filter}”.`}
            action={{ label: 'Clear filter', onClick: () => setFilter('') }}
          />
        ) : (
          <>
            <ItemTable
              items={visible}
              columns={columns}
              selectedId={selected?.id}
              onSelect={(item) => setListView(tab, { selectedId: item.id })}
              getItemId={(item) => item.id}
              sort={sort}
              onSort={(key) => {
                const next = nextSortState(sort, key);
                setListView(tab, {
                  sortKey: next?.key ?? null,
                  sortDirection: next?.direction ?? 'asc',
                });
              }}
            />
            <ListPager
              shown={visible.length}
              total={filtered.length}
              onShowMore={() => setListView(tab, { visibleCount: view.visibleCount + PAGE_SIZE })}
            />
          </>
        )}
      </div>
    </div>
  );

  return (
    <SplitPane
      left={list}
      right={renderDetails(selected, clearSelection)}
      rightVisible={detailPanelOpen}
      defaultRatio={splitRatio}
      minLeft={320}
      minRight={260}
      onRatioChange={setSplitRatio}
    />
  );
}
