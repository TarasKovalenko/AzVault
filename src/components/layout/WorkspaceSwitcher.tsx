import { SubscriptionPicker } from './workspace-switcher/SubscriptionPicker';
import { TenantPicker } from './workspace-switcher/TenantPicker';
import { VaultPicker } from './workspace-switcher/VaultPicker';
import { useWorkspaceResources } from './workspace-switcher/useWorkspaceResources';

export function WorkspaceSwitcher() {
  const workspace = useWorkspaceResources();

  return (
    <div className="flex min-w-0 items-center gap-1">
      <TenantPicker
        tenants={workspace.tenants}
        selectedTenantId={workspace.selectedTenantId}
        isLoading={workspace.isLoadingTenants}
        onSelect={workspace.selectTenant}
      />
      <SubscriptionPicker
        subscriptions={workspace.subscriptions}
        selectedSubscriptionId={workspace.selectedSubscriptionId}
        isLoading={workspace.isLoadingSubscriptions}
        onSelect={workspace.selectSubscription}
      />
      <VaultPicker
        vaults={workspace.vaults}
        selectedVaultName={workspace.selectedVaultName}
        isLoading={workspace.isLoadingVaults}
        hasSubscription={Boolean(workspace.selectedSubscriptionId)}
        onSelect={workspace.selectVault}
      />
    </div>
  );
}
