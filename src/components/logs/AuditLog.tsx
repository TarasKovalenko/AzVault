import {
  Badge,
  Button,
  Combobox,
  Option,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  Text,
  Tooltip,
  tokens,
} from '@fluentui/react-components';
import { ArrowDownload24Regular, Checkmark24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useMemo, useState } from 'react';
import { clearAuditLog, exportAuditLog, getAuditLog } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';

function actionColor(
  action: string,
): 'informative' | 'success' | 'warning' | 'danger' | 'important' {
  if (action.includes('delete') || action.includes('purge')) return 'danger';
  if (action.includes('set') || action.includes('create')) return 'success';
  if (action.includes('get_value')) return 'warning';
  if (action.includes('sign')) return 'important';
  return 'informative';
}

const ACTION_OPTIONS = [
  'All',
  'list',
  'get',
  'get_value',
  'set',
  'delete',
  'recover',
  'purge',
] as const;
const RESULT_OPTIONS = ['All', 'success', 'error'] as const;
const TYPE_OPTIONS = ['All', 'secret', 'key', 'certificate'] as const;

export function AuditLog() {
  const queryClient = useQueryClient();
  const { auditRefreshInterval } = useAppStore();
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('All');
  const [filterResult, setFilterResult] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [visibleCount, setVisibleCount] = useState(200);

  const logQuery = useQuery({
    queryKey: ['auditLog'],
    queryFn: () => getAuditLog(10000),
    refetchInterval: auditRefreshInterval,
  });

  const entries = useMemo(() => {
    const all = [...(logQuery.data || [])].reverse();
    return all.filter((e) => {
      if (filterAction !== 'All' && !e.action.includes(filterAction)) return false;
      if (filterResult !== 'All' && e.result !== filterResult) return false;
      if (filterType !== 'All' && e.itemType !== filterType) return false;
      return true;
    });
  }, [logQuery.data, filterAction, filterResult, filterType]);

  const visibleEntries = entries.slice(0, visibleCount);

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setActionError(null);
    try {
      const data = await exportAuditLog();
      try {
        await navigator.clipboard.writeText(data);
      } catch {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `azvault-activity-log-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to export activity log.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setActionError(null);
    try {
      await clearAuditLog();
      queryClient.setQueryData(['auditLog'], []);
      queryClient.invalidateQueries({ queryKey: ['auditLog'] });
      setShowClearConfirm(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to clear activity log.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground2,
          gap: 8,
          flexWrap: 'wrap',
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

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Combobox
            value={filterAction}
            selectedOptions={[filterAction]}
            onOptionSelect={(_, d) => setFilterAction(d.optionValue || 'All')}
            placeholder="Action"
            style={{ minWidth: 100 }}
            size="small"
          >
            {ACTION_OPTIONS.map((o) => (
              <Option key={o} value={o}>
                {o}
              </Option>
            ))}
          </Combobox>
          <Combobox
            value={filterResult}
            selectedOptions={[filterResult]}
            onOptionSelect={(_, d) => setFilterResult(d.optionValue || 'All')}
            placeholder="Result"
            style={{ minWidth: 90 }}
            size="small"
          >
            {RESULT_OPTIONS.map((o) => (
              <Option key={o} value={o}>
                {o}
              </Option>
            ))}
          </Combobox>
          <Combobox
            value={filterType}
            selectedOptions={[filterType]}
            onOptionSelect={(_, d) => setFilterType(d.optionValue || 'All')}
            placeholder="Type"
            style={{ minWidth: 100 }}
            size="small"
          >
            {TYPE_OPTIONS.map((o) => (
              <Option key={o} value={o}>
                {o}
              </Option>
            ))}
          </Combobox>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <Button
            appearance="subtle"
            icon={copied ? <Checkmark24Regular /> : <ArrowDownload24Regular />}
            size="small"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? 'Exporting...' : copied ? 'Copied' : 'Export'}
          </Button>
          <Button
            appearance="subtle"
            icon={<Delete24Regular />}
            size="small"
            onClick={() => setShowClearConfirm(true)}
            disabled={isClearing}
          >
            Clear
          </Button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '4px 12px', background: tokens.colorPaletteRedBackground1 }}>
          <Text size={100} style={{ color: tokens.colorPaletteRedForeground1 }}>
            {actionError}
          </Text>
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '0 12px', minHeight: 0 }}>
        {logQuery.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <Spinner label="Loading..." />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="Actions will be logged here. Secret values are NEVER recorded."
          />
        ) : (
          <>
            <div className="azv-table-wrap" style={{ marginTop: 8 }}>
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <th className="azv-th" style={{ width: '17%' }}>Time</th>
                    <th className="azv-th" style={{ width: '12%' }}>Vault</th>
                    <th className="azv-th" style={{ width: '14%' }}>Action</th>
                    <th className="azv-th" style={{ width: '9%' }}>Type</th>
                    <th className="azv-th" style={{ width: '15%' }}>Item</th>
                    <th className="azv-th" style={{ width: '10%' }}>Result</th>
                    <th className="azv-th" style={{ width: '23%' }}>Details</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.map((entry, i) => (
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

            {entries.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 10 }}>
                <Button
                  onClick={() => setVisibleCount((c) => c + 200)}
                  appearance="secondary"
                  size="small"
                >
                  Load more ({entries.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Redaction guarantee banner */}
      <div
        style={{
          padding: '4px 12px',
          borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
          background: tokens.colorNeutralBackground3,
          fontSize: 10,
        }}
      >
        <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
          Secret values are NEVER recorded in the audit log. Only operation metadata is logged.
        </Text>
      </div>

      {/* Clear confirmation */}
      <DangerConfirmDialog
        open={showClearConfirm}
        title="Clear Audit Log"
        description="Clear all audit log entries? This cannot be undone."
        confirmText="clear"
        confirmLabel="Clear All"
        dangerLevel="warning"
        loading={isClearing}
        onConfirm={handleClear}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
