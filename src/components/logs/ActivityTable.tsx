import { format } from 'date-fns';
import type { AuditEntry } from '../../types';
import { Badge } from '../ui/Badge';

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

export function ActivityTable({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-[var(--stroke)] bg-[var(--surface-solid)]">
      <table className="w-full table-fixed border-collapse text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--surface-raised)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] backdrop-blur-xl">
          <tr className="border-b border-[var(--stroke)]">
            <th className="w-[18%] px-3 py-2">Time</th>
            <th className="w-[18%] px-3 py-2">Action</th>
            <th className="w-[11%] px-3 py-2">Type</th>
            <th className="w-[20%] px-3 py-2">Item</th>
            <th className="w-[11%] px-3 py-2">Result</th>
            <th className="w-[22%] px-3 py-2">Details</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={`${entry.timestamp}-${entry.action}-${entry.itemName}-${index}`}
              className="border-b border-[var(--stroke)] last:border-0 hover:bg-[var(--surface-hover)]"
            >
              <td className="mono px-3 py-2.5 text-[10px]">{timestamp(entry.timestamp)}</td>
              <td className="px-3 py-2.5">
                <Badge tone={tone(entry.action)}>{entry.action}</Badge>
              </td>
              <td className="px-3 py-2.5 text-[var(--text-secondary)]">{entry.itemType}</td>
              <td className="mono truncate px-3 py-2.5" title={entry.itemName}>
                {entry.itemName}
              </td>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className={`size-1.5 rounded-full ${entry.result === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`}
                  />
                  {entry.result}
                </span>
              </td>
              <td
                className="mono truncate px-3 py-2.5 text-[10px] text-[var(--text-tertiary)]"
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
