import {
  Badge,
  Button,
  Combobox,
  makeStyles,
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

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground2,
    gap: '8px',
    flexWrap: 'wrap',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  countText: {
    color: tokens.colorNeutralForeground3,
  },
  filters: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  comboboxAction: {
    minWidth: '100px',
  },
  comboboxResult: {
    minWidth: '90px',
  },
  comboboxType: {
    minWidth: '100px',
  },
  toolbarButtons: {
    display: 'flex',
    gap: '4px',
  },
  actionError: {
    padding: '4px 12px',
    background: tokens.colorPaletteRedBackground1,
  },
  actionErrorText: {
    color: tokens.colorPaletteRedForeground1,
  },
  tableContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '0 12px',
    minHeight: 0,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '48px',
  },
  tableWrap: {
    marginTop: '8px',
  },
  thTime: { width: '17%' },
  thVault: { width: '12%' },
  thAction: { width: '14%' },
  thType: { width: '9%' },
  thItem: { width: '15%' },
  thResult: { width: '10%' },
  thDetails: { width: '23%' },
  timeText: {
    fontSize: '10px',
  },
  itemNameText: {
    fontSize: '11px',
  },
  resultCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  detailsText: {
    color: tokens.colorNeutralForeground3,
    display: 'inline-block',
    maxWidth: '240px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: '10px',
  },
  loadMoreContainer: {
    display: 'flex',
    justifyContent: 'center',
    padding: '10px',
  },
  banner: {
    padding: '4px 12px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground3,
    fontSize: '10px',
  },
  bannerText: {
    color: tokens.colorNeutralForeground3,
  },
});

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
  const classes = useStyles();
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
    <div className={classes.root}>
      {/* Toolbar */}
      <div className={classes.toolbar}>
        <div className={classes.toolbarLeft}>
          <Text weight="semibold" size={300}>
            Activity Log
          </Text>
          <Text size={200} className={`azv-mono ${classes.countText}`}>
            ({entries.length})
          </Text>
        </div>

        {/* Filters */}
        <div className={classes.filters}>
          <Combobox
            value={filterAction}
            selectedOptions={[filterAction]}
            onOptionSelect={(_, d) => setFilterAction(d.optionValue || 'All')}
            placeholder="Action"
            className={classes.comboboxAction}
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
            className={classes.comboboxResult}
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
            className={classes.comboboxType}
            size="small"
          >
            {TYPE_OPTIONS.map((o) => (
              <Option key={o} value={o}>
                {o}
              </Option>
            ))}
          </Combobox>
        </div>

        <div className={classes.toolbarButtons}>
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
        <div className={classes.actionError}>
          <Text size={100} className={classes.actionErrorText}>
            {actionError}
          </Text>
        </div>
      )}

      {/* Table */}
      <div className={classes.tableContainer}>
        {logQuery.isLoading ? (
          <div className={classes.loadingContainer}>
            <Spinner label="Loading..." />
          </div>
        ) : entries.length === 0 ? (
          <EmptyState
            title="No audit entries"
            description="Actions will be logged here. Secret values are NEVER recorded."
          />
        ) : (
          <>
            <div className={`azv-table-wrap ${classes.tableWrap}`}>
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <th className={`azv-th ${classes.thTime}`}>Time</th>
                    <th className={`azv-th ${classes.thVault}`}>Vault</th>
                    <th className={`azv-th ${classes.thAction}`}>Action</th>
                    <th className={`azv-th ${classes.thType}`}>Type</th>
                    <th className={`azv-th ${classes.thItem}`}>Item</th>
                    <th className={`azv-th ${classes.thResult}`}>Result</th>
                    <th className={`azv-th ${classes.thDetails}`}>Details</th>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleEntries.map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Text size={200} className={`azv-mono ${classes.timeText}`}>
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
                        <Text size={200} className={`azv-mono ${classes.itemNameText}`}>
                          {entry.itemName}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <div className={classes.resultCell}>
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
                          <Text size={200} className={`azv-mono ${classes.detailsText}`}>
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
              <div className={classes.loadMoreContainer}>
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
      <div className={classes.banner}>
        <Text size={100} className={classes.bannerText}>
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
