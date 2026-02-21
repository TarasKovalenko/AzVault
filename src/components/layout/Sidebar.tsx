import { Badge, Button, Text, Tooltip, tokens } from '@fluentui/react-components';
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

const VAULT_NAV: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <TextBulletListSquare24Regular style={{ fontSize: 16 }} />,
  },
  { id: 'secrets', label: 'Secrets', icon: <Key24Regular style={{ fontSize: 16 }} /> },
  { id: 'keys', label: 'Keys', icon: <LockClosed24Regular style={{ fontSize: 16 }} /> },
  {
    id: 'certificates',
    label: 'Certificates',
    icon: <Certificate24Regular style={{ fontSize: 16 }} />,
  },
  { id: 'logs', label: 'Audit Log', icon: <ClipboardTextLtr24Regular style={{ fontSize: 16 }} /> },
];

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
      <div
        style={{
          width: 48,
          minWidth: 48,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '8px 0',
          gap: 4,
          background: tokens.colorNeutralBackground2,
          borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
        }}
      >
        {selectedVaultName &&
          VAULT_NAV.map((item) => (
            <Tooltip key={item.id} content={item.label} relationship="label" positioning="after">
              <Button
                appearance={activeTab === item.id ? 'primary' : 'subtle'}
                size="small"
                icon={item.icon}
                onClick={() => setActiveTab(item.id)}
                style={{ width: 36, height: 36 }}
              />
            </Tooltip>
          ))}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: tokens.colorNeutralBackground2,
        borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
        overflow: 'hidden',
      }}
    >
      {/* Pinned vaults */}
      {pinnedVaults.length > 0 && (
        <div style={{ padding: '8px 10px 4px' }}>
          <Text
            size={100}
            className="azv-title"
            block
            style={{ marginBottom: 4, padding: '0 4px' }}
          >
            Pinned
          </Text>
          {pinnedVaults.map((v) => (
            <div
              key={v.uri}
              onClick={() => selectVault(v.name, v.uri)}
              className="azv-list-item"
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
                background:
                  v.uri === selectedVaultUri ? tokens.colorBrandBackground2 : 'transparent',
              }}
            >
              <Star24Filled
                style={{ fontSize: 12, color: tokens.colorPaletteYellowForeground1, flexShrink: 0 }}
              />
              <Text size={200} truncate wrap={false} className="azv-mono" style={{ flex: 1 }}>
                {v.name}
              </Text>
            </div>
          ))}
        </div>
      )}

      {/* Recent vaults */}
      {recentVaults.length > 0 && (
        <div style={{ padding: '4px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 4px',
            }}
          >
            <Text size={100} className="azv-title">
              Recent
            </Text>
            <Button
              icon={<Delete24Regular />}
              appearance="subtle"
              size="small"
              onClick={clearRecentVaults}
              title="Clear recent vaults"
              style={{ width: 20, height: 20, minWidth: 20 }}
            />
          </div>
          {recentVaults.slice(0, 5).map((v) => (
            <div
              key={v.uri}
              onClick={() => selectVault(v.name, v.uri)}
              className="azv-list-item"
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
                background:
                  v.uri === selectedVaultUri ? tokens.colorBrandBackground2 : 'transparent',
              }}
            >
              <ShieldLock24Regular style={{ fontSize: 12, opacity: 0.5, flexShrink: 0 }} />
              <Text size={200} truncate wrap={false} className="azv-mono" style={{ flex: 1 }}>
                {v.name}
              </Text>
            </div>
          ))}
        </div>
      )}

      {/* Vault nav (when vault selected) */}
      {selectedVaultName && (
        <>
          <div
            style={{ borderTop: `1px solid ${tokens.colorNeutralStroke2}`, margin: '4px 10px' }}
          />
          <div style={{ padding: '4px 10px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 4px',
                marginBottom: 4,
              }}
            >
              <Text size={100} className="azv-title" style={{ flex: 1 }}>
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
                  style={{ width: 24, height: 24, minWidth: 24 }}
                />
              </Tooltip>
            </div>

            {VAULT_NAV.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className="azv-list-item"
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 2,
                  background: activeTab === item.id ? tokens.colorBrandBackground2 : 'transparent',
                  fontWeight: activeTab === item.id ? 600 : 400,
                }}
              >
                <span style={{ opacity: activeTab === item.id ? 1 : 0.6 }}>{item.icon}</span>
                <Text size={200} style={{ flex: 1 }}>
                  {item.label}
                </Text>
                {counts[item.id] !== undefined && (
                  <Badge size="small" appearance="outline">
                    {counts[item.id]}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Empty state when no vault */}
      {!selectedVaultName && pinnedVaults.length === 0 && recentVaults.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <ShieldLock24Regular style={{ fontSize: 32, opacity: 0.3 }} />
          <Text block size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: 8 }}>
            Select a vault from the workspace switcher
          </Text>
        </div>
      )}
    </div>
  );
}
