import { CertificatesList } from '../certificates/CertificatesList';
import { EmptyState } from '../common/EmptyState';
import { KeysList } from '../keys/KeysList';
import { AuditLog } from '../logs/AuditLog';
import { SecretsList } from '../secrets/SecretsList';
import { useAppStore } from '../../stores/appStore';
import { VaultDashboard } from '../vault/VaultDashboard';
import { Icon } from '../ui/Icon';

export function MainContent() {
  const activeTab = useAppStore((state) => state.activeTab);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);

  if (!selectedVaultName) {
    return (
      <EmptyState
        icon={<Icon name="lock" />}
        title="Select a Key Vault"
        description="Use the workspace switcher in the top bar — pick a tenant, then a subscription, then a vault — to browse its secrets, keys, and certificates. Press ⌘K / Ctrl+K to search anything."
      />
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {activeTab === 'dashboard' && <VaultDashboard />}
      {activeTab === 'secrets' && <SecretsList />}
      {activeTab === 'keys' && <KeysList />}
      {activeTab === 'certificates' && <CertificatesList />}
      {activeTab === 'logs' && <AuditLog />}
    </main>
  );
}
