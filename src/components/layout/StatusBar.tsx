import { Badge, Text, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

function envLabel(env: string): string {
  if (env === 'azureUsGovernment') return 'Azure US Gov';
  if (env === 'azureChina') return 'Azure China';
  return 'Azure Public';
}

export function StatusBar() {
  const {
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    environment,
    themeMode,
  } = useAppStore();

  return (
    <div
      className="azv-pane"
      style={{
        height: 30,
        borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px',
        background: tokens.colorNeutralBackground2,
        margin: 0,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Badge appearance="outline" size="small" color="informative">{envLabel(environment)}</Badge>
        <Text size={100} font="monospace">tenant: {selectedTenantId || '-'}</Text>
        <Text size={100} font="monospace">sub: {selectedSubscriptionId || '-'}</Text>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text size={100}>vault: {selectedVaultName || 'none'}</Text>
        <Badge appearance="outline" size="small" color={themeMode === 'dark' ? 'important' : 'success'}>
          {themeMode}
        </Badge>
      </div>
    </div>
  );
}
