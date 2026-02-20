/**
 * ContentTabs.tsx – Tab navigation for vault item types.
 *
 * Renders the tab bar (Secrets, Keys, Certificates, Access, Logs)
 * when a vault is selected. Shows an empty-state prompt otherwise.
 */

import { Tab, TabList, Text, tokens } from '@fluentui/react-components';
import {
  Certificate24Regular,
  DocumentText24Regular,
  Key24Regular,
  LockClosed24Regular,
  ShieldLock24Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';

export function ContentTabs() {
  const { activeTab, setActiveTab, selectedVaultName } = useAppStore();

  // Empty state – no vault selected
  if (!selectedVaultName) {
    return (
      <div className="azv-empty" style={{ height: '100%' }}>
        <LockClosed24Regular style={{ fontSize: 40 }} />
        <Text block size={300}>
          Select a Key Vault from the sidebar
        </Text>
        <Text
          block
          size={200}
          className="azv-mono"
          style={{ color: tokens.colorNeutralForeground3 }}
        >
          Browse secrets, keys, and certificates
        </Text>
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
        style={{ padding: '0 8px', gap: 6 }}
      >
        <Tab value="secrets" icon={<Key24Regular />}>
          Secrets <span className="azv-tab-hint">/secrets</span>
        </Tab>
        <Tab value="keys" icon={<LockClosed24Regular />}>
          Keys <span className="azv-tab-hint">/keys</span>
        </Tab>
        <Tab value="certificates" icon={<Certificate24Regular />}>
          Certs <span className="azv-tab-hint">/certificates</span>
        </Tab>
        <Tab value="access" icon={<ShieldLock24Regular />}>
          Access <span className="azv-tab-hint">rbac</span>
        </Tab>
        <Tab value="logs" icon={<DocumentText24Regular />}>
          Logs <span className="azv-tab-hint">audit</span>
        </Tab>
      </TabList>
    </div>
  );
}
