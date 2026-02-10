import { useState } from 'react';
import {
  Button,
  Text,
  Badge,
  Tooltip,
  tokens,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Spinner,
} from '@fluentui/react-components';
import {
  Delete24Regular,
  ArrowDownload24Regular,
  Checkmark24Regular,
} from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getAuditLog, exportAuditLog, clearAuditLog } from '../../services/tauri';
import { format } from 'date-fns';

export function AuditLog() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const logQuery = useQuery({
    queryKey: ['auditLog'],
    queryFn: () => getAuditLog(200),
    refetchInterval: 10000,
  });

  const handleExport = async () => {
    try {
      const data = await exportAuditLog();
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Error handled silently
    }
  };

  const handleClear = async () => {
    if (window.confirm('Clear all audit logs? This cannot be undone.')) {
      await clearAuditLog();
      queryClient.invalidateQueries({ queryKey: ['auditLog'] });
    }
  };

  const entries = logQuery.data || [];

  const actionColor = (action: string): 'informative' | 'success' | 'warning' | 'danger' | 'important' => {
    if (action.includes('delete') || action.includes('purge')) return 'danger';
    if (action.includes('set') || action.includes('create')) return 'success';
    if (action.includes('get_value')) return 'warning';
    if (action.includes('sign')) return 'important';
    return 'informative';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text weight="semibold" size={300}>
            Activity Log
          </Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            ({entries.length} entries)
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            appearance="subtle"
            icon={copied ? <Checkmark24Regular /> : <ArrowDownload24Regular />}
            size="small"
            onClick={handleExport}
          >
            {copied ? 'Copied!' : 'Export Sanitized Log'}
          </Button>
          <Button
            appearance="subtle"
            icon={<Delete24Regular />}
            size="small"
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        {logQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner label="Loading..." />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: tokens.colorNeutralForeground3 }}>
            <Text>No audit entries yet. Actions will be logged here.</Text>
          </div>
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: '18%' }}>Timestamp</TableHeaderCell>
                <TableHeaderCell style={{ width: '12%' }}>Vault</TableHeaderCell>
                <TableHeaderCell style={{ width: '15%' }}>Action</TableHeaderCell>
                <TableHeaderCell style={{ width: '10%' }}>Type</TableHeaderCell>
                <TableHeaderCell style={{ width: '15%' }}>Item</TableHeaderCell>
                <TableHeaderCell style={{ width: '10%' }}>Result</TableHeaderCell>
                <TableHeaderCell style={{ width: '20%' }}>Details</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...entries].reverse().map((entry, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Text size={200}>
                      {(() => {
                        try {
                          return format(new Date(entry.timestamp), 'MMM d HH:mm:ss');
                        } catch {
                          return entry.timestamp;
                        }
                      })()}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Text size={200}>{entry.vaultName}</Text>
                  </TableCell>
                  <TableCell>
                    <Badge size="small" appearance="filled" color={actionColor(entry.action)}>
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Text size={200}>{entry.itemType}</Text>
                  </TableCell>
                  <TableCell>
                    <Text size={200} font="monospace">
                      {entry.itemName}
                    </Text>
                  </TableCell>
                  <TableCell>
                    <Tooltip content={entry.result} relationship="label">
                      <Badge
                        size="small"
                        appearance="outline"
                        color={entry.result === 'success' ? 'success' : 'danger'}
                        title={entry.result}
                        style={{ maxWidth: 120 }}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            maxWidth: 100,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.result}
                        </span>
                      </Badge>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Tooltip content={entry.details || '-'} relationship="label">
                      <Text
                        size={200}
                        style={{
                          color: tokens.colorNeutralForeground3,
                          display: 'inline-block',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={entry.details || '-'}
                      >
                        {entry.details || '-'}
                      </Text>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
