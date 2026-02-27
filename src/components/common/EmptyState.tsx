import { Button, makeStyles, Text, tokens } from '@fluentui/react-components';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const useStyles = makeStyles({
  icon: {
    fontSize: '40px',
    opacity: 0.45,
  },
  description: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '380px',
    lineHeight: 1.5,
  },
  actionBtn: {
    marginTop: '4px',
  },
});

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const classes = useStyles();

  return (
    <div className="azv-empty" style={{ height: '100%' }}>
      {icon && <div className={classes.icon}>{icon}</div>}
      <Text block size={300} weight="semibold">
        {title}
      </Text>
      {description && (
        <Text block size={200} className={classes.description}>
          {description}
        </Text>
      )}
      {action && (
        <Button
          appearance="primary"
          size="small"
          onClick={action.onClick}
          className={classes.actionBtn}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
