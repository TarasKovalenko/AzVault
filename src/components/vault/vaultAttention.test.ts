import { describe, expect, it } from 'vitest';
import { makeKey, makeSecret } from '../../test/fixtures';
import type { AttentionSource } from './vaultAttention';
import { collectAttentionItems, daysUntil, EXPIRY_WARNING_DAYS } from './vaultAttention';

const NOW = Date.parse('2024-06-01T00:00:00Z');
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

describe('daysUntil', () => {
  it('returns null when there is no expiry', () => {
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('returns null for an unparseable date', () => {
    expect(daysUntil('not-a-date', NOW)).toBeNull();
  });

  it('rounds partial days up', () => {
    expect(daysUntil(inDays(1), NOW)).toBe(1);
    expect(daysUntil(new Date(NOW + 90_000_000).toISOString(), NOW)).toBe(2);
  });

  it('returns a negative count for past dates', () => {
    expect(daysUntil(inDays(-3), NOW)).toBe(-3);
  });

  it('returns 0 at the exact expiry moment', () => {
    expect(daysUntil(new Date(NOW).toISOString(), NOW)).toBe(0);
  });
});

describe('collectAttentionItems', () => {
  const sources = (items: AttentionSource['items']): AttentionSource[] => [
    { items, type: 'Secret', tab: 'secrets' },
  ];

  it('ignores healthy items', () => {
    const items = collectAttentionItems(sources([makeSecret({ expires: inDays(90) })]), NOW);
    expect(items).toEqual([]);
  });

  it('ignores enabled items that never expire', () => {
    expect(collectAttentionItems(sources([makeSecret({ expires: null })]), NOW)).toEqual([]);
  });

  it('flags disabled items ahead of their expiry state', () => {
    const [item] = collectAttentionItems(
      sources([makeSecret({ enabled: false, expires: inDays(-5) })]),
      NOW,
    );
    expect(item.reason).toBe('Disabled');
  });

  it('flags expired items', () => {
    const [item] = collectAttentionItems(sources([makeSecret({ expires: inDays(-1) })]), NOW);
    expect(item.reason).toBe('Expired');
    expect(item.days).toBe(-1);
  });

  it('flags an item that expired within the last day as expired, not "0d left"', () => {
    const justExpired = new Date(NOW - 60 * 60 * 1000).toISOString();
    const [item] = collectAttentionItems(sources([makeSecret({ expires: justExpired })]), NOW);
    expect(item.reason).toBe('Expired');
  });

  it('flags an item expiring later today as expired once the timestamp passes', () => {
    const almostGone = new Date(NOW - 1000).toISOString();
    const [item] = collectAttentionItems(sources([makeSecret({ expires: almostGone })]), NOW);
    expect(item.reason).toBe('Expired');
  });

  it('flags items inside the warning window, including the boundary', () => {
    const [item] = collectAttentionItems(
      sources([makeSecret({ expires: inDays(EXPIRY_WARNING_DAYS) })]),
      NOW,
    );
    expect(item.reason).toBe('30d left');
  });

  it('ignores items one day past the warning window', () => {
    expect(
      collectAttentionItems(
        sources([makeSecret({ expires: inDays(EXPIRY_WARNING_DAYS + 1) })]),
        NOW,
      ),
    ).toEqual([]);
  });

  it('carries the resource label and tab from its source', () => {
    const [item] = collectAttentionItems(
      [{ items: [makeKey({ enabled: false })], type: 'Key', tab: 'keys' }],
      NOW,
    );
    expect(item).toMatchObject({ type: 'Key', tab: 'keys', name: 'signing-key' });
  });

  it('sorts most urgent first and puts never-expiring disabled items last', () => {
    const result = collectAttentionItems(
      sources([
        makeSecret({ id: 'soon', name: 'soon', expires: inDays(10) }),
        makeSecret({ id: 'off', name: 'off', enabled: false, expires: null }),
        makeSecret({ id: 'gone', name: 'gone', expires: inDays(-20) }),
      ]),
      NOW,
    );
    expect(result.map((item) => item.name)).toEqual(['gone', 'soon', 'off']);
  });

  it('merges several sources', () => {
    const result = collectAttentionItems(
      [
        { items: [makeSecret({ enabled: false })], type: 'Secret', tab: 'secrets' },
        { items: [makeKey({ enabled: false })], type: 'Key', tab: 'keys' },
      ],
      NOW,
    );
    expect(result).toHaveLength(2);
  });
});
