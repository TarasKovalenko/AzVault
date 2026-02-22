import { Badge, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

const useStyles = makeStyles({
  root: {
    height: '26px',
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px',
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: '11px',
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  authDot: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  statusDot: {
    width: '6px',
    height: '6px',
  },
  separator: {
    opacity: 0.5,
  },
});

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
  const classes = useStyles();

  const currentTenant = tenants.find((t) => t.tenant_id === selectedTenantId);
  const currentSub = subscriptions.find((s) => s.subscriptionId === selectedSubscriptionId);

  return (
    <div className={`azv-pane ${classes.root}`}>
      <div className={`${classes.section} azv-mono`}>
        <div className={classes.authDot}>
          <span
            className={`azv-status-dot ${classes.statusDot}`}
            style={{ background: userName ? 'var(--azv-success)' : 'var(--azv-danger)' }}
          />
          <Text size={100} font="monospace">
            {userName || 'not signed in'}
          </Text>
        </div>
        <Text size={100} font="monospace" className={classes.separator}>
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

      <div className={`${classes.section} azv-mono`}>
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
