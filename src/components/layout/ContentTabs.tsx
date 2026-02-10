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
    <div
      className="azv-pane"
      style={{
        borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
        margin: 0,
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderTop: 'none',
        padding: '2px 6px',
        background: tokens.colorNeutralBackground2,
      }}
    >
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as ItemTab)}
        size="small"
        style={{ padding: '0 8px', gap: 8 }}
      >
        <Tab value="secrets" icon={<Key24Regular />}>
          Secrets <span className="azv-tab-hint">/kv/secrets</span>
        </Tab>
        <Tab value="keys" icon={<LockClosed24Regular />}>
          Keys <span className="azv-tab-hint">/kv/keys</span>
        </Tab>
        <Tab value="certificates" icon={<Certificate24Regular />}>
          Certificates <span className="azv-tab-hint">/kv/certs</span>
        </Tab>
        <Tab value="access" icon={<ShieldKeyhole24Regular />}>
          Access <span className="azv-tab-hint">rbac</span>
        </Tab>
        <Tab value="logs" icon={<DocumentText24Regular />}>
          Logs <span className="azv-tab-hint">audit</span>
        </Tab>
      </TabList>
    </div>
  );
}
