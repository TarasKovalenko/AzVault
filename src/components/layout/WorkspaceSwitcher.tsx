import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  makeStyles,
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

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  triggerBtn: {
    padding: '2px 6px',
    fontSize: '11px',
  },
  tenantIcon: {
    fontSize: '14px',
  },
  tenantText: {
    maxWidth: '100px',
  },
  subText: {
    maxWidth: '120px',
  },
  vaultText: {
    maxWidth: '130px',
  },
  separator: {
    opacity: 0.3,
  },
  subItemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  vaultList: {
    maxHeight: '300px',
    overflowY: 'auto',
  },
  vaultItemMeta: {
    color: tokens.colorNeutralForeground3,
    fontSize: '10px',
  },
  chevron: {
    fontSize: '12px',
    marginLeft: '2px',
    opacity: 0.5,
  },
});

export function WorkspaceSwitcher() {
  const classes = useStyles();
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
    <div className={classes.root}>
      {/* Tenant picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<Building24Regular className={classes.tenantIcon} />}
            className={classes.triggerBtn}
          >
            <Text size={100} className={`azv-mono ${classes.tenantText}`} truncate wrap={false}>
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

      <Text size={100} className={classes.separator}>
        /
      </Text>

      {/* Subscription picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<CreditCardPerson24Regular className={classes.tenantIcon} />}
            className={classes.triggerBtn}
          >
            <Text size={100} className={`azv-mono ${classes.subText}`} truncate wrap={false}>
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
                <div className={classes.subItemRow}>
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

      <Text size={100} className={classes.separator}>
        /
      </Text>

      {/* Vault picker */}
      <Menu>
        <MenuTrigger>
          <Button
            appearance="subtle"
            size="small"
            icon={<ShieldLock24Regular className={classes.tenantIcon} />}
            iconPosition="before"
            className={classes.triggerBtn}
          >
            <Text size={100} className={`azv-mono ${classes.vaultText}`} truncate wrap={false}>
              {selectedVaultName || '—'}
            </Text>
            <ChevronDown20Regular className={classes.chevron} />
          </Button>
        </MenuTrigger>
        <MenuPopover>
          <MenuList className={classes.vaultList}>
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
                  <Text size={100} block className={classes.vaultItemMeta}>
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
