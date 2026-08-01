import { Badge, Button, Card, makeStyles, Text, tokens } from '@fluentui/react-components';
import {
  Add24Regular,
  Alert24Regular,
  ArrowRight20Regular,
  Certificate24Regular,
  ClipboardTextLtr24Regular,
  Copy24Regular,
  Key24Regular,
  LockClosed24Regular,
  ShieldCheckmark24Regular,
} from '@fluentui/react-icons';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useState } from 'react';
import { useAppToast } from '../../lib/toast';
import { getAuditLog, listCertificates, listKeys, listSecrets } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';

const useStyles = makeStyles({
  root: {
    padding: '24px 28px 32px',
    overflow: 'auto',
    height: '100%',
    maxWidth: '1180px',
    width: '100%',
    margin: '0 auto',
  },
  heading: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    marginBottom: '22px',
  },
  title: { marginBottom: '3px' },
  subtitle: {
    color: tokens.colorNeutralForeground3,
  },
  countGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '14px',
    marginBottom: '18px',
  },
  card: {
    padding: '18px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, .045)',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    marginBottom: '14px',
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
  dashboardGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, .8fr)',
    gap: '14px',
    alignItems: 'start',
  },
  healthHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  },
  healthIcon: {
    width: '34px',
    height: '34px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '9px',
    color: tokens.colorBrandForeground1,
    background: tokens.colorBrandBackground2,
  },
  healthCopy: { flex: 1 },
  healthList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  healthRow: {
    width: '100%',
    border: 0,
    display: 'grid',
    gridTemplateColumns: '28px minmax(0, 1fr) auto 18px',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 8px',
    borderRadius: '8px',
    color: 'inherit',
    background: 'transparent',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { background: tokens.colorNeutralBackground1Hover },
  },
  healthName: { minWidth: 0 },
  healthyState: {
    padding: '18px 8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: tokens.colorNeutralForeground2,
  },
  healthyIcon: { color: tokens.colorPaletteGreenForeground1 },
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
    padding: '17px 18px',
    cursor: 'pointer',
    borderRadius: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: '0 2px 8px rgba(0, 0, 0, .045)',
    transitionProperty: 'transform, box-shadow, border-color',
    transitionDuration: '140ms',
    ':hover': {
      transform: 'translateY(-1px)',
      boxShadow: '0 5px 14px rgba(0, 0, 0, .08)',
    },
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    gap: '13px',
  },
  icon: {
    width: '38px',
    height: '38px',
    display: 'grid',
    placeItems: 'center',
    borderRadius: '10px',
    color: tokens.colorBrandForeground1,
    background: tokens.colorBrandBackground2,
  },
  copy: { display: 'flex', flexDirection: 'column' },
  label: { color: tokens.colorNeutralForeground3 },
  arrow: { marginLeft: 'auto', color: tokens.colorNeutralForeground4 },
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
  const toast = useAppToast();

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

  const attentionItems = [
    ...(secretsQuery.data || []).map((item) => ({
      ...item,
      type: 'Secret',
      tab: 'secrets' as const,
    })),
    ...(keysQuery.data || []).map((item) => ({ ...item, type: 'Key', tab: 'keys' as const })),
    ...(certsQuery.data || []).map((item) => ({
      ...item,
      type: 'Certificate',
      tab: 'certificates' as const,
    })),
  ]
    .map((item) => {
      const days = item.expires
        ? Math.ceil((new Date(item.expires).getTime() - Date.now()) / 86_400_000)
        : null;
      const reason = !item.enabled
        ? 'Disabled'
        : days !== null && days < 0
          ? 'Expired'
          : days !== null && days <= 30
            ? `${days}d left`
            : null;
      return { ...item, reason, days };
    })
    .filter((item) => item.reason)
    .sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));

  const handleCopyUri = () => {
    if (selectedVaultUri) {
      navigator.clipboard.writeText(selectedVaultUri);
      setCopiedUri(true);
      toast.success('Vault URI copied to clipboard');
      setTimeout(() => setCopiedUri(false), 2000);
    }
  };

  if (!selectedVaultName) return null;

  return (
    <div className={classes.root}>
      <div className={classes.heading}>
        <div>
          <Text weight="semibold" size={600} block className={classes.title}>
            {selectedVaultName}
          </Text>
          <Text size={200} className={classes.subtitle}>
            Vault overview and security posture
          </Text>
        </div>
        <Button
          appearance="primary"
          icon={<Add24Regular />}
          onClick={() => {
            setActiveTab('secrets');
            requestAnimationFrame(() => window.dispatchEvent(new CustomEvent('azv:new-secret')));
          }}
        >
          New secret
        </Button>
      </div>

      {/* Count cards */}
      <div className={classes.countGrid}>
        <CountCard
          icon={<LockClosed24Regular />}
          label="Secrets"
          count={secretsQuery.data?.length}
          loading={secretsQuery.isLoading}
          onClick={() => setActiveTab('secrets')}
        />
        <CountCard
          icon={<Key24Regular />}
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

      <div className={classes.dashboardGrid}>
        <div>
          <Card className={classes.card}>
            <div className={classes.healthHeader}>
              <span className={classes.healthIcon}>
                {attentionItems.length > 0 ? <Alert24Regular /> : <ShieldCheckmark24Regular />}
              </span>
              <div className={classes.healthCopy}>
                <Text weight="semibold" size={300} block>
                  Attention
                </Text>
                <Text size={200} className={classes.subtitle}>
                  {attentionItems.length > 0
                    ? `${attentionItems.length} item${attentionItems.length === 1 ? '' : 's'} need review`
                    : 'No disabled or soon-to-expire items'}
                </Text>
              </div>
              {attentionItems.length > 0 && (
                <Badge color="warning" appearance="filled">
                  {attentionItems.length}
                </Badge>
              )}
            </div>
            {attentionItems.length === 0 ? (
              <div className={classes.healthyState}>
                <ShieldCheckmark24Regular className={classes.healthyIcon} />
                <Text size={200}>Everything looks healthy for the next 30 days.</Text>
              </div>
            ) : (
              <div className={classes.healthList}>
                {attentionItems.slice(0, 6).map((item) => (
                  <button
                    type="button"
                    className={classes.healthRow}
                    key={`${item.tab}-${item.id}`}
                    onClick={() => setActiveTab(item.tab)}
                  >
                    <Alert24Regular style={{ color: 'var(--azv-warning)' }} />
                    <span className={classes.healthName}>
                      <Text size={200} weight="semibold" block truncate wrap={false}>
                        {item.name}
                      </Text>
                      <Text size={100} className={classes.subtitle}>
                        {item.type}
                      </Text>
                    </span>
                    <Badge
                      size="small"
                      appearance="tint"
                      color={item.reason === 'Expired' ? 'danger' : 'warning'}
                    >
                      {item.reason}
                    </Badge>
                    <ArrowRight20Regular />
                  </button>
                ))}
              </div>
            )}
          </Card>

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
        </div>

        <div>
          {/* Quick actions */}
          <Card className={classes.card}>
            <Text weight="semibold" size={300} block className={classes.cardTitleSmall}>
              Quick Actions
            </Text>
            <div className={classes.quickActions}>
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
                    <div
                      key={`${entry.timestamp}-${entry.action}-${entry.itemName ?? i}`}
                      className={classes.activityRow}
                    >
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
      </div>
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
    <Card
      className={classes.card}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View ${label}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className={classes.inner}>
        <span className={classes.icon}>{icon}</span>
        <span className={classes.copy}>
          <Text size={500} weight="bold" className="azv-mono">
            {loading ? '...' : (count ?? '—')}
          </Text>
          <Text size={200} className={classes.label}>
            {label}
          </Text>
        </span>
        <ArrowRight20Regular className={classes.arrow} />
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
