import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Text,
  tokens,
} from '@fluentui/react-components';
import {
  Building24Regular,
  ChevronDown20Regular,
  CreditCardPerson24Regular,
  ShieldLock24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { listKeyvaults, listSubscriptions, listTenants, setTenant } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';

export function WorkspaceSwitcher() {
  const {
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    tenants,
    subscriptions,
    keyvaults,
    selectTenant,
    selectSubscription,
    selectVault,
    setTenants,
    setSubscriptions,
    setKeyvaults,
  } = useAppStore();

  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants });
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

  const currentTenant = tenants.find((t) => t.tenant_id === selectedTenantId);
  const currentSub = subscriptions.find((s) => s.subscriptionId === selectedSubscriptionId);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {/* Tenant picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<Building24Regular style={{ fontSize: 14 }} />}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            <Text size={100} className="azv-mono" truncate wrap={false} style={{ maxWidth: 100 }}>
              {currentTenant?.display_name ||
                (selectedTenantId ? selectedTenantId.slice(0, 8) : '—')}
            </Text>
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {tenants.map((t) => (
              <MenuItem
                key={t.tenant_id}
                onClick={() => {
                  selectTenant(t.tenant_id);
                  setTenant(t.tenant_id);
                }}
                style={{
                  fontWeight: t.tenant_id === selectedTenantId ? 600 : 400,
                }}
              >
                {t.display_name || t.tenant_id.slice(0, 8)}
              </MenuItem>
            ))}
            {tenants.length === 0 && <MenuItem disabled>No tenants found</MenuItem>}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Text size={100} style={{ opacity: 0.3 }}>
        /
      </Text>

      {/* Subscription picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<CreditCardPerson24Regular style={{ fontSize: 14 }} />}
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            <Text size={100} className="azv-mono" truncate wrap={false} style={{ maxWidth: 120 }}>
              {currentSub?.displayName || '—'}
            </Text>
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {subscriptions.map((s) => (
              <MenuItem
                key={s.subscriptionId}
                onClick={() => selectSubscription(s.subscriptionId)}
                style={{
                  fontWeight: s.subscriptionId === selectedSubscriptionId ? 600 : 400,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span
                    className="azv-status-dot"
                    style={{
                      background:
                        s.state === 'Enabled' ? 'var(--azv-success)' : 'var(--azv-warning)',
                    }}
                  />
                  {s.displayName}
                </div>
              </MenuItem>
            ))}
            {subscriptions.length === 0 && <MenuItem disabled>Select a tenant first</MenuItem>}
          </MenuList>
        </MenuPopover>
      </Menu>

      <Text size={100} style={{ opacity: 0.3 }}>
        /
      </Text>

      {/* Vault picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<ShieldLock24Regular style={{ fontSize: 14 }} />}
            iconPosition="before"
            style={{ padding: '2px 6px', fontSize: 11 }}
          >
            <Text size={100} className="azv-mono" truncate wrap={false} style={{ maxWidth: 130 }}>
              {selectedVaultName || '—'}
            </Text>
            <ChevronDown20Regular style={{ fontSize: 12, marginLeft: 2, opacity: 0.5 }} />
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList style={{ maxHeight: 300, overflowY: 'auto' }}>
            {keyvaults.map((v) => (
              <MenuItem
                key={v.id}
                onClick={() => selectVault(v.name, v.vaultUri)}
                style={{
                  fontWeight: v.name === selectedVaultName ? 600 : 400,
                }}
              >
                <div>
                  <Text size={200} className="azv-mono">
                    {v.name}
                  </Text>
                  <Text
                    size={100}
                    block
                    style={{ color: tokens.colorNeutralForeground3, fontSize: 10 }}
                  >
                    {v.location} · {v.resourceGroup}
                  </Text>
                </div>
              </MenuItem>
            ))}
            {keyvaults.length === 0 && <MenuItem disabled>Select a subscription first</MenuItem>}
          </MenuList>
        </MenuPopover>
      </Menu>
    </div>
  );
}
