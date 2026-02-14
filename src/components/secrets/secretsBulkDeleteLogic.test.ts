import { describe, expect, it } from 'vitest';
import type { SecretItem } from '../../types';
import {
  filterOutDeletedSecrets,
  getSelectedSecrets,
  isDeleteConfirmationValid,
  nextDeleteProgress,
  pruneSelectedIds,
  removeSucceededSelection,
  toggleSelection,
  toggleSelectionAll,
} from './secretsBulkDeleteLogic';

function makeSecret(id: string, name: string): SecretItem {
  return {
    id,
    name,
    enabled: true,
    created: null,
    updated: null,
    expires: null,
    notBefore: null,
    contentType: null,
    tags: null,
    managed: null,
  };
}

describe('secretsBulkDeleteLogic', () => {
  it('validates typed confirmation exactly after trim', () => {
    expect(isDeleteConfirmationValid('delete')).toBe(true);
    expect(isDeleteConfirmationValid('  delete  ')).toBe(true);
    expect(isDeleteConfirmationValid('Delete')).toBe(false);
    expect(isDeleteConfirmationValid('')).toBe(false);
  });

  it('returns selected secret items only', () => {
    const secrets = [makeSecret('1', 'a'), makeSecret('2', 'b')];
    const selected = new Set<string>(['2']);
    expect(getSelectedSecrets(secrets, selected).map((s) => s.id)).toEqual(['2']);
  });

  it('prunes stale ids from selection', () => {
    const selected = new Set<string>(['1', '2', 'stale']);
    const existing = new Set<string>(['1', '2']);
    expect(Array.from(pruneSelectedIds(selected, existing))).toEqual(['1', '2']);
  });

  it('toggles single selection unless locked', () => {
    const base = new Set<string>(['1']);

    const locked = toggleSelection(base, '2', true, true);
    expect(locked).toBe(base);

    const added = toggleSelection(base, '2', true, false);
    expect(Array.from(added)).toEqual(['1', '2']);

    const removed = toggleSelection(added, '1', false, false);
    expect(Array.from(removed)).toEqual(['2']);
  });

  it('toggles visible selection in bulk unless locked', () => {
    const base = new Set<string>(['a', 'z']);
    const visible = ['a', 'b', 'c'];

    const locked = toggleSelectionAll(base, visible, true, true);
    expect(locked).toBe(base);

    const selectedAll = toggleSelectionAll(base, visible, true, false);
    expect(Array.from(selectedAll)).toEqual(['a', 'z', 'b', 'c']);

    const unselectedVisible = toggleSelectionAll(selectedAll, visible, false, false);
    expect(Array.from(unselectedVisible)).toEqual(['z']);
  });

  it('removes only succeeded ids from selection', () => {
    const selected = new Set<string>(['1', '2', '3']);
    const next = removeSucceededSelection(selected, ['2', '4']);
    expect(Array.from(next)).toEqual(['1', '3']);
  });

  it('filters deleted ids out of cached secrets', () => {
    const current = [makeSecret('1', 'a'), makeSecret('2', 'b')];

    expect(filterOutDeletedSecrets(undefined, ['1'])).toEqual([]);
    expect(filterOutDeletedSecrets(current, [])).toEqual(current);
    expect(filterOutDeletedSecrets(current, ['2']).map((s) => s.id)).toEqual(['1']);
  });

  it('increments progress and keeps latest failure count', () => {
    const start = { total: 4, completed: 1, failed: 0 };
    expect(nextDeleteProgress(start, 0)).toEqual({ total: 4, completed: 2, failed: 0 });
    expect(nextDeleteProgress(start, 2)).toEqual({ total: 4, completed: 2, failed: 2 });
  });
});
