import type { SelectHTMLAttributes } from 'react';
import { Spinner } from '../../ui/Button';
import { Icon, type IconName } from '../../ui/Icon';
import { cn } from '../../ui/cn';

interface WorkspaceSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  icon: IconName;
  isLoading: boolean;
}

export function WorkspaceSelect({
  icon,
  isLoading,
  className,
  children,
  disabled,
  ...props
}: WorkspaceSelectProps) {
  return (
    <div
      className={cn(
        'no-drag relative flex h-8 min-w-0 items-center rounded-lg text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
        disabled && 'opacity-45',
        className,
      )}
    >
      <span className="pointer-events-none absolute left-2 grid size-3.5 place-items-center">
        {isLoading ? <Spinner size="sm" /> : <Icon name={icon} size={14} />}
      </span>
      <select
        className="h-full min-w-0 cursor-default appearance-none truncate rounded-lg border-0 bg-transparent py-0 pl-7 pr-6 font-mono text-xs text-inherit outline-none"
        disabled={disabled || isLoading}
        {...props}
      >
        {children}
      </select>
      <Icon
        name="chevron-down"
        size={12}
        className="pointer-events-none absolute right-2 opacity-45"
      />
    </div>
  );
}
