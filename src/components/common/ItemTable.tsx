/* eslint-disable react-refresh/only-export-components */
import {
  Badge,
  Checkbox,
  makeStyles,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Text,
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
  selectable?: boolean;
  selectedIds?: Set<string>;
  selectAllState?: boolean | 'mixed';
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleSelectAll?: (checked: boolean) => void;
}

const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '48px',
  },
  table: {
    width: '100%',
  },
  row: {
    cursor: 'pointer',
  },
  rowIndex: {
    opacity: 0.5,
  },
  statusDot: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dateText: {
    fontSize: '11px',
  },
  dimText: {
    opacity: 0.5,
  },
  dimmerText: {
    opacity: 0.4,
  },
  tagWrap: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
  },
});

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
  const classes = useStyles();

  if (loading) {
    return (
      <div className={classes.loading}>
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
      <Table size="small" className={classes.table}>
        <TableHeader>
          <TableRow>
            {selectable && (
              <th className="azv-th" style={{ width: 38 }}>
                <Checkbox
                  checked={selectAllState}
                  onChange={(_, d) => onToggleSelectAll?.(!!d.checked)}
                />
              </th>
            )}
            <th className="azv-th" style={{ width: 46 }}>
              #
            </th>
            {columns.map((col) => (
              <th className="azv-th" key={col.key} style={{ width: col.width }}>
                {col.label}
              </th>
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
                className={classes.row}
                style={{
                  background: selectedId === id ? tokens.colorBrandBackground2 : undefined,
                }}
              >
                {selectable && (
                  <TableCell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds?.has(id) ?? false}
                        onChange={(_, d) => onToggleSelect?.(id, !!d.checked)}
                      />
                    </div>
                  </TableCell>
                )}
                <TableCell>
                  <Text size={100} className={`azv-mono ${classes.rowIndex}`}>
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

/** Renders an enabled/disabled status badge with dot indicator. */
export function renderEnabled(enabled: boolean) {
  return (
    <span className="azv-status-row">
      <span
        className="azv-status-dot"
        style={{ background: enabled ? 'var(--azv-success)' : 'var(--azv-danger)' }}
      />
      <Text size={200}>{enabled ? 'Active' : 'Disabled'}</Text>
    </span>
  );
}

/** Formats an ISO date string to a compact readable format. */
export function renderDate(dateStr: string | null) {
  if (!dateStr)
    return (
      <Text size={200} style={{ opacity: 0.5 }}>
        —
      </Text>
    );
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
    return (
      <Text size={200} style={{ opacity: 0.4 }}>
        —
      </Text>
    );
  }
  return (
    <span className="azv-tag-row">
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
    </span>
  );
}
