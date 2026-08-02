import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { listKeyvaults, listSubscriptions, listTenants, setTenant } from '../../../services/tauri';
import { useAppStore } from '../../../stores/appStore';

export function useWorkspaceResources() {
  const selectedTenantId = useAppStore((state) => state.selectedTenantId);
  const selectedSubscriptionId = useAppStore((state) => state.selectedSubscriptionId);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const tenants = useAppStore((state) => state.tenants);
  const subscriptions = useAppStore((state) => state.subscriptions);
  const vaults = useAppStore((state) => state.keyvaults);
  const selectTenantInStore = useAppStore((state) => state.selectTenant);
  const selectSubscription = useAppStore((state) => state.selectSubscription);
  const selectVault = useAppStore((state) => state.selectVault);
  const setTenants = useAppStore((state) => state.setTenants);
  const setSubscriptions = useAppStore((state) => state.setSubscriptions);
  const setVaults = useAppStore((state) => state.setKeyvaults);

  const tenantsQuery = useQuery({ queryKey: ['tenants'], queryFn: listTenants });
  const subscriptionsQuery = useQuery({
    queryKey: ['subscriptions', selectedTenantId],
    queryFn: listSubscriptions,
    enabled: Boolean(selectedTenantId),
  });
  const vaultsQuery = useQuery({
    queryKey: ['keyvaults', selectedSubscriptionId],
    queryFn: () => listKeyvaults(selectedSubscriptionId!),
    enabled: Boolean(selectedSubscriptionId),
  });

  const selectTenant = useCallback(
    (tenantId: string) => {
      selectTenantInStore(tenantId);
      void setTenant(tenantId).catch(() => undefined);
    },
    [selectTenantInStore],
  );

  useEffect(() => {
    if (tenantsQuery.data) setTenants(tenantsQuery.data);
  }, [tenantsQuery.data, setTenants]);

  useEffect(() => {
    if (subscriptionsQuery.data) setSubscriptions(subscriptionsQuery.data);
  }, [subscriptionsQuery.data, setSubscriptions]);

  useEffect(() => {
    if (vaultsQuery.data) setVaults(vaultsQuery.data);
  }, [vaultsQuery.data, setVaults]);

  useEffect(() => {
    const firstTenant = tenantsQuery.data?.[0];
    if (firstTenant && !selectedTenantId) selectTenant(firstTenant.tenant_id);
  }, [tenantsQuery.data, selectedTenantId, selectTenant]);

  return {
    tenants,
    subscriptions,
    vaults,
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    isLoadingTenants: tenantsQuery.isLoading,
    isLoadingSubscriptions: subscriptionsQuery.isLoading,
    isLoadingVaults: vaultsQuery.isLoading,
    selectTenant,
    selectSubscription,
    selectVault,
  };
}
