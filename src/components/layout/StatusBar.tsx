import { useAppStore } from '../../stores/appStore';

export function StatusBar() {
  const userName = useAppStore((state) => state.userName);
  const selectedTenantId = useAppStore((state) => state.selectedTenantId);
  const selectedSubscriptionId = useAppStore((state) => state.selectedSubscriptionId);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const tenants = useAppStore((state) => state.tenants);
  const subscriptions = useAppStore((state) => state.subscriptions);
  const currentTenant = tenants.find((tenant) => tenant.tenant_id === selectedTenantId);
  const currentSubscription = subscriptions.find(
    (subscription) => subscription.subscriptionId === selectedSubscriptionId,
  );

  return (
    <footer className="mac-vibrancy mono flex h-6 shrink-0 items-center justify-between border-t border-[var(--stroke)] px-3 text-[10px] text-[var(--text-tertiary)]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex items-center gap-1.5">
          <span
            className={`size-1.5 rounded-full ${userName ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'}`}
          />
          {userName || 'not signed in'}
        </span>
        <span className="opacity-40">•</span>
        <span className="truncate">
          {currentTenant?.display_name || selectedTenantId?.slice(0, 8) || 'No tenant'}
        </span>
        <span className="opacity-40">/</span>
        <span className="truncate">{currentSubscription?.displayName || 'No subscription'}</span>
      </div>
      <span className="ml-4 shrink-0">{selectedVaultName || 'No vault selected'}</span>
    </footer>
  );
}
