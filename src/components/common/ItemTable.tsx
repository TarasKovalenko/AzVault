/* eslint-disable react-refresh/only-export-components */
import { format } from 'date-fns';
import type { KeyboardEvent, ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Button';
import { cn } from '../ui/cn';
import { Icon } from '../ui/Icon';
import type { SortState, SortValue } from './useTableSort';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  /** Providing this makes the column sortable. */
  sortValue?: (item: T) => SortValue;
  render: (item: T) => ReactNode;
}

interface ItemTableProps<T> {
  items: T[];
  columns: Column<T>[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect?: (item: T) => void;
  getItemId: (item: T) => string;
  emptyMessage?: string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  selectAllState?: boolean | 'mixed';
  selectAllLabel?: string;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (checked: boolean) => void;
  sort?: SortState | null;
  onSort?: (key: string) => void;
}

const ariaSort = (sort: SortState | null | undefined, key: string) =>
  sort?.key === key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none';

export function ItemTable<T>({
  items,
  columns,
  loading,
  selectedId,
  onSelect,
  getItemId,
  emptyMessage = 'No items found',
  selectable = false,
  selectedIds,
  selectAllState = false,
  selectAllLabel = 'Select all rows',
  onToggleSelect,
  onToggleSelectAll,
  sort,
  onSort,
}: ItemTableProps<T>) {
  if (loading)
    return (
      <div className="grid place-items-center p-12">
        <Spinner size="lg" />
      </div>
    );
  if (items.length === 0)
    return (
      <div className="grid min-h-48 place-items-center text-[var(--text-secondary)]">
        {emptyMessage}
      </div>
    );

  // Arrow keys walk the rows so the list is fully operable without a mouse.
  const moveFocus = (event: KeyboardEvent<HTMLTableRowElement>, offset: number) => {
    event.preventDefault();
    const rows = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>('tr[tabindex]') ??
        [],
    );
    const target = rows[rows.indexOf(event.currentTarget) + offset];
    target?.focus();
  };

  return (
    <div className="overflow-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface-solid)]">
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--text-secondary)] backdrop-blur-xl">
          <tr className="border-b border-[var(--stroke)]">
            {selectable && (
              <th scope="col" className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={selectAllLabel}
                  checked={selectAllState === true}
                  ref={(node) => {
                    if (node) node.indeterminate = selectAllState === 'mixed';
                  }}
                  onChange={(event) => onToggleSelectAll?.(event.target.checked)}
                />
              </th>
            )}
            <th scope="col" className="w-11 px-3 py-2">
              <span className="sr-only">Row number</span>
              <span aria-hidden="true">#</span>
            </th>
            {columns.map((column) => {
              const sortable = Boolean(column.sortValue && onSort);
              return (
                <th
                  key={column.key}
                  scope="col"
                  style={{ width: column.width }}
                  aria-sort={sortable ? ariaSort(sort, column.key) : undefined}
                  className="px-3 py-2"
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(column.key)}
                      className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-[var(--text)]"
                    >
                      {column.label}
                      <Icon
                        name={
                          sort?.key === column.key && sort.direction === 'desc'
                            ? 'sort-desc'
                            : 'sort-asc'
                        }
                        size={11}
                        className={cn(
                          'transition-opacity',
                          // A hint at rest tells the user the column is sortable
                          // at all; full strength marks the active sort.
                          sort?.key === column.key ? 'opacity-100' : 'opacity-30',
                        )}
                      />
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const id = getItemId(item);
            const selected = selectedId === id;
            return (
              <tr
                key={id}
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={onSelect ? selected : undefined}
                onClick={() => onSelect?.(item)}
                onKeyDown={(event) => {
                  // Keys aimed at a control inside the row (the checkbox) must
                  // reach it: preventDefault here would cancel its activation.
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect?.(item);
                  } else if (event.key === 'ArrowDown') {
                    moveFocus(event, 1);
                  } else if (event.key === 'ArrowUp') {
                    moveFocus(event, -1);
                  }
                }}
                className={cn(
                  'border-b border-[var(--stroke)] last:border-0 hover:bg-[var(--surface-hover)]',
                  onSelect && 'cursor-default',
                  selected && 'bg-[var(--accent-soft)]',
                )}
              >
                {selectable && (
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select row ${index + 1}`}
                      checked={selectedIds?.has(id) ?? false}
                      onChange={(event) => onToggleSelect?.(id, event.target.checked)}
                    />
                  </td>
                )}
                <td className="mono px-3 py-2 text-[10px] text-[var(--text-tertiary)]">
                  {index + 1}
                </td>
                {columns.map((column) => (
                  <td key={column.key} className="truncate px-3 py-2.5 align-middle">
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function renderName(item: { name: string }) {
  return <span className="mono font-semibold">{item.name}</span>;
}

export function renderEnabled(enabled: boolean) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          'size-1.5 rounded-full',
          enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]',
        )}
      />
      <span className={cn(!enabled && 'text-[var(--text-secondary)]')}>
        {enabled ? 'Active' : 'Disabled'}
      </span>
    </span>
  );
}

export function renderDate(dateString: string | null) {
  if (!dateString) return <span className="text-[var(--text-tertiary)]">—</span>;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return <span>{dateString}</span>;
  return <span className="mono text-[11px]">{format(parsed, 'MMM d, yyyy HH:mm')}</span>;
}

/** Expiry cell shared by every resource list: never-expires reads as such, past dates read as expired. */
export function renderExpiry(expires: string | null) {
  if (!expires) return <span className="mono text-[11px] text-[var(--text-tertiary)]">Never</span>;
  const expired = new Date(expires) < new Date();
  return (
    <span
      className={expired ? 'text-[var(--danger)]' : undefined}
      title={expired ? 'Expired' : undefined}
    >
      {renderDate(expires)}
    </span>
  );
}

export function renderTags(tags: Record<string, string> | null) {
  if (!tags || Object.keys(tags).length === 0)
    return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {Object.entries(tags)
        .slice(0, 3)
        .map(([key, value]) => (
          <Badge key={key} title={`${key}=${value}`} className="mono max-w-44 truncate">
            {key}={value}
          </Badge>
        ))}
      {Object.keys(tags).length > 3 && <Badge>+{Object.keys(tags).length - 3}</Badge>}
    </span>
  );
}
