import { Button, Text, tokens } from '@fluentui/react-components';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="azv-empty" style={{ height: '100%' }}>
      {icon && <div style={{ fontSize: 40, opacity: 0.45 }}>{icon}</div>}
      <Text block size={300} weight="semibold">
        {title}
      </Text>
      {description && (
        <Text
          block
          size={200}
          style={{ color: tokens.colorNeutralForeground3, maxWidth: 380, lineHeight: 1.5 }}
        >
          {description}
        </Text>
      )}
      {action && (
        <Button appearance="primary" size="small" onClick={action.onClick} style={{ marginTop: 4 }}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
