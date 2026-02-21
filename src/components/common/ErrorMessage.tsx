import { Button, Text, tokens } from '@fluentui/react-components';
import { DismissCircle24Regular } from '@fluentui/react-icons';
import type { UserFacingError } from '../../types';

interface ErrorMessageProps {
  error: UserFacingError | string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  const parsed = typeof error === 'string' ? parseAzureError(error) : error;

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 4,
        background: tokens.colorPaletteRedBackground1,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <DismissCircle24Regular
        style={{
          color: tokens.colorPaletteRedForeground1,
          flexShrink: 0,
          fontSize: 16,
          marginTop: 1,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text size={200} weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>
          {parsed.title}
        </Text>
        <Text
          size={200}
          block
          style={{ color: tokens.colorPaletteRedForeground1, marginTop: 2, lineHeight: 1.4 }}
        >
          {parsed.description}
        </Text>
        <Text
          size={200}
          block
          style={{ color: tokens.colorPaletteRedForeground1, marginTop: 2, opacity: 0.85 }}
        >
          {parsed.action}
        </Text>
        {parsed.retryable && onRetry && (
          <Button size="small" appearance="outline" onClick={onRetry} style={{ marginTop: 8 }}>
            Retry
          </Button>
        )}
      </div>
      {onDismiss && (
        <Button
          appearance="subtle"
          size="small"
          icon={<DismissCircle24Regular />}
          onClick={onDismiss}
          style={{ flexShrink: 0 }}
        />
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
