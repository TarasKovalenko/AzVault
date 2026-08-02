import type { KeyVaultInfo } from '../../../types';
import { WorkspaceSelect } from './WorkspaceSelect';

export function VaultPicker({
  vaults,
  selectedVaultName,
  isLoading,
  hasSubscription,
  onSelect,
}: {
  vaults: KeyVaultInfo[];
  selectedVaultName: string | null;
  isLoading: boolean;
  hasSubscription: boolean;
  onSelect: (name: string, uri: string) => void;
}) {
  return (
    <>
      <span className="text-[var(--text-tertiary)]">/</span>
      <WorkspaceSelect
        icon="shield"
        isLoading={isLoading}
        aria-label="Key Vault"
        title={`Vault: ${selectedVaultName || 'none selected'}`}
        value={selectedVaultName || ''}
        onChange={(event) => {
          const vault = vaults.find((candidate) => candidate.name === event.target.value);
          if (vault) onSelect(vault.name, vault.vaultUri);
        }}
        disabled={!hasSubscription || vaults.length === 0}
        className="max-w-52"
      >
        {!selectedVaultName && <option value="">Key Vault</option>}
        {vaults.map((vault) => (
          <option key={vault.id} value={vault.name}>
            {vault.name} · {vault.location}
          </option>
        ))}
        {vaults.length === 0 && (
          <option disabled>
            {hasSubscription ? 'No Key Vaults found' : 'Select a subscription first'}
          </option>
        )}
      </WorkspaceSelect>
    </>
  );
}
