import { describe, expect, it } from 'vitest';
import type { Column } from './ItemTable';
import { compareSortValues, nextSortState, sortItems } from './useTableSort';

interface Row {
  name: string;
  size: number | null;
}

const columns: Column<Row>[] = [
  { key: 'name', label: 'Name', sortValue: (row) => row.name, render: (row) => row.name },
  { key: 'size', label: 'Size', sortValue: (row) => row.size, render: (row) => row.size },
  { key: 'actions', label: 'Actions', render: () => null },
];

const rows: Row[] = [
  { name: 'item-10', size: 3 },
  { name: 'item-2', size: null },
  { name: 'Item-1', size: 1 },
];

describe('compareSortValues', () => {
  it('sorts missing values last regardless of the other operand', () => {
    expect(compareSortValues(null, 'a')).toBe(1);
    expect(compareSortValues(undefined, 'a')).toBe(1);
    expect(compareSortValues('a', null)).toBe(-1);
    expect(compareSortValues('a', undefined)).toBe(-1);
  });

  it('treats two missing values as equal', () => {
    expect(compareSortValues(null, undefined)).toBe(0);
    expect(compareSortValues(null, null)).toBe(0);
  });

  it('compares numbers numerically', () => {
    expect(compareSortValues(2, 10)).toBeLessThan(0);
    expect(compareSortValues(10, 2)).toBeGreaterThan(0);
    expect(compareSortValues(5, 5)).toBe(0);
  });

  it('compares strings case-insensitively with numeric awareness', () => {
    expect(compareSortValues('item-2', 'item-10')).toBeLessThan(0);
    expect(compareSortValues('Item-1', 'item-1')).toBe(0);
  });
});

describe('sortItems', () => {
  it('returns the input untouched when there is no sort state', () => {
    expect(sortItems(rows, columns, null)).toBe(rows);
  });

  it('returns the input untouched for a column without sortValue', () => {
    expect(sortItems(rows, columns, { key: 'actions', direction: 'asc' })).toBe(rows);
  });

  it('returns the input untouched for an unknown column', () => {
    expect(sortItems(rows, columns, { key: 'nope', direction: 'asc' })).toBe(rows);
  });

  it('sorts ascending without mutating the source array', () => {
    const sorted = sortItems(rows, columns, { key: 'name', direction: 'asc' });
    expect(sorted.map((row) => row.name)).toEqual(['Item-1', 'item-2', 'item-10']);
    expect(rows.map((row) => row.name)).toEqual(['item-10', 'item-2', 'Item-1']);
  });

  it('reverses the order when descending', () => {
    const sorted = sortItems(rows, columns, { key: 'name', direction: 'desc' });
    expect(sorted.map((row) => row.name)).toEqual(['item-10', 'item-2', 'Item-1']);
  });

  it('keeps nulls last even when descending', () => {
    const sorted = sortItems(rows, columns, { key: 'size', direction: 'desc' });
    expect(sorted.map((row) => row.size)).toEqual([3, 1, null]);
  });
});

describe('nextSortState', () => {
  it('starts a new column ascending', () => {
    expect(nextSortState(null, 'name')).toEqual({ key: 'name', direction: 'asc' });
    expect(nextSortState({ key: 'size', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });

  it('cycles ascending to descending to unsorted', () => {
    const asc = nextSortState(null, 'name');
    expect(asc).toEqual({ key: 'name', direction: 'asc' });
    const desc = nextSortState(asc, 'name');
    expect(desc).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSortState(desc, 'name')).toBeNull();
  });
});
