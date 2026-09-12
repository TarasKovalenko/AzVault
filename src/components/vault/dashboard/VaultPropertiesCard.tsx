import type { KeyVaultInfo } from '../../../types';
import { Icon } from '../../ui/Icon';

function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd className="mt-1 text-xs">{children}</dd>
    </div>
  );
}

export function VaultPropertiesCard({
  vault,
  vaultUri,
  onCopy,
}: {
  vault?: KeyVaultInfo;
  vaultUri: string | null;
  onCopy: () => void;
}) {
  const softDelete = vault?.softDeleteEnabled ?? null;
  return (
    <section className="mac-panel rounded-2xl p-4">
      <h2 className="mb-4 text-[13px] font-semibold">Vault properties</h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Property label="Soft delete">
          {/* Off and unknown are different situations: one is a risk, the other
              is missing information. */}
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`size-1.5 rounded-full ${
                softDelete === true
                  ? 'bg-[var(--success)]'
                  : softDelete === false
                    ? 'bg-[var(--warning)]'
                    : 'bg-[var(--text-tertiary)]'
              }`}
            />
            {softDelete === true ? 'Enabled' : softDelete === false ? 'Disabled' : 'Unknown'}
          </span>
        </Property>
        <Property label="Location">{vault?.location || '—'}</Property>
        <Property label="Resource group">
          <span className="mono">{vault?.resourceGroup || '—'}</span>
        </Property>
        <Property label="Vault URI">
          <span className="flex items-start gap-1.5">
            <span className="mono min-w-0 break-all text-[10px]">{vaultUri}</span>
            <button
              type="button"
              title="Copy vault URI"
              aria-label="Copy vault URI"
              onClick={onCopy}
              className="grid size-6 shrink-0 place-items-center rounded-md hover:bg-[var(--surface-hover)]"
            >
              <Icon name="copy" size={12} />
            </button>
          </span>
        </Property>
      </dl>
      {softDelete === false && (
        <div className="mt-4 rounded-xl bg-orange-500/10 p-2.5 text-xs text-[var(--warning)]">
          Soft delete is off. Deleted items are removed immediately and cannot be recovered.
        </div>
      )}
      {softDelete === null && (
        <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-2.5 text-xs text-[var(--text-secondary)]">
          The soft-delete setting could not be read for this vault, so recovery of deleted items is
          not guaranteed.
        </div>
      )}
    </section>
  );
}
