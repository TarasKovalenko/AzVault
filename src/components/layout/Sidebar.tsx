import { useState, useEffect, type ReactNode } from 'react';
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
  ChevronDown20Regular,
  ChevronRight20Regular,
  Delete24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../../stores/appStore';
import {
  listTenants,
  listSubscriptions,
  listKeyvaults,
  setTenant,
} from '../../services/tauri';

type SectionKey = 'tenant' | 'subscription' | 'vaults' | 'recent';

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
    selectedVaultName,
    clearRecentVaults,
  } = useAppStore();

  const [vaultFilter, setVaultFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    tenant: false,
    subscription: false,
    vaults: false,
    recent: false,
  });
  const [sectionHeights, setSectionHeights] = useState<Record<SectionKey, number>>({
    tenant: 140,
    subscription: 150,
    vaults: 280,
    recent: 120,
  });

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

  const toggleSection = (key: SectionKey) => {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  };

  const renderSectionHeader = (
    key: SectionKey,
    title: string,
    right?: ReactNode
  ) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px 4px' }}>
      <Button
        appearance="subtle"
        size="small"
        icon={collapsed[key] ? <ChevronRight20Regular /> : <ChevronDown20Regular />}
        onClick={() => toggleSection(key)}
      />
      <Text size={200} weight="semibold" className="azv-title" style={{ flex: 1 }}>
        {title}
      </Text>
      {right}
    </div>
  );

  const renderSectionBody = (key: SectionKey, children: ReactNode) => {
    if (collapsed[key]) return null;

    return (
      <div
        style={{
          height: sectionHeights[key],
          minHeight: 72,
          resize: 'vertical',
          overflow: 'auto',
          padding: '0 12px 8px',
        }}
        onMouseUp={(e) => {
          const target = e.currentTarget;
          const newHeight = Math.round(target.getBoundingClientRect().height);
          setSectionHeights((s) => ({ ...s, [key]: Math.max(72, newHeight) }));
        }}
      >
        {children}
      </div>
    );
  };

  return (
    <div
      className="azv-pane"
      style={{
        width: 300,
        minWidth: 300,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: tokens.colorNeutralBackground2,
        overflow: 'hidden',
        margin: 0,
        borderRadius: 0,
        borderTop: 'none',
        borderLeft: 'none',
        borderBottom: 'none',
      }}
    >
      <div style={{ padding: '10px 12px 8px' }}>
        <div
          style={{
            padding: 8,
            borderRadius: tokens.borderRadiusSmall,
            border: `1px solid ${tokens.colorNeutralStroke1}`,
            background: tokens.colorNeutralBackground1,
          }}
        >
          <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            Workspace Context
          </Text>
          <Text size={100} className="azv-mono" block>
            vault: {selectedVaultName || 'none'}
          </Text>
          <Text size={100} className="azv-mono" block>
            sub: {selectedSubscriptionId || '-'}
          </Text>
        </div>
      </div>

      <Divider />
      {renderSectionHeader(
        'tenant',
        'Directory / Tenants',
        <Badge size="small" appearance="outline">{(tenantsQuery.data || []).length}</Badge>
      )}
      {renderSectionBody(
        'tenant',
        tenantsQuery.isLoading ? (
          <Spinner size="tiny" />
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
                  borderRadius: tokens.borderRadiusSmall,
                  cursor: 'pointer',
                  background:
                    selectedTenantId === t.tenant_id
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
                className="azv-list-item"
              >
                <Building24Regular style={{ fontSize: 16, flexShrink: 0 }} />
                <Text size={200} truncate wrap={false}>
                  {t.display_name || t.tenant_id.slice(0, 8)}
                </Text>
              </div>
            ))}
          </div>
        )
      )}

      <Divider />
      {renderSectionHeader(
        'subscription',
        'Scope / Subscriptions',
        <Badge size="small" appearance="outline">{(subsQuery.data || []).length}</Badge>
      )}
      {renderSectionBody(
        'subscription',
        subsQuery.isLoading ? (
          <Spinner size="tiny" />
        ) : (
          <div style={{ marginTop: 4 }}>
            {(subsQuery.data || []).map((s) => (
              <div
                key={s.subscriptionId}
                onClick={() => selectSubscription(s.subscriptionId)}
                style={{
                  padding: '6px 8px',
                  borderRadius: tokens.borderRadiusSmall,
                  cursor: 'pointer',
                  background:
                    selectedSubscriptionId === s.subscriptionId
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 4,
                }}
                className="azv-list-item"
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
        )
      )}

      <Divider />
      {renderSectionHeader(
        'vaults',
        'Vault Explorer',
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Badge size="small" appearance="outline">{filteredVaults.length}</Badge>
          <Button
            icon={<ArrowSync24Regular />}
            appearance="subtle"
            size="small"
            onClick={() => vaultsQuery.refetch()}
            title="Refresh vaults"
          />
        </div>
      )}
      {renderSectionBody(
        'vaults',
        <>
          <Input
            placeholder="Filter vaults..."
            contentBefore={<Search24Regular style={{ fontSize: 16 }} />}
            size="small"
            value={vaultFilter}
            onChange={(_, d) => setVaultFilter(d.value)}
            style={{ margin: '4px 0 8px' }}
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
                      borderRadius: tokens.borderRadiusSmall,
                      border: `1px solid ${
                        selectedVaultUri === v.vaultUri
                          ? tokens.colorBrandStroke1
                          : 'transparent'
                      }`,
                    }}
                    className="azv-list-item"
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
        </>
      )}

      <Divider />
      {renderSectionHeader(
        'recent',
        'Recent Vaults',
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Badge size="small" appearance="outline">{recentVaults.length}</Badge>
          <Button
            icon={<Delete24Regular />}
            appearance="subtle"
            size="small"
            onClick={clearRecentVaults}
            title="Clear recent vaults"
            disabled={recentVaults.length === 0}
          />
        </div>
      )}
      {renderSectionBody(
        'recent',
        recentVaults.length === 0 ? (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3, marginTop: 6 }}>
            No recent vaults.
          </Text>
        ) : (
          <>
            {recentVaults.slice(0, 10).map((v) => (
              <div
                key={v.uri}
                onClick={() => selectVault(v.name, v.uri)}
                style={{
                  padding: '4px 8px',
                  borderRadius: tokens.borderRadiusSmall,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 4,
                }}
                className="azv-list-item"
              >
                <Star24Filled style={{ fontSize: 12, color: tokens.colorPaletteYellowForeground1 }} />
                <Text size={200} truncate wrap={false}>{v.name}</Text>
              </div>
            ))}
          </>
        )
      )}
    </div>
  );
}
