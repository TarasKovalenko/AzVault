import type { SecretItem } from '../../types';

export type BulkDeleteProgress = {
  total: number;
  completed: number;
  failed: number;
};

export function isDeleteConfirmationValid(input: string): boolean {
  return input.trim() === 'delete';
}

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

export function filterSecretsByPrefix(secrets: SecretItem[], prefix: string): SecretItem[] {
  const normalized = prefix.toLowerCase();
  if (normalized.length === 0) return [];
  return secrets.filter((s) => s.name.toLowerCase().startsWith(normalized));
}
