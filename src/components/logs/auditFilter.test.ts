import { describe, expect, it } from 'vitest';
import { makeAuditEntry } from '../../test/fixtures';
import { ALL, emptyAuditFilter, filterAuditEntries } from './auditFilter';

const entries = [
  makeAuditEntry({ itemName: 'alpha', action: 'get', result: 'success', itemType: 'secret' }),
  makeAuditEntry({
    itemName: 'beta',
    action: 'get_value',
    result: 'error',
    itemType: 'secret',
    details: 'Forbidden by policy',
  }),
  makeAuditEntry({ itemName: 'gamma', action: 'delete', result: 'success', itemType: 'key' }),
];

const names = (filter = emptyAuditFilter) =>
  filterAuditEntries(entries, filter).map((entry) => entry.itemName);

describe('filterAuditEntries', () => {
  it('returns every entry newest-first with an empty filter', () => {
    expect(names()).toEqual(['gamma', 'beta', 'alpha']);
  });

  it('does not mutate the source array', () => {
    filterAuditEntries(entries, emptyAuditFilter);
    expect(entries.map((entry) => entry.itemName)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('matches actions by substring so get also matches get_value', () => {
    expect(names({ ...emptyAuditFilter, action: 'get' })).toEqual(['beta', 'alpha']);
    expect(names({ ...emptyAuditFilter, action: 'get_value' })).toEqual(['beta']);
  });

  it('filters by exact result', () => {
    expect(names({ ...emptyAuditFilter, result: 'error' })).toEqual(['beta']);
    expect(names({ ...emptyAuditFilter, result: 'success' })).toEqual(['gamma', 'alpha']);
  });

  it('filters by exact item type', () => {
    expect(names({ ...emptyAuditFilter, itemType: 'key' })).toEqual(['gamma']);
  });

  it('searches the item name, the action and the details', () => {
    expect(names({ ...emptyAuditFilter, search: 'gamm' })).toEqual(['gamma']);
    expect(names({ ...emptyAuditFilter, search: 'delete' })).toEqual(['gamma']);
    expect(names({ ...emptyAuditFilter, search: 'policy' })).toEqual(['beta']);
  });

  it('ignores case and surrounding whitespace in the search box', () => {
    expect(names({ ...emptyAuditFilter, search: '  ALPHA ' })).toEqual(['alpha']);
  });

  it('treats an entry without details as searchable by its other fields only', () => {
    // `alpha` and `gamma` carry `details: null`; only `beta` has details.
    expect(entries.filter((entry) => entry.details == null).map((entry) => entry.itemName)).toEqual(
      ['alpha', 'gamma'],
    );

    // A detail-only term never matches the entries that have no details...
    expect(names({ ...emptyAuditFilter, search: 'forbidden' })).toEqual(['beta']);
    // ...and a missing `details` must not swallow the entry or throw: the
    // detail-less rows are still reachable through name and action.
    expect(names({ ...emptyAuditFilter, search: 'alpha' })).toEqual(['alpha']);
    expect(names({ ...emptyAuditFilter, search: 'delete' })).toEqual(['gamma']);
  });

  it('combines every dimension', () => {
    expect(
      names({ action: 'get', result: 'success', itemType: 'secret', search: 'alpha' }),
    ).toEqual(['alpha']);
    expect(names({ action: 'get', result: 'error', itemType: 'key', search: '' })).toEqual([]);
  });

  it('exposes ALL as the neutral option used by the empty filter', () => {
    expect(emptyAuditFilter).toEqual({
      action: ALL,
      result: ALL,
      itemType: ALL,
      search: '',
    });
  });
});
