import type { ReactNode } from 'react';
import { Input } from '../ui/Field';
import { Icon } from '../ui/Icon';

export function ListToolbar({
  title,
  count,
  total,
  filter,
  onFilterChange,
  actions,
}: {
  title: string;
  count?: number;
  total?: number;
  filter: string;
  onFilterChange: (value: string) => void;
  actions?: ReactNode;
}) {
  return (
    <header className="mac-vibrancy flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke)] px-3">
      <h1 className="text-[14px] font-semibold">{title}</h1>
      {count !== undefined && (
        <span className="mono text-[11px] text-[var(--text-tertiary)]">
          {count}
          {filter && total !== undefined ? ` / ${total}` : ''}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        {actions}
        <div className="relative">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <Input
            data-azv-list-search
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder="Filter"
            className="w-44 pl-8"
          />
        </div>
      </div>
    </header>
  );
}
