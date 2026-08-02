import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAppToast } from '../../lib/toast';
import { getAuditLog, listCertificates, listKeys, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { AttentionCard, type AttentionItem } from './dashboard/AttentionCard';
import { RecentActivityCard } from './dashboard/RecentActivityCard';
import { VaultCountCard } from './dashboard/VaultCountCard';
import { VaultPropertiesCard } from './dashboard/VaultPropertiesCard';

export function VaultDashboard() {
  const selectedVaultUri = useAppStore((state) => state.selectedVaultUri);
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const vaults = useAppStore((state) => state.keyvaults);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [copiedUri, setCopiedUri] = useState(false);
  const toast = useAppToast();
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
    queryKey: ['auditLog', selectedVaultName],
    queryFn: () => getAuditLog(5, selectedVaultName!),
    enabled: Boolean(selectedVaultName),
  });
  if (!selectedVaultName) return null;

  const attentionCandidates = [
    ...(secrets.data || []).map((item) => ({ ...item, type: 'Secret', tab: 'secrets' as const })),
    ...(keys.data || []).map((item) => ({ ...item, type: 'Key', tab: 'keys' as const })),
    ...(certificates.data || []).map((item) => ({
      ...item,
      type: 'Certificate',
      tab: 'certificates' as const,
    })),
  ]
    .map((item) => {
      const days = item.expires
        ? Math.ceil((new Date(item.expires).getTime() - Date.now()) / 86_400_000)
        : null;
      const reason = !item.enabled
        ? 'Disabled'
        : days !== null && days < 0
          ? 'Expired'
          : days !== null && days <= 30
            ? `${days}d left`
            : null;
      return { id: item.id, name: item.name, type: item.type, tab: item.tab, reason, days };
    })
    .filter((item) => Boolean(item.reason));
  const attention: AttentionItem[] = attentionCandidates
    .map((item) => ({ ...item, reason: item.reason! }))
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  const copyUri = () => {
    if (!selectedVaultUri) return;
    void navigator.clipboard.writeText(selectedVaultUri);
    setCopiedUri(true);
    toast.success('Vault URI copied');
    window.setTimeout(() => setCopiedUri(false), 2000);
  };
  const createSecret = () => {
    setActiveTab('secrets');
    requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('azv:new-secret')));
  };

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
            New Secret
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
              onCopy={copyUri}
            />
          </div>
          <div className="grid gap-4">
            <section className="mac-panel rounded-2xl p-4">
              <h2 className="text-[13px] font-semibold">Quick Actions</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="xs"
                  icon={<Icon name="activity" />}
                  onClick={() => setActiveTab('logs')}
                >
                  Open Activity
                </Button>
                <Button
                  size="xs"
                  icon={<Icon name={copiedUri ? 'check' : 'copy'} />}
                  onClick={copyUri}
                >
                  {copiedUri ? 'Copied' : 'Copy Vault URI'}
                </Button>
              </div>
            </section>
            <RecentActivityCard entries={activity.data || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
