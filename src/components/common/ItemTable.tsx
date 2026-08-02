/* eslint-disable react-refresh/only-export-components */
import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { Badge } from '../ui/Badge';
import { Spinner } from '../ui/Button';
import { cn } from '../ui/cn';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
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
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

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
  onToggleSelect,
  onToggleSelectAll,
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

  return (
    <div className="overflow-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface-solid)]">
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--text-secondary)] backdrop-blur-xl">
          <tr className="border-b border-[var(--stroke)]">
            {selectable && (
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selectAllState === true}
                  ref={(node) => {
                    if (node) node.indeterminate = selectAllState === 'mixed';
                  }}
                  onChange={(event) => onToggleSelectAll?.(event.target.checked)}
                />
              </th>
            )}
            <th className="w-11 px-3 py-2">#</th>
            {columns.map((column) => (
              <th key={column.key} style={{ width: column.width }} className="px-3 py-2">
                {column.label}
              </th>
            ))}
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
                aria-selected={selected}
                onClick={() => onSelect?.(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelect?.(item);
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
                  {String(index + 1).padStart(2, '0')}
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
  try {
    return (
      <span className="mono text-[11px]">{format(new Date(dateString), 'MMM d, yyyy HH:mm')}</span>
    );
  } catch {
    return <span>{dateString}</span>;
  }
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
