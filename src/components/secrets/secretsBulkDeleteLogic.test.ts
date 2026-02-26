import { describe, expect, it } from 'vitest';
import type { SecretItem } from '../../types';
import {
  filterOutDeletedSecrets,
  filterSecretsByPrefix,
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

  describe('filterSecretsByPrefix', () => {
    const secrets = [
      makeSecret('1', 'staging-db-password'),
      makeSecret('2', 'staging-api-key'),
      makeSecret('3', 'prod-db-password'),
      makeSecret('4', 'prod-api-key'),
      makeSecret('5', 'dev-token'),
    ];

    it('returns secrets whose names start with the prefix', () => {
      const result = filterSecretsByPrefix(secrets, 'staging-');
      expect(result.map((s) => s.id)).toEqual(['1', '2']);
    });

    it('is case-insensitive', () => {
      const result = filterSecretsByPrefix(secrets, 'STAGING-');
      expect(result.map((s) => s.id)).toEqual(['1', '2']);
    });

    it('returns empty array for empty prefix', () => {
      expect(filterSecretsByPrefix(secrets, '')).toEqual([]);
    });

    it('returns empty array when no secrets match', () => {
      expect(filterSecretsByPrefix(secrets, 'nonexistent-')).toEqual([]);
    });

    it('matches a single-character prefix', () => {
      const result = filterSecretsByPrefix(secrets, 'd');
      expect(result.map((s) => s.id)).toEqual(['5']);
    });

    it('matches the full name as a prefix', () => {
      const result = filterSecretsByPrefix(secrets, 'dev-token');
      expect(result.map((s) => s.id)).toEqual(['5']);
    });

    it('returns all secrets when prefix matches everything', () => {
      const all = [makeSecret('a', 'app-1'), makeSecret('b', 'app-2')];
      expect(filterSecretsByPrefix(all, 'app-').length).toBe(2);
    });
  });
});
