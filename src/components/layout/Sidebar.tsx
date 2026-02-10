import { useState, useEffect } from 'react';
import {
  Tree,
  TreeItem,
  TreeItemLayout,
  Spinner,
  Text,
  Divider,
  Badge,
  Button,
  Input,
  tokens,
} from '@fluentui/react-components';
import {
  Building24Regular,
  CreditCardPerson24Regular,
  ShieldKeyhole24Regular,
  ArrowSync24Regular,
  Search24Regular,
  Star24Filled,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/appStore';
import {
  listTenants,
  listSubscriptions,
  listKeyvaults,
  setTenant,
} from '../../services/tauri';

export function Sidebar() {
  const {
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultUri,
    selectTenant,
    selectSubscription,
    selectVault,
    setTenants,
    setSubscriptions,
    setKeyvaults,
    recentVaults,
  } = useAppStore();

  const [vaultFilter, setVaultFilter] = useState('');

  const tenantsQuery = useQuery({
    queryKey: ['tenants'],
    queryFn: listTenants,
  });

  const subsQuery = useQuery({
    queryKey: ['subscriptions', selectedTenantId],
    queryFn: listSubscriptions,
    enabled: !!selectedTenantId,
  });

  const vaultsQuery = useQuery({
    queryKey: ['keyvaults', selectedSubscriptionId],
    queryFn: () => listKeyvaults(selectedSubscriptionId!),
    enabled: !!selectedSubscriptionId,
  });

  useEffect(() => {
    if (tenantsQuery.data) setTenants(tenantsQuery.data);
  }, [tenantsQuery.data, setTenants]);

  useEffect(() => {
    if (subsQuery.data) setSubscriptions(subsQuery.data);
  }, [subsQuery.data, setSubscriptions]);

  useEffect(() => {
    if (vaultsQuery.data) setKeyvaults(vaultsQuery.data);
  }, [vaultsQuery.data, setKeyvaults]);

  // Auto-select first tenant if none selected
  useEffect(() => {
    if (tenantsQuery.data?.length && !selectedTenantId) {
      const first = tenantsQuery.data[0];
      selectTenant(first.tenant_id);
      setTenant(first.tenant_id);
    }
  }, [tenantsQuery.data, selectedTenantId, selectTenant]);

  const filteredVaults = (vaultsQuery.data || []).filter((v) =>
    v.name.toLowerCase().includes(vaultFilter.toLowerCase())
  );

  return (
    <div
      style={{
        width: 280,
        minWidth: 280,
        height: '100%',
        borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
        display: 'flex',
        flexDirection: 'column',
        background: tokens.colorNeutralBackground2,
        overflow: 'hidden',
      }}
    >
      {/* Tenant/Subscription Section */}
      <div style={{ padding: '12px 16px' }}>
        <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Tenant
        </Text>
        {tenantsQuery.isLoading ? (
          <Spinner size="tiny" style={{ marginTop: 8 }} />
        ) : (
          <div style={{ marginTop: 4 }}>
            {(tenantsQuery.data || []).map((t) => (
              <div
                key={t.tenant_id}
                onClick={() => {
                  selectTenant(t.tenant_id);
                  setTenant(t.tenant_id);
                }}
                style={{
                  padding: '6px 8px',
                  borderRadius: tokens.borderRadiusMedium,
                  cursor: 'pointer',
                  background:
                    selectedTenantId === t.tenant_id
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Building24Regular style={{ fontSize: 16, flexShrink: 0 }} />
                <Text size={200} truncate wrap={false}>
                  {t.display_name || t.tenant_id.slice(0, 8)}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Subscription Section */}
      <div style={{ padding: '12px 16px' }}>
        <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Subscription
        </Text>
        {subsQuery.isLoading ? (
          <Spinner size="tiny" style={{ marginTop: 8 }} />
        ) : (
          <div style={{ marginTop: 4 }}>
            {(subsQuery.data || []).map((s) => (
              <div
                key={s.subscriptionId}
                onClick={() => selectSubscription(s.subscriptionId)}
                style={{
                  padding: '6px 8px',
                  borderRadius: tokens.borderRadiusMedium,
                  cursor: 'pointer',
                  background:
                    selectedSubscriptionId === s.subscriptionId
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CreditCardPerson24Regular style={{ fontSize: 16, flexShrink: 0 }} />
                <Text size={200} truncate wrap={false}>
                  {s.displayName}
                </Text>
                <Badge
                  size="small"
                  appearance="outline"
                  color={s.state === 'Enabled' ? 'success' : 'warning'}
                  style={{ marginLeft: 'auto', flexShrink: 0 }}
                >
                  {s.state}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Vaults Section */}
      <div style={{ padding: '8px 16px', flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Key Vaults
          </Text>
          {vaultsQuery.data && (
            <Badge size="small" appearance="filled" color="informative">
              {vaultsQuery.data.length}
            </Badge>
          )}
          <Button
            icon={<ArrowSync24Regular />}
            appearance="subtle"
            size="small"
            onClick={() => vaultsQuery.refetch()}
            style={{ marginLeft: 'auto' }}
            title="Refresh vaults"
          />
        </div>

        <Input
          placeholder="Filter vaults..."
          contentBefore={<Search24Regular style={{ fontSize: 16 }} />}
          size="small"
          value={vaultFilter}
          onChange={(_, d) => setVaultFilter(d.value)}
          style={{ marginBottom: 8 }}
        />

        {vaultsQuery.isLoading ? (
          <Spinner size="tiny" />
        ) : (
          <Tree aria-label="Key Vaults">
            {filteredVaults.map((v) => (
              <TreeItem key={v.id} itemType="leaf">
                <TreeItemLayout
                  onClick={() => selectVault(v.name, v.vaultUri)}
                  style={{
                    background:
                      selectedVaultUri === v.vaultUri
                        ? tokens.colorBrandBackground2
                        : undefined,
                    borderRadius: tokens.borderRadiusMedium,
                  }}
                  iconBefore={
                    <ShieldKeyhole24Regular
                      style={{
                        fontSize: 16,
                        color:
                          selectedVaultUri === v.vaultUri
                            ? tokens.colorBrandForeground1
                            : undefined,
                      }}
                    />
                  }
                >
                  <div>
                    <Text size={200} weight={selectedVaultUri === v.vaultUri ? 'semibold' : 'regular'}>
                      {v.name}
                    </Text>
                    <Text size={100} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                      {v.location} | {v.resourceGroup}
                    </Text>
                  </div>
                </TreeItemLayout>
              </TreeItem>
            ))}
          </Tree>
        )}
      </div>

      {/* Recent Vaults */}
      {recentVaults.length > 0 && (
        <>
          <Divider />
          <div style={{ padding: '8px 16px 12px' }}>
            <Text size={200} weight="semibold" style={{ color: tokens.colorNeutralForeground3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Recent
            </Text>
            {recentVaults.slice(0, 5).map((v) => (
              <div
                key={v.uri}
                onClick={() => selectVault(v.name, v.uri)}
                style={{
                  padding: '4px 8px',
                  borderRadius: tokens.borderRadiusMedium,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Star24Filled style={{ fontSize: 12, color: tokens.colorPaletteYellowForeground1 }} />
                <Text size={200}>{v.name}</Text>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
