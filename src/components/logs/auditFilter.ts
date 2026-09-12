import type { AuditEntry } from '../../types';

export const ALL = 'All';

export interface AuditFilterState {
  action: string;
  result: string;
  itemType: string;
  search: string;
}

export const emptyAuditFilter: AuditFilterState = {
  action: ALL,
  result: ALL,
  itemType: ALL,
  search: '',
};

/**
 * Newest-first view of the audit log with the toolbar filters applied.
 * Pure so the filtering rules can be tested without rendering the log.
 */
export function filterAuditEntries(
  entries: readonly AuditEntry[],
  filter: AuditFilterState,
): AuditEntry[] {
  const search = filter.search.trim().toLowerCase();
  return [...entries]
    .reverse()
    .filter(
      (entry) =>
        (filter.action === ALL || entry.action.includes(filter.action)) &&
        (filter.result === ALL || entry.result === filter.result) &&
        (filter.itemType === ALL || entry.itemType === filter.itemType) &&
        (!search ||
          entry.itemName.toLowerCase().includes(search) ||
          entry.action.toLowerCase().includes(search) ||
          (entry.details ?? '').toLowerCase().includes(search)),
    );
}
