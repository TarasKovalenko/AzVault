import { format } from 'date-fns';
import type { KeyboardEvent } from 'react';
import type { AuditEntry } from '../../types';
import { Badge } from '../ui/Badge';
import { actionLabel, itemTypeLabel, resultLabel } from './auditLabels';

function tone(action: string): 'blue' | 'green' | 'orange' | 'red' | 'purple' {
  if (action.includes('delete') || action.includes('purge')) return 'red';
  if (action.includes('set') || action.includes('create')) return 'green';
  if (action.includes('get_value')) return 'orange';
  if (action.includes('sign')) return 'purple';
  return 'blue';
}

function timestamp(value: string) {
  try {
    return format(new Date(value), 'MMM d, HH:mm:ss');
  } catch {
    return value;
  }
}

const COLUMNS = [
  { label: 'Time', width: 'w-[18%]' },
  { label: 'Action', width: 'w-[18%]' },
  { label: 'Type', width: 'w-[11%]' },
  { label: 'Item', width: 'w-[20%]' },
  { label: 'Result', width: 'w-[11%]' },
  { label: 'Details', width: 'w-[22%]' },
];

export function ActivityTable({ entries }: { entries: AuditEntry[] }) {
  // Arrow keys walk the rows, matching the secrets, keys and certificates lists.
  const moveFocus = (event: KeyboardEvent<HTMLTableRowElement>, offset: number) => {
    event.preventDefault();
    const rows = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLTableRowElement>('tr[tabindex]') ??
        [],
    );
    rows[rows.indexOf(event.currentTarget) + offset]?.focus();
  };

  return (
    <div className="overflow-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface-solid)]">
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--text-secondary)] backdrop-blur-xl">
          <tr className="border-b border-[var(--stroke)]">
            {COLUMNS.map((column) => (
              <th key={column.label} scope="col" className={`${column.width} px-3 py-2`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={`${entry.timestamp}-${entry.action}-${entry.itemName}-${index}`}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') moveFocus(event, 1);
                else if (event.key === 'ArrowUp') moveFocus(event, -1);
              }}
              className="border-b border-[var(--stroke)] last:border-0 hover:bg-[var(--surface-hover)]"
            >
              <td className="mono px-3 py-2.5 text-[11px]">{timestamp(entry.timestamp)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={tone(entry.action)}>{actionLabel(entry.action)}</Badge>
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">
                {itemTypeLabel(entry.itemType)}
              </td>
              <td className="mono truncate px-3 py-2.5" title={entry.itemName}>
                {entry.itemName}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${entry.result === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`}
                  />
                  {resultLabel(entry.result)}
                </span>
              </td>
              <td
                className="truncate px-3 py-2.5 text-[11px] text-[var(--text-secondary)]"
                title={entry.details || '—'}
              >
                {entry.details || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
