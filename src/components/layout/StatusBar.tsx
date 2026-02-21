import { Badge, Text, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

export function StatusBar() {
  const {
    userName,
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    themeMode,
    tenants,
    subscriptions,
  } = useAppStore();

  const currentTenant = tenants.find((t) => t.tenant_id === selectedTenantId);
  const currentSub = subscriptions.find((s) => s.subscriptionId === selectedSubscriptionId);

  return (
    <div
      className="azv-pane"
      style={{
        height: 26,
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
        fontSize: 11,
      }}
    >
      {/* Left – Auth + context */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="azv-mono">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span
            className="azv-status-dot"
            style={{
              background: userName ? 'var(--azv-success)' : 'var(--azv-danger)',
              width: 6,
              height: 6,
            }}
          />
          <Text size={100} font="monospace">
            {userName || 'not signed in'}
          </Text>
        </div>
        <Text size={100} font="monospace" style={{ opacity: 0.5 }}>
          |
        </Text>
        <Text size={100} font="monospace">
          tenant:
          {currentTenant?.display_name || (selectedTenantId ? selectedTenantId.slice(0, 8) : '—')}
        </Text>
        <Text size={100} font="monospace">
          sub:
          {currentSub?.displayName ||
            (selectedSubscriptionId ? selectedSubscriptionId.slice(0, 8) : '—')}
        </Text>
      </div>

      {/* Right – vault and theme */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="azv-mono">
        <Text size={100} font="monospace">
          vault:{selectedVaultName || '—'}
        </Text>
        <Badge
          appearance="outline"
          size="small"
          color={themeMode === 'dark' ? 'important' : 'success'}
        >
          {themeMode}
        </Badge>
      </div>
    </div>
  );
}
