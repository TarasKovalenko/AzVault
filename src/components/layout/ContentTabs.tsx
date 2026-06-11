import { Badge, makeStyles, Tab, TabList, tokens } from '@fluentui/react-components';
import {
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Key24Regular,
  LockClosed24Regular,
  TextBulletListSquare24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { listCertificates, listKeys, listSecrets } from '../../services/tauri';
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
  count: {
    marginLeft: '6px',
  },
});

export function ContentTabs() {
  const { activeTab, setActiveTab, selectedVaultName, selectedVaultUri } = useAppStore();
  const classes = useStyles();

  const secretsQuery = useQuery({
    queryKey: ['secrets', selectedVaultUri],
    queryFn: () => listSecrets(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });
  const keysQuery = useQuery({
    queryKey: ['keys', selectedVaultUri],
    queryFn: () => listKeys(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });
  const certsQuery = useQuery({
    queryKey: ['certificates', selectedVaultUri],
    queryFn: () => listCertificates(selectedVaultUri!),
    enabled: !!selectedVaultUri,
  });

  if (!selectedVaultName) return null;

  const renderCount = (n: number | undefined) =>
    n === undefined ? null : (
      <Badge size="small" appearance="outline" className={classes.count}>
        {n}
      </Badge>
    );

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
        <Tab value="secrets" icon={<LockClosed24Regular />}>
          Secrets
          {renderCount(secretsQuery.data?.length)}
        </Tab>
        <Tab value="keys" icon={<Key24Regular />}>
          Keys
          {renderCount(keysQuery.data?.length)}
        </Tab>
        <Tab value="certificates" icon={<Certificate24Regular />}>
          Certs
          {renderCount(certsQuery.data?.length)}
        </Tab>
        <Tab value="logs" icon={<ClipboardTextLtr24Regular />}>
          Audit Log
        </Tab>
      </TabList>
    </div>
  );
}
