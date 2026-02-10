/**
 * AccessView.tsx – Vault access & permission guidance panel.
 *
 * Shows vault metadata (URI, resource group, location, soft-delete status)
 * and provides RBAC / access-policy guidance for troubleshooting 403 errors.
 */

import { useMemo } from 'react';
import { Card, Text, Badge, Divider, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

/** Static permission guidance tips. */
const ACCESS_HINTS = [
  'Use Azure RBAC role assignments (recommended) at vault or resource group scope.',
  'For classic access policies, ensure get/list/set/delete permissions are explicitly granted.',
  '403 errors usually mean a missing Key Vault Data Plane role or access policy.',
  'Purge actions require elevated permissions and soft-delete / purge protection awareness.',
] as const;

export function AccessView() {
  const { selectedVaultUri, keyvaults, selectedVaultName } = useAppStore();

  const currentVault = useMemo(
    () => keyvaults.find((v) => v.vaultUri === selectedVaultUri),
    [keyvaults, selectedVaultUri],
  );

  if (!selectedVaultName) return null;

  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
      <Card>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="semibold" size={400}>
            Vault Access
          </Text>
          <Badge appearance="outline" color="informative" size="small">
            Read Only
          </Badge>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* Vault metadata grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <MetadataCell label="Vault Name" value={selectedVaultName} mono />
          <MetadataCell label="Vault URI" value={selectedVaultUri || '—'} mono />
          <MetadataCell label="Resource Group" value={currentVault?.resourceGroup || '—'} />
          <MetadataCell label="Location" value={currentVault?.location || '—'} />
          <div>
            <Text size={200} className="azv-title" block>
              Soft Delete
            </Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span
                className="azv-status-dot"
                style={{
                  background: currentVault?.softDeleteEnabled
                    ? 'var(--azv-success)'
                    : '#e8a317',
                }}
              />
              <Text size={200}>
                {currentVault?.softDeleteEnabled ? 'Enabled' : 'Unknown / Disabled'}
              </Text>
            </div>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        {/* Permission guidance */}
        <Text weight="semibold" size={300}>
          Permission Guidance
        </Text>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {ACCESS_HINTS.map((hint) => (
            <Text key={hint} size={200} style={{ lineHeight: 1.5 }}>
              {hint}
            </Text>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** Small helper cell for the metadata grid. */
function MetadataCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Text size={200} className="azv-title" block>
        {label}
      </Text>
      <Text
        size={200}
        className={mono ? 'azv-mono' : undefined}
        style={{ marginTop: 2, wordBreak: 'break-all' }}
      >
        {value}
      </Text>
    </div>
  );
}
