import { format } from 'date-fns';
import type { AuditEntry } from '../../../types';
import { actionLabel } from '../../logs/auditLabels';
import { Badge } from '../../ui/Badge';

function time(value: string) {
  try {
    return format(new Date(value), 'HH:mm:ss');
  } catch {
    return value;
  }
}
function tone(action: string): 'blue' | 'green' | 'orange' | 'red' {
  if (action.includes('delete') || action.includes('purge')) return 'red';
  if (action.includes('set')) return 'green';
  if (action.includes('get_value')) return 'orange';
  return 'blue';
}

export function RecentActivityCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <section className="mac-panel rounded-2xl p-4">
      <h2 className="mb-3 text-[13px] font-semibold">Recent activity</h2>
      {!entries.length ? (
        <p className="text-xs text-[var(--text-secondary)]">No activity recorded for this vault.</p>
      ) : (
        <div className="grid gap-1">
          {[...entries]
            .reverse()
            .slice(0, 5)
            .map((entry, index) => (
              <div
                key={`${entry.timestamp}-${entry.action}-${entry.itemName}-${index}`}
                className="flex min-w-0 items-center gap-2 py-1"
              >
                <span className="mono w-16 shrink-0 text-[11px] text-[var(--text-secondary)]">
                  {time(entry.timestamp)}
                </span>
                <Badge tone={tone(entry.action)}>{actionLabel(entry.action)}</Badge>
                <span className="mono min-w-0 flex-1 truncate text-[11px]">
                  {entry.itemName || '—'}
                </span>
                <span
                  className={`size-1.5 shrink-0 rounded-full ${entry.result === 'success' ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`}
                />
              </div>
            ))}
        </div>
      )}
    </section>
  );
}
