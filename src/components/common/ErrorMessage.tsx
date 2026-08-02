import type { UserFacingError } from '../../types';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

interface ErrorMessageProps {
  error: UserFacingError | string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  const parsed = typeof error === 'string' ? parseAzureError(error) : error;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-[var(--danger)]">
      <Icon name="alert" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{parsed.title}</p>
        <p className="mt-0.5 text-xs leading-5">{parsed.description}</p>
        <p className="text-xs leading-5 opacity-75">{parsed.action}</p>
        {parsed.retryable && onRetry && (
          <Button size="xs" className="mt-2" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="rounded-md p-1 hover:bg-red-500/10"
        >
          <Icon name="close" size={14} />
        </button>
      )}
    </div>
  );
}

export function parseAzureError(msg: string): UserFacingError {
  if (msg.includes('401'))
    return {
      title: 'Session expired',
      description: 'Your Azure CLI session has expired.',
      action: "Run 'az login' in your terminal, then retry.",
      retryable: true,
    };
  if (msg.includes('403'))
    return {
      title: 'Access denied',
      description: "You don't have permission for this operation.",
      action: 'Check your RBAC role assignments for this vault.',
      retryable: false,
    };
  if (msg.includes('404'))
    return {
      title: 'Not found',
      description: 'This item may have been deleted.',
      action: 'Refresh the list to see current items.',
      retryable: true,
    };
  if (msg.includes('409'))
    return {
      title: 'Conflict',
      description: 'An item with this name already exists or is soft-deleted.',
      action: 'Use a different name, or recover/purge the existing item.',
      retryable: false,
    };
  if (msg.includes('NetworkError') || msg.includes('fetch'))
    return {
      title: 'Network error',
      description: 'Cannot reach Azure Key Vault.',
      action: 'Check your internet connection and proxy settings.',
      retryable: true,
    };
  return {
    title: 'Unexpected error',
    description: msg.length > 200 ? `${msg.slice(0, 200)}...` : msg,
    action: 'Try again. If the problem persists, check the audit log.',
    retryable: true,
  };
}
