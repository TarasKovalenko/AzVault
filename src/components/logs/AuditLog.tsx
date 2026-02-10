/**
 * AuditLog.tsx – Local activity log viewer.
 *
 * Displays audit entries recorded by the Rust backend (list, get, set,
 * delete, purge operations). Supports export to clipboard and clear.
 * Auto-refreshes every 10 seconds.
 */

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

/** Map action names to semantic badge colours. */
function actionColor(action: string): 'informative' | 'success' | 'warning' | 'danger' | 'important' {
  if (action.includes('delete') || action.includes('purge')) return 'danger';
  if (action.includes('set') || action.includes('create')) return 'success';
  if (action.includes('get_value')) return 'warning';
  if (action.includes('sign')) return 'important';
  return 'informative';
}

export function AuditLog() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const logQuery = useQuery({
    queryKey: ['auditLog'],
    queryFn: () => getAuditLog(200),
    refetchInterval: 10_000,
  });

  /** Export sanitised audit log JSON to clipboard. */
  const handleExport = async () => {
    try {
      const data = await exportAuditLog();
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Export errors are non-critical
    }
  };

  /** Clear all audit entries with user confirmation. */
  const handleClear = async () => {
    if (!window.confirm('Clear all audit logs? This cannot be undone.')) return;
    await clearAuditLog();
    queryClient.invalidateQueries({ queryKey: ['auditLog'] });
  };

  const entries = logQuery.data || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text weight="semibold" size={300}>
            Activity Log
          </Text>
          <Text size={200} className="azv-mono" style={{ color: tokens.colorNeutralForeground3 }}>
            ({entries.length})
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            appearance="subtle"
            icon={copied ? <Checkmark24Regular /> : <ArrowDownload24Regular />}
            size="small"
            onClick={handleExport}
          >
            {copied ? 'Copied' : 'Export'}
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

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px' }}>
        {logQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner label="Loading…" />
          </div>
        ) : entries.length === 0 ? (
          <div className="azv-empty">
            <Text>No audit entries yet. Actions will be logged here.</Text>
          </div>
        ) : (
          <div className="azv-table-wrap" style={{ marginTop: 8 }}>
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell style={{ width: '17%' }}>Time</TableHeaderCell>
                  <TableHeaderCell style={{ width: '12%' }}>Vault</TableHeaderCell>
                  <TableHeaderCell style={{ width: '14%' }}>Action</TableHeaderCell>
                  <TableHeaderCell style={{ width: '9%' }}>Type</TableHeaderCell>
                  <TableHeaderCell style={{ width: '15%' }}>Item</TableHeaderCell>
                  <TableHeaderCell style={{ width: '10%' }}>Result</TableHeaderCell>
                  <TableHeaderCell style={{ width: '23%' }}>Details</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...entries].reverse().map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Text size={200} className="azv-mono" style={{ fontSize: 10 }}>
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
                      <Text size={200} className="azv-mono">
                        {entry.vaultName}
                      </Text>
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
                      <Text size={200} className="azv-mono" style={{ fontSize: 11 }}>
                        {entry.itemName}
                      </Text>
                    </TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span
                          className="azv-status-dot"
                          style={{
                            background:
                              entry.result === 'success'
                                ? 'var(--azv-success)'
                                : 'var(--azv-danger)',
                          }}
                        />
                        <Text size={200}>{entry.result}</Text>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Tooltip content={entry.details || '—'} relationship="label">
                        <Text
                          size={200}
                          className="azv-mono"
                          style={{
                            color: tokens.colorNeutralForeground3,
                            display: 'inline-block',
                            maxWidth: 240,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 10,
                          }}
                        >
                          {entry.details || '—'}
                        </Text>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
