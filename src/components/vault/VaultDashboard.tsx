import { Badge, Button, Card, makeStyles, Text, tokens } from '@fluentui/react-components';
import {
  Add24Regular,
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Copy24Regular,
  Key24Regular,
  LockClosed24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { getAuditLog, listCertificates, listKeys, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';

const useStyles = makeStyles({
  root: {
    padding: '20px',
    overflow: 'auto',
    height: '100%',
  },
  title: {
    marginBottom: '16px',
  },
  countGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
    marginBottom: '20px',
  },
  card: {
    padding: '16px',
    marginBottom: '16px',
  },
  cardTitle: {
    marginBottom: '12px',
  },
  cardTitleSmall: {
    marginBottom: '10px',
  },
  propsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px',
  },
  propRowValue: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  vaultUriRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  vaultUriText: {
    wordBreak: 'break-all',
    fontSize: '11px',
  },
  copyBtn: {
    flexShrink: 0,
  },
  softDeleteWarning: {
    marginTop: '12px',
    padding: '8px 12px',
    borderRadius: '4px',
    background: tokens.colorPaletteYellowBackground1,
    fontSize: '12px',
  },
  softDeleteWarningText: {
    color: tokens.colorPaletteYellowForeground1,
  },
  quickActions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  noActivityText: {
    color: tokens.colorNeutralForeground3,
  },
  activityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  activityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '3px 0',
  },
  activityTime: {
    opacity: 0.6,
    width: '80px',
    flexShrink: 0,
  },
  activityDot: {
    marginLeft: 'auto',
  },
});

const useCountCardStyles = makeStyles({
  card: {
    padding: '16px',
    cursor: 'pointer',
    textAlign: 'center',
  },
  inner: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  icon: {
    fontSize: '24px',
    opacity: 0.6,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    opacity: 0.7,
  },
});

const usePropRowStyles = makeStyles({
  value: {
    marginTop: '2px',
  },
});

export function VaultDashboard() {
  const classes = useStyles();
  const { selectedVaultUri, selectedVaultName, keyvaults, setActiveTab } = useAppStore();
  const [copiedUri, setCopiedUri] = useState(false);

  const currentVault = keyvaults.find((v) => v.vaultUri === selectedVaultUri);

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
  const auditQuery = useQuery({
    queryKey: ['auditLog'],
    queryFn: () => getAuditLog(5),
  });

  const handleCopyUri = () => {
    if (selectedVaultUri) {
      navigator.clipboard.writeText(selectedVaultUri);
      setCopiedUri(true);
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  if (!selectedVaultName) return null;

  return (
    <div className={classes.root}>
      <Text weight="semibold" size={500} block className={classes.title}>
        {selectedVaultName}
      </Text>

      {/* Count cards */}
      <div className={classes.countGrid}>
        <CountCard
          icon={<Key24Regular />}
          label="Secrets"
          count={secretsQuery.data?.length}
          loading={secretsQuery.isLoading}
          onClick={() => setActiveTab('secrets')}
        />
        <CountCard
          icon={<LockClosed24Regular />}
          label="Keys"
          count={keysQuery.data?.length}
          loading={keysQuery.isLoading}
          onClick={() => setActiveTab('keys')}
        />
        <CountCard
          icon={<Certificate24Regular />}
          label="Certificates"
          count={certsQuery.data?.length}
          loading={certsQuery.isLoading}
          onClick={() => setActiveTab('certificates')}
        />
      </div>

      {/* Vault properties */}
      <Card className={classes.card}>
        <Text weight="semibold" size={300} block className={classes.cardTitle}>
          Vault Properties
        </Text>
        <div className={classes.propsGrid}>
          <PropRow
            label="Soft-Delete"
            value={
              <div className={classes.propRowValue}>
                <span
                  className="azv-status-dot"
                  style={{
                    background: currentVault?.softDeleteEnabled
                      ? 'var(--azv-success)'
                      : 'var(--azv-warning)',
                  }}
                />
                <Text size={200}>
                  {currentVault?.softDeleteEnabled ? 'Enabled' : 'Unknown / Disabled'}
                </Text>
              </div>
            }
          />
          <PropRow
            label="Location"
            value={<Text size={200}>{currentVault?.location || '—'}</Text>}
          />
          <PropRow
            label="Resource Group"
            value={
              <Text size={200} className="azv-mono">
                {currentVault?.resourceGroup || '—'}
              </Text>
            }
          />
          <PropRow
            label="Vault URI"
            value={
              <div className={classes.vaultUriRow}>
                <Text size={200} className={`azv-mono ${classes.vaultUriText}`}>
                  {selectedVaultUri}
                </Text>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Copy24Regular />}
                  onClick={handleCopyUri}
                  title="Copy Vault URI"
                  className={classes.copyBtn}
                />
              </div>
            }
          />
        </div>

        {currentVault?.softDeleteEnabled === false && (
          <div className={classes.softDeleteWarning}>
            <Text size={200} className={classes.softDeleteWarningText}>
              Purge protection is not confirmed. Deleted items may be permanently removed.
            </Text>
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <Card className={classes.card}>
        <Text weight="semibold" size={300} block className={classes.cardTitleSmall}>
          Quick Actions
        </Text>
        <div className={classes.quickActions}>
          <Button
            appearance="primary"
            size="small"
            icon={<Add24Regular />}
            onClick={() => {
              setActiveTab('secrets');
              requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('azv:new-secret')));
            }}
          >
            New Secret
          </Button>
          <Button
            appearance="secondary"
            size="small"
            icon={<ClipboardTextLtr24Regular />}
            onClick={() => setActiveTab('logs')}
          >
            Open Audit Log
          </Button>
          <Button
            appearance="secondary"
            size="small"
            icon={<Copy24Regular />}
            onClick={handleCopyUri}
          >
            {copiedUri ? 'Copied!' : 'Copy Vault URI'}
          </Button>
        </div>
      </Card>

      {/* Recent activity */}
      <Card className={classes.card}>
        <Text weight="semibold" size={300} block className={classes.cardTitleSmall}>
          Recent Activity
        </Text>
        {(auditQuery.data || []).length === 0 ? (
          <Text size={200} className={classes.noActivityText}>
            No activity recorded yet.
          </Text>
        ) : (
          <div className={classes.activityList}>
            {[...(auditQuery.data || [])]
              .reverse()
              .slice(0, 5)
              .map((entry, i) => (
                <div key={i} className={classes.activityRow}>
                  <Text size={100} className={`azv-mono ${classes.activityTime}`}>
                    {(() => {
                      try {
                        return format(new Date(entry.timestamp), 'HH:mm:ss');
                      } catch {
                        return entry.timestamp;
                      }
                    })()}
                  </Text>
                  <Badge
                    size="small"
                    appearance="filled"
                    color={
                      entry.action.includes('delete') || entry.action.includes('purge')
                        ? 'danger'
                        : entry.action.includes('set')
                          ? 'success'
                          : entry.action.includes('get_value')
                            ? 'warning'
                            : 'informative'
                    }
                  >
                    {entry.action}
                  </Badge>
                  <Text size={200} className="azv-mono">
                    {entry.itemName || '—'}
                  </Text>
                  <span
                    className={`azv-status-dot ${classes.activityDot}`}
                    style={{
                      background:
                        entry.result === 'success' ? 'var(--azv-success)' : 'var(--azv-danger)',
                    }}
                  />
                </div>
              ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function CountCard({
  icon,
  label,
  count,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number | undefined;
  loading: boolean;
  onClick: () => void;
}) {
  const classes = useCountCardStyles();

  return (
    <Card className={classes.card} onClick={onClick}>
      <div className={classes.inner}>
        <span className={classes.icon}>{icon}</span>
        <Text size={500} weight="bold" className="azv-mono">
          {loading ? '...' : (count ?? '—')}
        </Text>
        <Text size={200} className={classes.label}>
          {label}
        </Text>
      </div>
    </Card>
  );
}

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  const classes = usePropRowStyles();

  return (
    <div>
      <Text size={100} className="azv-title" block>
        {label}
      </Text>
      <div className={classes.value}>{value}</div>
    </div>
  );
}
