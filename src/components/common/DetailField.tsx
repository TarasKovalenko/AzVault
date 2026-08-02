import type { ReactNode } from 'react';
import { cn } from '../ui/cn';

export function DetailField({
  label,
  value,
  mono,
  children,
}: {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-1 border-b border-[var(--stroke)] py-2.5 last:border-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className={cn('break-all text-xs leading-5', mono && 'mono')}>{children ?? value}</dd>
    </div>
  );
}
