import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearAuditLog, exportAuditLog, getAuditLog, saveExport } from '../../services/tauri';
import { useAppStore } from '../../stores/appStore';
import { DangerConfirmDialog } from '../common/DangerConfirmDialog';
import { EmptyState } from '../common/EmptyState';
import { ErrorMessage } from '../common/ErrorMessage';
import { ListPager, PAGE_SIZE } from '../common/ListPager';
import { LoadingSkeleton } from '../common/LoadingSkeleton';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Toast';
import { ActivityTable } from './ActivityTable';
import { ActivityToolbar } from './ActivityToolbar';
import { ALL, type AuditFilterState, emptyAuditFilter, filterAuditEntries } from './auditFilter';

export function AuditLog() {
  const selectedVaultName = useAppStore((state) => state.selectedVaultName);
  const refreshInterval = useAppStore((state) => state.auditRefreshInterval);
  const maxEntries = useAppStore((state) => state.auditMaxEntries);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // The failing action is kept with the message so the banner can offer the
  // right retry, the way every other list does.
  const [error, setError] = useState<{ message: string; source: 'export' | 'clear' } | null>(null);
  const [filter, setFilter] = useState<AuditFilterState>(emptyAuditFilter);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // The limit belongs in the key: the dashboard reads the same log with a
  // different limit, and a shared key would serve it whichever page loaded first.
  const queryKey = ['auditLog', selectedVaultName, maxEntries] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => getAuditLog(maxEntries, selectedVaultName!),
    enabled: Boolean(selectedVaultName),
    refetchInterval: refreshInterval,
  });
  const allEntries = useMemo(() => query.data ?? [], [query.data]);
  const entries = useMemo(() => filterAuditEntries(allEntries, filter), [allEntries, filter]);
  const filtersActive =
    filter.search.trim() !== '' ||
    filter.action !== ALL ||
    filter.result !== ALL ||
    filter.itemType !== ALL;
  useEffect(() => {
    if (!selectedVaultName) return;
    setVisibleCount(PAGE_SIZE);
    setFilter(emptyAuditFilter);
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
        toast.success(
          'Activity copied',
          `The activity JSON for ${selectedVaultName} is on your clipboard.`,
        );
      } catch {
        // The backend writes the file and tells us where it landed: a blob
        // download reports nothing back and writes nothing in the desktop
        // webview, so the toast would be claiming a file that does not exist.
        const path = await saveExport(`azvault-activity-${Date.now()}.json`, data);
        toast.success('Activity saved', `The clipboard was unavailable, so ${path} was written.`);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to export activity.';
      setError({ message, source: 'export' });
      toast.error('Export failed', message);
    } finally {
      setExporting(false);
    }
  }, [selectedVaultName, exporting, toast]);
  const clearCurrentVault = async () => {
    if (!selectedVaultName) return;
    setClearing(true);
    setError(null);
    try {
      await clearAuditLog(selectedVaultName);
      queryClient.setQueryData(queryKey, []);
      // Prefix match: the dashboard reads the same log under a different limit
      // and has no refetch interval, so an exact-key invalidation would leave it
      // showing history the user just cleared.
      await queryClient.invalidateQueries({ queryKey: ['auditLog', selectedVaultName] });
      setClearOpen(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to clear activity.';
      setError({ message, source: 'clear' });
      toast.error('Clear failed', message);
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
        total={allEntries.length}
        filter={filter}
        onFilterChange={(next) => {
          setFilter(next);
          setVisibleCount(PAGE_SIZE);
        }}
        exporting={exporting}
        copied={copied}
        clearing={clearing}
        onExport={() => void exportCurrentVault()}
        onClear={() => setClearOpen(true)}
      />
      {error && (
        <div className="px-3 pt-3">
          <ErrorMessage
            error={error.message}
            onRetry={
              error.source === 'export'
                ? () => void exportCurrentVault()
                : () => {
                    setError(null);
                    setClearOpen(true);
                  }
            }
            onDismiss={() => setError(null)}
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <LoadingSkeleton columns={[18, 18, 11, 20, 11, 22]} />
        ) : query.isError ? (
          <ErrorMessage error={String(query.error)} onRetry={() => void query.refetch()} />
        ) : !entries.length ? (
          <EmptyState
            icon={<Icon name="activity" />}
            title={filtersActive ? 'No matching activity' : 'No activity for this vault'}
            description={
              filtersActive
                ? 'No entries match the current filters.'
                : 'Actions performed in this Key Vault will appear here. Secret values are never recorded.'
            }
            action={
              filtersActive
                ? { label: 'Clear filters', onClick: () => setFilter(emptyAuditFilter) }
                : undefined
            }
          />
        ) : (
          <>
            <ActivityTable entries={entries.slice(0, visibleCount)} />
            <ListPager
              shown={Math.min(visibleCount, entries.length)}
              total={entries.length}
              onShowMore={() => setVisibleCount((count) => count + PAGE_SIZE)}
            />
          </>
        )}
      </div>
      <DangerConfirmDialog
        open={clearOpen}
        title="Clear vault activity"
        description={
          <>
            Clear all activity entries for <strong className="mono">{selectedVaultName}</strong>?
            Other vaults are not affected.
          </>
        }
        confirmText="clear"
        confirmLabel="Clear activity"
        loading={clearing}
        onConfirm={clearCurrentVault}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  );
}
