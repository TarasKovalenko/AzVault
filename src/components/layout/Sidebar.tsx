import {
  Badge,
  Button,
  makeStyles,
  mergeClasses,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import {
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Delete24Regular,
  Key24Regular,
  LockClosed24Regular,
  ShieldLock24Regular,
  Star24Filled,
  Star24Regular,
  TextBulletListSquare24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { listCertificates, listKeys, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';

interface NavItem {
  id: ItemTab;
  label: string;
  icon: React.ReactElement;
  countKey?: string;
}

const navIconStyle = { fontSize: 16 } as const;

const VAULT_NAV: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <TextBulletListSquare24Regular style={navIconStyle} />,
  },
  { id: 'secrets', label: 'Secrets', icon: <Key24Regular style={navIconStyle} /> },
  { id: 'keys', label: 'Keys', icon: <LockClosed24Regular style={navIconStyle} /> },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: <Certificate24Regular style={navIconStyle} />,
  },
  { id: 'logs', label: 'Audit Log', icon: <ClipboardTextLtr24Regular style={navIconStyle} /> },
];

const useStyles = makeStyles({
  root: {
    width: '220px',
    minWidth: '220px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  collapsed: {
    width: '48px',
    minWidth: '48px',
    alignItems: 'center',
    padding: '8px 0',
    gap: '4px',
  },
  collapsedBtn: {
    width: '36px',
    height: '36px',
  },
  section: {
    padding: '8px 10px 4px',
  },
  sectionRecent: {
    padding: '4px 10px',
  },
  sectionLabel: {
    marginBottom: '4px',
    padding: '0 4px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 4px',
  },
  clearBtn: {
    width: '20px',
    height: '20px',
    minWidth: '20px',
  },
  vaultItem: {
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '2px',
  },
  vaultItemSelected: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  starIcon: {
    fontSize: '12px',
    color: tokens.colorPaletteYellowForeground1,
    flexShrink: 0,
  },
  recentIcon: {
    fontSize: '12px',
    opacity: 0.5,
    flexShrink: 0,
  },
  vaultName: {
    flex: 1,
  },
  divider: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    margin: '4px 10px',
  },
  navSection: {
    padding: '4px 10px',
  },
  navHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 4px',
    marginBottom: '4px',
  },
  navTitle: {
    flex: 1,
  },
  pinBtn: {
    width: '24px',
    height: '24px',
    minWidth: '24px',
  },
  navItem: {
    padding: '6px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '2px',
  },
  navItemActive: {
    backgroundColor: tokens.colorBrandBackground2,
    fontWeight: 600,
  },
  navIcon: {
    opacity: 0.6,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    flex: 1,
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center' as const,
  },
  emptyIcon: {
    fontSize: '32px',
    opacity: 0.3,
  },
  emptyText: {
    color: tokens.colorNeutralForeground3,
    marginTop: '8px',
  },
});

export function Sidebar() {
  const {
    selectedVaultUri,
    selectedVaultName,
    activeTab,
    setActiveTab,
    pinnedVaults,
    recentVaults,
    selectVault,
    unpinVault,
    pinVault,
    clearRecentVaults,
    sidebarCollapsed,
    selectedTenantId,
    selectedSubscriptionId,
  } = useAppStore();
  const classes = useStyles();

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });
  const keysQuery = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });
  const certsQuery = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  const counts: Record<string, number | undefined> = {
    secrets: secretsQuery.data?.length,
    keys: keysQuery.data?.length,
    certificates: certsQuery.data?.length,
  };

  const isPinned = pinnedVaults.some((v) => v.uri === selectedVaultUri);

  if (sidebarCollapsed) {
    return (
      <div className={mergeClasses(classes.root, classes.collapsed)}>
        {selectedVaultName &&
          VAULT_NAV.map((item) => (
            <Tooltip key={item.id} content={item.label} relationship="label" positioning="after">
              <Button
                appearance={activeTab === item.id ? 'primary' : 'subtle'}
                size="small"
                icon={item.icon}
                onClick={() => setActiveTab(item.id)}
                className={classes.collapsedBtn}
              />
            </Tooltip>
          ))}
      </div>
    );
  }

  return (
    <div className={classes.root}>
      {pinnedVaults.length > 0 && (
        <div className={classes.section}>
          <Text size={100} className={`azv-title ${classes.sectionLabel}`} block>
            Pinned
          </Text>
          {pinnedVaults.map((v) => (
            <div
              key={v.uri}
              onClick={() => selectVault(v.name, v.uri)}
              className={mergeClasses(
                'azv-list-item',
                classes.vaultItem,
                v.uri === selectedVaultUri && classes.vaultItemSelected,
              )}
            >
              <Star24Filled className={classes.starIcon} />
              <Text size={200} truncate wrap={false} className={`azv-mono ${classes.vaultName}`}>
                {v.name}
              </Text>
            </div>
          ))}
        </div>
      )}

      {recentVaults.length > 0 && (
        <div className={classes.sectionRecent}>
          <div className={classes.sectionHeader}>
            <Text size={100} className="azv-title">
              Recent
            </Text>
            <Button
              icon={<Delete24Regular />}
              appearance="subtle"
              size="small"
              onClick={clearRecentVaults}
              title="Clear recent vaults"
              className={classes.clearBtn}
            />
          </div>
          {recentVaults.slice(0, 5).map((v) => (
            <div
              key={v.uri}
              onClick={() => selectVault(v.name, v.uri)}
              className={mergeClasses(
                'azv-list-item',
                classes.vaultItem,
                v.uri === selectedVaultUri && classes.vaultItemSelected,
              )}
            >
              <ShieldLock24Regular className={classes.recentIcon} />
              <Text size={200} truncate wrap={false} className={`azv-mono ${classes.vaultName}`}>
                {v.name}
              </Text>
            </div>
          ))}
        </div>
      )}

      {selectedVaultName && (
        <>
          <div className={classes.divider} />
          <div className={classes.navSection}>
            <div className={classes.navHeader}>
              <Text size={100} className={`azv-title ${classes.navTitle}`}>
                {selectedVaultName}
              </Text>
              <Tooltip content={isPinned ? 'Unpin vault' : 'Pin vault'} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={
                    isPinned ? (
                      <Star24Filled style={{ color: tokens.colorPaletteYellowForeground1 }} />
                    ) : (
                      <Star24Regular />
                    )
                  }
                  onClick={() => {
                    if (isPinned) {
                      unpinVault(selectedVaultUri!);
                    } else if (selectedTenantId && selectedSubscriptionId && selectedVaultUri) {
                      pinVault({
                        name: selectedVaultName,
                        uri: selectedVaultUri,
                        tenantId: selectedTenantId,
                        subscriptionId: selectedSubscriptionId,
                      });
                    }
                  }}
                  className={classes.pinBtn}
                />
              </Tooltip>
            </div>

            {VAULT_NAV.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={mergeClasses(
                    'azv-list-item',
                    classes.navItem,
                    isActive && classes.navItemActive,
                  )}
                >
                  <span className={isActive ? classes.navIconActive : classes.navIcon}>
                    {item.icon}
                  </span>
                  <Text size={200} className={classes.navLabel}>
                    {item.label}
                  </Text>
                  {counts[item.id] !== undefined && (
                    <Badge size="small" appearance="outline">
                      {counts[item.id]}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {!selectedVaultName && pinnedVaults.length === 0 && recentVaults.length === 0 && (
        <div className={classes.emptyState}>
          <ShieldLock24Regular className={classes.emptyIcon} />
          <Text block size={200} className={classes.emptyText}>
            Select a vault from the workspace switcher
          </Text>
        </div>
      )}
    </div>
  );
}
