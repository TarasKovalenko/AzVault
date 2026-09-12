import { describe, expect, it } from 'vitest';
import { fuzzyFilter, fuzzyMatch } from './fuzzyMatch';

describe('fuzzyMatch', () => {
  it('scores an empty query as a neutral match', () => {
    expect(fuzzyMatch('', 'Go to Secrets')).toBe(1);
  });

  it('scores substring matches above scattered matches', () => {
    expect(fuzzyMatch('secrets', 'go to secrets')).toBeGreaterThan(2);
    expect(fuzzyMatch('gts', 'go to secrets')).toBeLessThan(2);
  });

  it('prefers a tighter substring match', () => {
    expect(fuzzyMatch('secret', 'secret')).toBeGreaterThan(fuzzyMatch('secret', 'secret value'));
  });

  it('ignores case', () => {
    expect(fuzzyMatch('SECRETS', 'Go To Secrets')).toBe(fuzzyMatch('secrets', 'go to secrets'));
  });

  it('rewards consecutive scattered characters', () => {
    expect(fuzzyMatch('ol', 'x o l')).toBeLessThan(fuzzyMatch('ol', 'x ol'));
  });

  it('returns 0 when not every query character appears in order', () => {
    expect(fuzzyMatch('zzz', 'go to secrets')).toBe(0);
    expect(fuzzyMatch('st', 'ts')).toBe(0);
  });
});

describe('fuzzyFilter', () => {
  const items = ['Go to Secrets', 'Go to Keys', 'Open Settings'];
  const text = (value: string) => value;

  it('returns everything untouched for a blank query', () => {
    expect(fuzzyFilter(items, '   ', text).map((result) => result.item)).toEqual(items);
    expect(fuzzyFilter(items, '', text).every((result) => result.score === 1)).toBe(true);
  });

  it('drops non-matching items and sorts by descending score', () => {
    const results = fuzzyFilter(items, 'set', text);
    expect(results[0].item).toBe('Open Settings');
    expect(results.map((result) => result.item)).not.toContain('Go to Keys');
  });

  it('returns an empty list when nothing matches', () => {
    expect(fuzzyFilter(items, 'qqqq', text)).toEqual([]);
  });
});
