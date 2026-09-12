import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../ui/Toast';
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

  const toast = useToast();
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

  const [switchingTenant, setSwitchingTenant] = useState(false);

  /**
   * Switches the CLI tenant before the UI moves.
   *
   * Committing to the store first would let the subscription query run against
   * the tenant the CLI is still pointed at — the user would browse one tenant's
   * vaults under another tenant's name, and a failed switch was previously
   * swallowed entirely.
   */
  const selectTenant = useCallback(
    async (tenantId: string) => {
      setSwitchingTenant(true);
      try {
        await setTenant(tenantId);
        selectTenantInStore(tenantId);
      } catch (error) {
        toast.error('Could not switch tenant', String(error));
      } finally {
        setSwitchingTenant(false);
      }
    },
    [selectTenantInStore, toast],
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
    if (firstTenant && !selectedTenantId) void selectTenant(firstTenant.tenant_id);
  }, [tenantsQuery.data, selectedTenantId, selectTenant]);

  return {
    tenants,
    subscriptions,
    vaults,
    selectedTenantId,
    selectedSubscriptionId,
    selectedVaultName,
    isLoadingTenants: tenantsQuery.isLoading || switchingTenant,
    isLoadingSubscriptions: subscriptionsQuery.isLoading,
    isLoadingVaults: vaultsQuery.isLoading,
    selectTenant,
    selectSubscription,
    selectVault,
  };
}
