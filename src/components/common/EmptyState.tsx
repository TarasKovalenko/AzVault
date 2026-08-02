import type { ReactNode } from 'react';
import { Button } from '../ui/Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-52 flex-col items-center justify-center gap-2.5 px-8 py-12 text-center">
      {icon && <div className="mb-1 text-[var(--text-tertiary)] [&>svg]:size-9">{icon}</div>}
      <h2 className="text-[15px] font-semibold text-[var(--text)]">{title}</h2>
      {description && (
        <p className="max-w-sm text-[13px] leading-5 text-[var(--text-secondary)]">{description}</p>
      )}
      {action && (
        <Button variant="primary" size="sm" className="mt-2" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
