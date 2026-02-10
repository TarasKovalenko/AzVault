/**
 * ItemTable.tsx – Reusable data table for vault items.
 *
 * Supports:
 * - Typed column definitions with custom renderers
 * - Optional row selection with select-all
 * - Loading / empty states
 * - Row numbering and highlight on selection
 *
 * Also exports shared cell renderers (renderEnabled, renderDate, renderTags)
 * used across Secrets, Keys, and Certificates lists.
 */

/* eslint-disable react-refresh/only-export-components */
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Badge,
  Checkbox,
  Text,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { format } from 'date-fns';

// ── Column type ──

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  render: (item: T) => React.ReactNode;
}

// ── Props ──

interface ItemTableProps<T> {
  items: T[];
  columns: Column<T>[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect?: (item: T) => void;
  getItemId: (item: T) => string;
  emptyMessage?: string;
  /** Enable row checkboxes for bulk operations. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  selectAllState?: boolean | 'mixed';
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

// ── Component ──

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
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner label="Loading…" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="azv-empty">
        <Text>{emptyMessage}</Text>
      </div>
    );
  }

  return (
    <div className="azv-table-wrap">
      <Table size="small" style={{ width: '100%' }}>
        <TableHeader>
          <TableRow>
            {selectable && (
              <TableHeaderCell style={{ width: 38 }}>
                <Checkbox
                  checked={selectAllState}
                  onChange={(_, d) => onToggleSelectAll?.(!!d.checked)}
                />
              </TableHeaderCell>
            )}
            <TableHeaderCell style={{ width: 46 }}>#</TableHeaderCell>
            {columns.map((col) => (
              <TableHeaderCell key={col.key} style={{ width: col.width }}>
                {col.label}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, index) => {
            const id = getItemId(item);
            return (
              <TableRow
                key={id}
                onClick={() => onSelect?.(item)}
                style={{
                  cursor: 'pointer',
                  background:
                    selectedId === id ? tokens.colorBrandBackground2 : undefined,
                }}
              >
                {selectable && (
                  <TableCell>
                    {/* Stop propagation so row-click doesn't also fire */}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds?.has(id) ?? false}
                        onChange={(_, d) => onToggleSelect?.(id, !!d.checked)}
                      />
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <Text size={100} className="azv-mono" style={{ opacity: 0.5 }}>
                    {String(index + 1).padStart(2, '0')}
                  </Text>
                </TableCell>
                {columns.map((col) => (
                  <TableCell key={col.key}>{col.render(item)}</TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Shared cell renderers ──

/** Renders an enabled/disabled status badge with dot indicator. */
export function renderEnabled(enabled: boolean) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        className="azv-status-dot"
        style={{ background: enabled ? 'var(--azv-success)' : 'var(--azv-danger)' }}
      />
      <Text size={200}>{enabled ? 'Active' : 'Disabled'}</Text>
    </div>
  );
}

/** Formats an ISO date string to a compact readable format. */
export function renderDate(dateStr: string | null) {
  if (!dateStr) return <Text size={200} style={{ opacity: 0.5 }}>—</Text>;
  try {
    return (
      <Text size={200} className="azv-mono" style={{ fontSize: 11 }}>
        {format(new Date(dateStr), 'MMM d, yyyy HH:mm')}
      </Text>
    );
  } catch {
    return <Text size={200}>{dateStr}</Text>;
  }
}

/** Renders tag key=value pairs as compact badge pills. */
export function renderTags(tags: Record<string, string> | null) {
  if (!tags || Object.keys(tags).length === 0) {
    return <Text size={200} style={{ opacity: 0.4 }}>—</Text>;
  }
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Object.entries(tags)
        .slice(0, 3)
        .map(([k, v]) => (
          <Badge
            key={k}
            size="small"
            appearance="outline"
            className="azv-tag-pill"
            title={`${k}=${v}`}
          >
            <span className="azv-tag-text">
              {k}={v}
            </span>
          </Badge>
        ))}
      {Object.keys(tags).length > 3 && (
        <Badge size="small" appearance="outline">
          +{Object.keys(tags).length - 3}
        </Badge>
      )}
    </div>
  );
}
