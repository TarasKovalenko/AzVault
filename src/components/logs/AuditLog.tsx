import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearAuditLog, exportAuditLog, getAuditLog } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { Button, Spinner } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { ActivityTable } from './ActivityTable';
import { ActivityToolbar } from './ActivityToolbar';

const ACTIONS = ['All', 'list', 'get', 'get_value', 'set', 'delete', 'recover', 'purge'];
const RESULTS = ['All', 'success', 'error'];
const TYPES = ['All', 'secret', 'key', 'certificate'];

export function AuditLog() {
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const refreshInterval = useAppStore((state) => state.auditRefreshInterval);
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('All');
  const [result, setResult] = useState('All');
  const [type, setType] = useState('All');
  const [visibleCount, setVisibleCount] = useState(200);
  const queryKey = ['auditLog', selectedVaultName] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getAuditLog(1000, selectedVaultName!),
    enabled: Boolean(selectedVaultName),
    refetchInterval: refreshInterval,
  });
  const entries = useMemo(
    () =>
      [...(query.data || [])]
        .reverse()
        .filter(
          (entry) =>
            (action === 'All' || entry.action.includes(action)) &&
            (result === 'All' || entry.result === result) &&
            (type === 'All' || entry.itemType === type),
        ),
    [query.data, action, result, type],
  );
  useEffect(() => {
    if (!selectedVaultName) return;
    setVisibleCount(200);
    setAction('All');
    setResult('All');
    setType('All');
    setError(null);
  }, [selectedVaultName]);
  const exportCurrentVault = useCallback(async () => {
    if (!selectedVaultName || exporting) return;
    setExporting(true);
    setError(null);
    try {
      const data = await exportAuditLog(selectedVaultName);
      try {
        await navigator.clipboard.writeText(data);
      } catch {
        const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${selectedVaultName}-activity-${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to export activity.');
    } finally {
      setExporting(false);
    }
  }, [selectedVaultName, exporting]);
  const clearCurrentVault = async () => {
    if (!selectedVaultName) return;
    setClearing(true);
    setError(null);
    try {
      await clearAuditLog(selectedVaultName);
      queryClient.setQueryData(queryKey, []);
      await queryClient.invalidateQueries({ queryKey });
      setClearOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to clear activity.');
    } finally {
      setClearing(false);
    }
  };
  useEffect(() => {
    const handler = () => {
      void exportCurrentVault();
    };
    window.addEventListener('azv:export-audit', handler);
    return () => window.removeEventListener('azv:export-audit', handler);
  }, [exportCurrentVault]);

  if (!selectedVaultName)
    return (
      <EmptyState
        icon={<Icon name="activity" />}
        title="Select a Key Vault"
        description="Activity is shown for one vault at a time."
      />
    );
  return (
    <div className="flex h-full flex-col">
      <ActivityToolbar
        vaultName={selectedVaultName}
        count={entries.length}
        action={action}
        result={result}
        type={type}
        actions={ACTIONS}
        results={RESULTS}
        types={TYPES}
        exporting={exporting}
        copied={copied}
        clearing={clearing}
        onAction={setAction}
        onResult={setResult}
        onType={setType}
        onExport={() => void exportCurrentVault()}
        onClear={() => setClearOpen(true)}
      />
      {error && (
        <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <div className="grid place-items-center p-16">
            <Spinner size="lg" />
          </div>
        ) : !entries.length ? (
          <EmptyState
            icon={<Icon name="activity" />}
            title="No activity for this vault"
            description="Actions performed in this Key Vault will appear here. Secret values are never recorded."
          />
        ) : (
          <>
            <ActivityTable entries={entries.slice(0, visibleCount)} />
            {entries.length > visibleCount && (
              <div className="flex justify-center p-3">
                <Button onClick={() => setVisibleCount((count) => count + 200)}>
                  Load more ({entries.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <footer className="border-t border-[var(--stroke)] bg-[var(--surface-muted)] px-3 py-1.5 text-[10px] text-[var(--text-tertiary)]">
        Secret values are never recorded. Only operation metadata for{' '}
        <span className="mono">{selectedVaultName}</span> is displayed.
      </footer>
      <DangerConfirmDialog
        open={clearOpen}
        title="Clear Vault Activity"
        description={
          <>
            Clear all activity entries for <strong className="mono">{selectedVaultName}</strong>?
            Other vaults are not affected.
          </>
        }
        confirmText="clear"
        confirmLabel="Clear Activity"
        loading={clearing}
        onConfirm={clearCurrentVault}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
