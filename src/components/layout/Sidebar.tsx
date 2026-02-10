/**
 * Sidebar.tsx – Left navigation panel.
 *
 * Hierarchical selection flow: Tenant -> Subscription -> Key Vault.
 * Each section is collapsible and resizable. A "recent vaults" section
 * provides quick access to previously opened vaults.
 */

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
  ShieldLock24Regular,
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

/** Section identifiers used for collapse/resize state. */
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
    tenant: 130,
    subscription: 140,
    vaults: 260,
    recent: 110,
  });

  // ── Data queries ──

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

  // Sync query results into the Zustand store for cross-component access
  useEffect(() => {
    if (tenantsQuery.data) setTenants(tenantsQuery.data);
  }, [tenantsQuery.data, setTenants]);

  useEffect(() => {
    if (subsQuery.data) setSubscriptions(subsQuery.data);
  }, [subsQuery.data, setSubscriptions]);

  useEffect(() => {
    if (vaultsQuery.data) setKeyvaults(vaultsQuery.data);
  }, [vaultsQuery.data, setKeyvaults]);

  // Auto-select the first tenant when data arrives and nothing is selected
  useEffect(() => {
    if (tenantsQuery.data?.length && !selectedTenantId) {
      const first = tenantsQuery.data[0];
      selectTenant(first.tenant_id);
      setTenant(first.tenant_id);
    }
  }, [tenantsQuery.data, selectedTenantId, selectTenant]);

  // ── Derived state ──

  const filteredVaults = (vaultsQuery.data || []).filter((v) =>
    v.name.toLowerCase().includes(vaultFilter.toLowerCase()),
  );

  // ── Section helpers ──

  const toggleSection = (key: SectionKey) => {
    setCollapsed((s) => ({ ...s, [key]: !s[key] }));
  };

  /** Renders a collapsible section header with optional right-side content. */
  const renderSectionHeader = (key: SectionKey, title: string, right?: ReactNode) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '5px 12px 3px',
      }}
    >
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

  /** Renders the collapsible body with resize-on-drag support. */
  const renderSectionBody = (key: SectionKey, children: ReactNode) => {
    if (collapsed[key]) return null;
    return (
      <div
        style={{
          height: sectionHeights[key],
          minHeight: 60,
          resize: 'vertical',
          overflow: 'auto',
          padding: '0 12px 6px',
        }}
        onMouseUp={(e) => {
          const el = e.currentTarget;
          const h = Math.round(el.getBoundingClientRect().height);
          setSectionHeights((s) => ({ ...s, [key]: Math.max(60, h) }));
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
        width: 280,
        minWidth: 280,
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
      {/* Workspace context summary */}
      <div style={{ padding: '8px 12px 6px' }}>
        <div
          style={{
            padding: '6px 8px',
            borderRadius: 4,
            border: `1px solid ${tokens.colorNeutralStroke1}`,
            background: tokens.colorNeutralBackground1,
          }}
        >
          <Text size={100} className="azv-title" style={{ color: tokens.colorNeutralForeground3 }}>
            Context
          </Text>
          <Text size={100} className="azv-mono" block style={{ marginTop: 2 }}>
            vault: {selectedVaultName || '—'}
          </Text>
          <Text size={100} className="azv-mono" block>
            sub: {selectedSubscriptionId ? selectedSubscriptionId.slice(0, 12) + '…' : '—'}
          </Text>
        </div>
      </div>

      {/* ── Tenants section ── */}
      <Divider />
      {renderSectionHeader(
        'tenant',
        'Tenants',
        <Badge size="small" appearance="outline">
          {(tenantsQuery.data || []).length}
        </Badge>,
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
                className="azv-list-item"
                style={{
                  padding: '5px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    selectedTenantId === t.tenant_id
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 3,
                }}
              >
                <Building24Regular style={{ fontSize: 14, flexShrink: 0, opacity: 0.7 }} />
                <Text size={200} truncate wrap={false}>
                  {t.display_name || t.tenant_id.slice(0, 8)}
                </Text>
              </div>
            ))}
          </div>
        ),
      )}

      {/* ── Subscriptions section ── */}
      <Divider />
      {renderSectionHeader(
        'subscription',
        'Subscriptions',
        <Badge size="small" appearance="outline">
          {(subsQuery.data || []).length}
        </Badge>,
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
                className="azv-list-item"
                style={{
                  padding: '5px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background:
                    selectedSubscriptionId === s.subscriptionId
                      ? tokens.colorBrandBackground2
                      : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 3,
                }}
              >
                <CreditCardPerson24Regular style={{ fontSize: 14, flexShrink: 0, opacity: 0.7 }} />
                <Text size={200} truncate wrap={false} style={{ flex: 1 }}>
                  {s.displayName}
                </Text>
                <span
                  className="azv-status-dot"
                  style={{
                    background: s.state === 'Enabled' ? 'var(--azv-success)' : '#e8a317',
                  }}
                  title={s.state}
                />
              </div>
            ))}
          </div>
        ),
      )}

      {/* ── Vaults section ── */}
      <Divider />
      {renderSectionHeader(
        'vaults',
        'Key Vaults',
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Badge size="small" appearance="outline">
            {filteredVaults.length}
          </Badge>
          <Button
            icon={<ArrowSync24Regular />}
            appearance="subtle"
            size="small"
            onClick={() => vaultsQuery.refetch()}
            title="Refresh vaults"
          />
        </div>,
      )}
      {renderSectionBody(
        'vaults',
        <>
          <Input
            placeholder="Filter…"
            contentBefore={<Search24Regular style={{ fontSize: 14 }} />}
            size="small"
            value={vaultFilter}
            onChange={(_, d) => setVaultFilter(d.value)}
            style={{ margin: '3px 0 6px', fontSize: 12 }}
          />

          {vaultsQuery.isLoading ? (
            <Spinner size="tiny" />
          ) : (
            <Tree aria-label="Key Vaults">
              {filteredVaults.map((v) => (
                <TreeItem key={v.id} itemType="leaf">
                  <TreeItemLayout
                    onClick={() => selectVault(v.name, v.vaultUri)}
                    className="azv-list-item"
                    style={{
                      background:
                        selectedVaultUri === v.vaultUri
                          ? tokens.colorBrandBackground2
                          : undefined,
                      borderRadius: 4,
                      border: `1px solid ${
                        selectedVaultUri === v.vaultUri
                          ? tokens.colorBrandStroke1
                          : 'transparent'
                      }`,
                    }}
                    iconBefore={
                      <ShieldLock24Regular
                        style={{
                          fontSize: 14,
                          color:
                            selectedVaultUri === v.vaultUri
                              ? tokens.colorBrandForeground1
                              : undefined,
                          opacity: selectedVaultUri === v.vaultUri ? 1 : 0.6,
                        }}
                      />
                    }
                  >
                    <div>
                      <Text
                        size={200}
                        weight={selectedVaultUri === v.vaultUri ? 'semibold' : 'regular'}
                      >
                        {v.name}
                      </Text>
                      <Text
                        size={100}
                        className="azv-mono"
                        style={{
                          display: 'block',
                          color: tokens.colorNeutralForeground3,
                          fontSize: 10,
                        }}
                      >
                        {v.location} · {v.resourceGroup}
                      </Text>
                    </div>
                  </TreeItemLayout>
                </TreeItem>
              ))}
            </Tree>
          )}
        </>,
      )}

      {/* ── Recent vaults section ── */}
      <Divider />
      {renderSectionHeader(
        'recent',
        'Recent',
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Badge size="small" appearance="outline">
            {recentVaults.length}
          </Badge>
          <Button
            icon={<Delete24Regular />}
            appearance="subtle"
            size="small"
            onClick={clearRecentVaults}
            title="Clear recent vaults"
            disabled={recentVaults.length === 0}
          />
        </div>,
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
                className="azv-list-item"
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 3,
                }}
              >
                <Star24Filled style={{ fontSize: 11, color: tokens.colorPaletteYellowForeground1 }} />
                <Text size={200} truncate wrap={false} className="azv-mono">
                  {v.name}
                </Text>
              </div>
            ))}
          </>
        ),
      )}
    </div>
  );
}
