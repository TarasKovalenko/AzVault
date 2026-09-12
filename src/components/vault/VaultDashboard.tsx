import { useQuery } from '@tanstack/react-query';
import { useToast } from '../ui/Toast';
import { getAuditLog, listCertificates, listKeys, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { AttentionCard } from './dashboard/AttentionCard';
import { RecentActivityCard } from './dashboard/RecentActivityCard';
import { VaultCountCard } from './dashboard/VaultCountCard';
import { VaultPropertiesCard } from './dashboard/VaultPropertiesCard';
import { collectAttentionItems } from './vaultAttention';

const RECENT_ACTIVITY_LIMIT = 5;

export function VaultDashboard() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const vaults = useAppStore((state) => state.keyvaults);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const requestSecretsAction = useAppStore((state) => state.requestSecretsAction);
  const toast = useToast();
  const currentVault = vaults.find((vault) => vault.vaultUri === selectedVaultUri);
  const secrets = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const keys = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const certificates = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
    enabled: Boolean(selectedVaultUri),
  });
  const activity = useQuery({
    queryKey: ['auditLog', selectedVaultName, RECENT_ACTIVITY_LIMIT],
    queryFn: () => getAuditLog(RECENT_ACTIVITY_LIMIT, selectedVaultName!),
    enabled: Boolean(selectedVaultName),
  });
  if (!selectedVaultName) return null;

  const attention = collectAttentionItems([
    { items: secrets.data ?? [], type: 'Secret', tab: 'secrets' },
    { items: keys.data ?? [], type: 'Key', tab: 'keys' },
    { items: certificates.data ?? [], type: 'Certificate', tab: 'certificates' },
  ]);
  const copyUri = async () => {
    if (!selectedVaultUri) return;
    try {
      await navigator.clipboard.writeText(selectedVaultUri);
      toast.success('Vault URI copied');
    } catch (error) {
      // Claiming a copy that did not happen sends the user to paste nothing.
      toast.error('Could not copy the vault URI', String(error));
    }
  };
  // Routed through the store: a window event would race SecretsList's mount,
  // switching the tab without opening the dialog.
  const createSecret = () => requestSecretsAction('new-secret');

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-6xl p-6 lg:p-8">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{selectedVaultName}</h1>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Vault overview and security posture
            </p>
          </div>
          <Button variant="primary" icon={<Icon name="add" />} onClick={createSecret}>
            New secret
          </Button>
        </header>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <VaultCountCard
            icon="lock"
            label="Secrets"
            count={secrets.data?.length}
            loading={secrets.isLoading}
            onClick={() => setActiveTab('secrets')}
          />
          <VaultCountCard
            icon="key"
            label="Keys"
            count={keys.data?.length}
            loading={keys.isLoading}
            onClick={() => setActiveTab('keys')}
          />
          <VaultCountCard
            icon="certificate"
            label="Certificates"
            count={certificates.data?.length}
            loading={certificates.isLoading}
            onClick={() => setActiveTab('certificates')}
          />
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,.8fr)]">
          <div className="grid gap-4">
            <AttentionCard items={attention} onOpen={(tab) => setActiveTab(tab)} />
            <VaultPropertiesCard
              vault={currentVault}
              vaultUri={selectedVaultUri}
              onCopy={() => void copyUri()}
            />
          </div>
          <div className="grid gap-4">
            <RecentActivityCard entries={activity.data || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
