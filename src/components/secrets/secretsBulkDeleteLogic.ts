import type { SecretItem } from '../../types';

/** Enough parallelism to be quick against Key Vault, not enough to get throttled. */
export const DELETE_BATCH_SIZE = 5;

export type BulkDeleteProgress = {
  total: number;
  completed: number;
  failed: number;
};

export function getSelectedSecrets(
  allSecrets: SecretItem[],
  selectedIds: Set<string>,
): SecretItem[] {
  return allSecrets.filter((s) => selectedIds.has(s.id));
}

export function pruneSelectedIds(selectedIds: Set<string>, existingIds: Set<string>): Set<string> {
  const next = new Set<string>();
  selectedIds.forEach((id) => {
    if (existingIds.has(id)) next.add(id);
  });
  return next;
}

export function toggleSelection(
  selectedIds: Set<string>,
  id: string,
  checked: boolean,
  locked: boolean,
): Set<string> {
  if (locked) return selectedIds;
  const next = new Set(selectedIds);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export function toggleSelectionAll(
  selectedIds: Set<string>,
  visibleIds: string[],
  checked: boolean,
  locked: boolean,
): Set<string> {
  if (locked) return selectedIds;
  const next = new Set(selectedIds);
  if (checked) {
    visibleIds.forEach((id) => {
      next.add(id);
    });
  } else {
    visibleIds.forEach((id) => {
      next.delete(id);
    });
  }
  return next;
}

export function removeSucceededSelection(
  selectedIds: Set<string>,
  succeededIds: string[],
): Set<string> {
  const next = new Set(selectedIds);
  succeededIds.forEach((id) => {
    next.delete(id);
  });
  return next;
}

export function filterOutDeletedSecrets(
  current: SecretItem[] | undefined,
  succeededIds: string[],
): SecretItem[] {
  if (!current || succeededIds.length === 0) return current || [];
  return current.filter((s) => !succeededIds.includes(s.id));
}

export function nextDeleteProgress(
  previous: BulkDeleteProgress,
  failed: number,
): BulkDeleteProgress {
  return {
    ...previous,
    completed: previous.completed + 1,
    failed,
  };
}

/**
 * Secrets whose name starts with `prefix`, matched case-insensitively because
 * Key Vault treats names that way. The dialog shows this exact list before the
 * user confirms, so the wider match is visible rather than surprising.
 */
export function filterSecretsByPrefix(secrets: SecretItem[], prefix: string): SecretItem[] {
  const normalized = prefix.toLowerCase();
  if (normalized.length === 0) return [];
  return secrets.filter((s) => s.name.toLowerCase().startsWith(normalized));
}
