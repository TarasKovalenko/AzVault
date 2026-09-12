import type { Column } from './ItemTable';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  key: string;
  direction: SortDirection;
}

export type SortValue = string | number | null | undefined;

export function compareSortValues(a: SortValue, b: SortValue): number {
  // Missing values always sort last, whichever direction is active.
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortItems<T>(items: T[], columns: Column<T>[], sort: SortState | null): T[] {
  if (!sort) return items;
  const column = columns.find((candidate) => candidate.key === sort.key);
  if (!column?.sortValue) return items;
  const { sortValue } = column;
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const left = sortValue(a);
    const right = sortValue(b);
    const result = compareSortValues(left, right);
    // Missing values stay pinned to the bottom in both directions.
    if (left === null || left === undefined || right === null || right === undefined) return result;
    // Keep unsortable ties in their original (server) order.
    return result === 0 ? 0 : result * factor;
  });
}

/** Cycles a column through ascending → descending → unsorted. */
export function nextSortState(current: SortState | null, key: string): SortState | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}
