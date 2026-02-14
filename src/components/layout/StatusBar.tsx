/**
 * StatusBar.tsx – Bottom status bar.
 *
 * Displays tenant/subscription IDs, active vault, and theme mode
 * in a compact, terminal-inspired bar.
 */

import { Badge, Text, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

export function StatusBar() {
  const {
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    themeMode,
  } = useAppStore();

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
      {/* Left – IDs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="azv-mono">
        <Text size={100} font="monospace">
          tenant:{selectedTenantId ? selectedTenantId.slice(0, 8) : '—'}
        </Text>
        <Text size={100} font="monospace">
          sub:{selectedSubscriptionId ? selectedSubscriptionId.slice(0, 8) : '—'}
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
