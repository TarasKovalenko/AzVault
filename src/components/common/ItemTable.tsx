/* eslint-disable react-refresh/only-export-components */
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Badge,
  Text,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import { format } from 'date-fns';

export interface Column<T> {
  key: string;
  label: string;
  width?: string;
  render: (item: T) => React.ReactNode;
}

interface ItemTableProps<T> {
  items: T[];
  columns: Column<T>[];
  loading?: boolean;
  selectedId?: string | null;
  onSelect?: (item: T) => void;
  getItemId: (item: T) => string;
  emptyMessage?: string;
}

export function ItemTable<T>({
  items,
  columns,
  loading,
  selectedId,
  onSelect,
  getItemId,
  emptyMessage = 'No items found',
}: ItemTableProps<T>) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner label="Loading..." />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: 48,
          color: tokens.colorNeutralForeground3,
        }}
      >
        <Text>{emptyMessage}</Text>
      </div>
    );
  }

  return (
    <div className="azv-table-wrap">
      <Table size="small" style={{ width: '100%' }}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell style={{ width: 56 }}>#</TableHeaderCell>
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
                    selectedId === id
                      ? tokens.colorBrandBackground2
                      : undefined,
                }}
              >
                <TableCell>
                  <Text size={100} className="azv-mono">
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

// Utility renderers
export function renderEnabled(enabled: boolean) {
  return (
    <Badge
      size="small"
      appearance="filled"
      color={enabled ? 'success' : 'danger'}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </Badge>
  );
}

export function renderDate(dateStr: string | null) {
  if (!dateStr) return <Text size={200}>-</Text>;
  try {
    return <Text size={200}>{format(new Date(dateStr), 'MMM d, yyyy HH:mm')}</Text>;
  } catch {
    return <Text size={200}>{dateStr}</Text>;
  }
}

export function renderTags(tags: Record<string, string> | null) {
  if (!tags || Object.keys(tags).length === 0) return <Text size={200}>-</Text>;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {Object.entries(tags)
        .slice(0, 3)
        .map(([k, v]) => (
          <Badge key={k} size="small" appearance="outline" className="azv-tag-pill" title={`${k}=${v}`}>
            <span className="azv-tag-text">{k}={v}</span>
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
