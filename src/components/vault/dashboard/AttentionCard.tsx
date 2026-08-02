import type { ItemTab } from '../../../types';
import { Badge } from '../../ui/Badge';
import { Icon } from '../../ui/Icon';

export interface AttentionItem {
  id: string;
  name: string;
  type: string;
  tab: ItemTab;
  reason: string;
  days: number | null;
}

export function AttentionCard({
  items,
  onOpen,
}: {
  items: AttentionItem[];
  onOpen: (tab: ItemTab) => void;
}) {
  return (
    <section className="mac-panel rounded-2xl p-4">
      <header className="mb-3 flex items-center gap-3">
        <span
          className={`grid size-9 place-items-center rounded-xl ${items.length ? 'bg-orange-500/10 text-[var(--warning)]' : 'bg-green-500/10 text-[var(--success)]'}`}
        >
          <Icon name={items.length ? 'alert' : 'shield'} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Attention</h2>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {items.length
              ? `${items.length} item${items.length === 1 ? '' : 's'} need review`
              : 'No disabled or soon-to-expire items'}
          </p>
        </div>
        {items.length > 0 && <Badge tone="orange">{items.length}</Badge>}
      </header>
      {!items.length ? (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/5 p-3 text-xs text-[var(--text-secondary)]">
          <Icon name="check" className="text-[var(--success)]" />
          Everything looks healthy for the next 30 days.
        </div>
      ) : (
        <div className="grid gap-1">
          {items.slice(0, 6).map((item) => (
            <button
              type="button"
              key={`${item.tab}-${item.id}`}
              onClick={() => onOpen(item.tab)}
              className="grid grid-cols-[20px_minmax(0,1fr)_auto_16px] items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-[var(--surface-hover)]"
            >
              <Icon name="alert" size={15} className="text-[var(--warning)]" />
              <span className="min-w-0">
                <strong className="block truncate text-xs">{item.name}</strong>
                <span className="text-[10px] text-[var(--text-tertiary)]">{item.type}</span>
              </span>
              <Badge tone={item.reason === 'Expired' ? 'red' : 'orange'}>{item.reason}</Badge>
              <Icon name="arrow-right" size={13} className="text-[var(--text-tertiary)]" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
