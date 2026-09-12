import { type ReactNode, useEffect, useRef } from 'react';
import { Input } from '../ui/Field';
import { Icon } from '../ui/Icon';

/**
 * The single header used by every resource list: title, result count, an
 * optional status slot, the filter box and resource actions — in that order,
 * so the chrome stays identical as the user moves between tabs.
 */
export function ListToolbar({
  title,
  subtitle,
  count,
  total,
  filter,
  filterPlaceholder = 'Filter by name',
  onFilterChange,
  status,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  count?: number;
  total?: number;
  filter: string;
  filterPlaceholder?: string;
  onFilterChange: (value: string) => void;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const filterRef = useRef<HTMLInputElement>(null);

  // Every list view owns a filter box, so the "focus filter" command belongs
  // here rather than in one resource module.
  useEffect(() => {
    const focus = () => filterRef.current?.focus();
    window.addEventListener('azv:focus-search', focus);
    return () => window.removeEventListener('azv:focus-search', focus);
  }, []);

  return (
    <header className="mac-vibrancy flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b border-[var(--stroke)] px-3 py-1.5">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[14px] font-semibold">{title}</h1>
          {count !== undefined && (
            <span className="mono text-[11px] text-[var(--text-tertiary)]">
              {count}
              {filter && total !== undefined ? ` / ${total}` : ''}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="mono max-w-56 truncate text-[10px] text-[var(--text-tertiary)]">
            {subtitle}
          </p>
        )}
      </div>
      {status}
      <div className="ml-auto flex items-center gap-1.5">
        <div className="relative">
          <Icon
            name="search"
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
          <Input
            ref={filterRef}
            data-azv-list-search
            type="search"
            aria-label={`Filter ${title.toLowerCase()}`}
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
            placeholder={filterPlaceholder}
            className="w-44 pl-8"
          />
        </div>
        {actions}
      </div>
    </header>
  );
}
