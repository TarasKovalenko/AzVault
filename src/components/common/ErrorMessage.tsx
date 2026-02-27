import { Button, makeStyles, Text, tokens } from '@fluentui/react-components';
import { DismissCircle24Regular } from '@fluentui/react-icons';
import type { UserFacingError } from '../../types';

interface ErrorMessageProps {
  error: UserFacingError | string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const useStyles = makeStyles({
  root: {
    padding: '10px 14px',
    borderRadius: '4px',
    backgroundColor: tokens.colorPaletteRedBackground1,
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  },
  icon: {
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
    fontSize: '16px',
    marginTop: '1px',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  text: {
    color: tokens.colorPaletteRedForeground1,
  },
  description: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: '2px',
    lineHeight: 1.4,
  },
  action: {
    color: tokens.colorPaletteRedForeground1,
    marginTop: '2px',
    opacity: 0.85,
  },
  retryBtn: {
    marginTop: '8px',
  },
  dismissBtn: {
    flexShrink: 0,
  },
});

export function ErrorMessage({ error, onRetry, onDismiss }: ErrorMessageProps) {
  const parsed = typeof error === 'string' ? parseAzureError(error) : error;
  const classes = useStyles();

  return (
    <div className={classes.root}>
      <DismissCircle24Regular className={classes.icon} />
      <div className={classes.body}>
        <Text size={200} weight="semibold" className={classes.text}>
          {parsed.title}
        </Text>
        <Text size={200} block className={classes.description}>
          {parsed.description}
        </Text>
        <Text size={200} block className={classes.action}>
          {parsed.action}
        </Text>
        {parsed.retryable && onRetry && (
          <Button size="small" appearance="outline" onClick={onRetry} className={classes.retryBtn}>
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
          className={classes.dismissBtn}
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
