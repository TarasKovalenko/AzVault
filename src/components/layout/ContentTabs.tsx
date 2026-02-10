import { TabList, Tab, tokens, Text } from '@fluentui/react-components';
import {
  Key24Regular,
  LockClosed24Regular,
  Certificate24Regular,
  DocumentText24Regular,
  ShieldKeyhole24Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';

export function ContentTabs() {
  const { activeTab, setActiveTab, selectedVaultName } = useAppStore();

  if (!selectedVaultName) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          color: tokens.colorNeutralForeground3,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <LockClosed24Regular style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }} />
          <Text block size={400}>
            Select a Key Vault from the sidebar to get started
          </Text>
          <Text block size={200} style={{ marginTop: 8, color: tokens.colorNeutralForeground3 }}>
            Choose a subscription and vault to browse secrets, keys, and certificates
          </Text>
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderBottom: `1px solid ${tokens.colorNeutralStroke1}` }}>
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as ItemTab)}
        size="small"
        style={{ padding: '0 16px' }}
      >
        <Tab value="secrets" icon={<Key24Regular />}>
          Secrets
        </Tab>
        <Tab value="keys" icon={<LockClosed24Regular />}>
          Keys
        </Tab>
        <Tab value="certificates" icon={<Certificate24Regular />}>
          Certificates
        </Tab>
        <Tab value="access" icon={<ShieldKeyhole24Regular />}>
          Access
        </Tab>
        <Tab value="logs" icon={<DocumentText24Regular />}>
          Activity Log
        </Tab>
      </TabList>
    </div>
  );
}
