import { makeStyles, Tab, TabList, tokens } from '@fluentui/react-components';
import {
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Key24Regular,
  LockClosed24Regular,
  TextBulletListSquare24Regular,
} from '@fluentui/react-icons';
import { useAppStore } from '../../stores/appStore';
import type { ItemTab } from '../../types';

const useStyles = makeStyles({
  root: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    padding: '2px 6px',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  tabList: {
    padding: '0 8px',
    gap: '6px',
  },
});

export function ContentTabs() {
  const { activeTab, setActiveTab, selectedVaultName } = useAppStore();
  const classes = useStyles();

  if (!selectedVaultName) return null;

  return (
    <div className={classes.root}>
      <TabList
        selectedValue={activeTab}
        onTabSelect={(_, d) => setActiveTab(d.value as ItemTab)}
        size="small"
        className={classes.tabList}
      >
        <Tab value="dashboard" icon={<TextBulletListSquare24Regular />}>
          Dashboard
        </Tab>
        <Tab value="secrets" icon={<Key24Regular />}>
          Secrets
        </Tab>
        <Tab value="keys" icon={<LockClosed24Regular />}>
          Keys
        </Tab>
        <Tab value="certificates" icon={<Certificate24Regular />}>
          Certs
        </Tab>
        <Tab value="logs" icon={<ClipboardTextLtr24Regular />}>
          Audit Log
        </Tab>
      </TabList>
    </div>
  );
}
