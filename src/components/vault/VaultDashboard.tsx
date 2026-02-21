import { Badge, Button, Card, Text, tokens } from '@fluentui/react-components';
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

export function VaultDashboard() {
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
    <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
      <Text weight="semibold" size={500} block style={{ marginBottom: 16 }}>
        {selectedVaultName}
      </Text>

      {/* Count cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 20,
        }}
      >
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
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Text weight="semibold" size={300} block style={{ marginBottom: 12 }}>
          Vault Properties
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <PropRow
            label="Soft-Delete"
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text
                  size={200}
                  className="azv-mono"
                  style={{ wordBreak: 'break-all', fontSize: 11 }}
                >
                  {selectedVaultUri}
                </Text>
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<Copy24Regular />}
                  onClick={handleCopyUri}
                  title="Copy Vault URI"
                  style={{ flexShrink: 0 }}
                />
              </div>
            }
          />
        </div>

        {currentVault?.softDeleteEnabled === false && (
          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              borderRadius: 4,
              background: tokens.colorPaletteYellowBackground1,
              fontSize: 12,
            }}
          >
            <Text size={200} style={{ color: tokens.colorPaletteYellowForeground1 }}>
              Purge protection is not confirmed. Deleted items may be permanently removed.
            </Text>
          </div>
        )}
      </Card>

      {/* Quick actions */}
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <Text weight="semibold" size={300} block style={{ marginBottom: 10 }}>
          Quick Actions
        </Text>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
      <Card style={{ padding: 16 }}>
        <Text weight="semibold" size={300} block style={{ marginBottom: 10 }}>
          Recent Activity
        </Text>
        {(auditQuery.data || []).length === 0 ? (
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            No activity recorded yet.
          </Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {[...(auditQuery.data || [])]
              .reverse()
              .slice(0, 5)
              .map((entry, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}
                >
                  <Text
                    size={100}
                    className="azv-mono"
                    style={{ opacity: 0.6, width: 80, flexShrink: 0 }}
                  >
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
                    className="azv-status-dot"
                    style={{
                      background:
                        entry.result === 'success' ? 'var(--azv-success)' : 'var(--azv-danger)',
                      marginLeft: 'auto',
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
  return (
    <Card style={{ padding: 16, cursor: 'pointer', textAlign: 'center' }} onClick={onClick}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 24, opacity: 0.6 }}>{icon}</span>
        <Text size={500} weight="bold" className="azv-mono">
          {loading ? '...' : (count ?? '—')}
        </Text>
        <Text
          size={200}
          style={{ textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7 }}
        >
          {label}
        </Text>
      </div>
    </Card>
  );
}

function PropRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <Text size={100} className="azv-title" block>
        {label}
      </Text>
      <div style={{ marginTop: 2 }}>{value}</div>
    </div>
  );
}
