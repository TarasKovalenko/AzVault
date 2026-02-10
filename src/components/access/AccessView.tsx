import { useMemo } from 'react';
import { Card, Text, Badge, Divider, tokens } from '@fluentui/react-components';
import { useAppStore } from '../../stores/appStore';

function mapAccessHints(): string[] {
  return [
    'Use Azure RBAC role assignments (recommended) at vault or resource group scope.',
    'For classic access policies, ensure get/list/set/delete permissions are explicitly granted.',
    '403 errors usually mean missing Key Vault Data Plane role or access policy permissions.',
    'Purge actions require elevated permissions and soft-delete/purge protection awareness.',
  ];
}

export function AccessView() {
  const { selectedVaultUri, keyvaults, selectedVaultName } = useAppStore();

  const currentVault = useMemo(
    () => keyvaults.find((v) => v.vaultUri === selectedVaultUri),
    [keyvaults, selectedVaultUri]
  );

  if (!selectedVaultName) {
    return null;
  }

  return (
    <div style={{ padding: 16, overflow: 'auto' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text weight="semibold" size={400}>Vault Access Overview</Text>
          <Badge appearance="outline" color="informative">Read Only</Badge>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Vault Name</Text>
            <Text>{selectedVaultName}</Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Vault URI</Text>
            <Text font="monospace">{selectedVaultUri || '-'}</Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Resource Group</Text>
            <Text>{currentVault?.resourceGroup || '-'}</Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Location</Text>
            <Text>{currentVault?.location || '-'}</Text>
          </div>
          <div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Soft Delete</Text>
            <Badge appearance="filled" color={currentVault?.softDeleteEnabled ? 'success' : 'warning'}>
              {currentVault?.softDeleteEnabled ? 'Enabled' : 'Unknown/Disabled'}
            </Badge>
          </div>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <Text weight="semibold" size={300}>Permission Guidance</Text>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {mapAccessHints().map((hint) => (
            <Text key={hint} size={200}>{hint}</Text>
          ))}
        </div>
      </Card>
    </div>
  );
}
