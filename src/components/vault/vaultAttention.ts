import type { CertificateItem, ItemTab, KeyItem, SecretItem } from '../../types';
import type { AttentionItem } from './dashboard/AttentionCard';

export const EXPIRY_WARNING_DAYS = 30;
const DAY_MS = 86_400_000;

type VaultItem = Pick<
  SecretItem | KeyItem | CertificateItem,
  'id' | 'name' | 'enabled' | 'expires'
>;

export interface AttentionSource {
  items: readonly VaultItem[];
  /** Singular, human-readable resource label, e.g. "Secret". */
  type: string;
  tab: ItemTab;
}

export function daysUntil(expires: string | null, now: number = Date.now()): number | null {
  if (!expires) return null;
  const timestamp = new Date(expires).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.ceil((timestamp - now) / DAY_MS);
}

function reasonFor(item: VaultItem, days: number | null): string | null {
  if (!item.enabled) return 'Disabled';
  if (days === null) return null;
  // Anything already past its expiry reads as expired. `days <= 0` also catches
  // the -0 that Math.ceil returns for the final 24 hours, which would otherwise
  // render as "0d left" for an item that is already dead.
  if (days <= 0) return 'Expired';
  if (days <= EXPIRY_WARNING_DAYS) return `${days}d left`;
  return null;
}

/**
 * Items an operator should look at: disabled, expired, or expiring within the
 * warning window. Most urgent first; disabled-but-never-expiring items sort last.
 */
export function collectAttentionItems(
  sources: readonly AttentionSource[],
  now: number = Date.now(),
): AttentionItem[] {
  return sources
    .flatMap((source) =>
      source.items.flatMap((item) => {
        const days = daysUntil(item.expires, now);
        const reason = reasonFor(item, days);
        if (!reason) return [];
        return [{ id: item.id, name: item.name, type: source.type, tab: source.tab, reason, days }];
      }),
    )
    .sort((a, b) => (a.days ?? Number.MAX_SAFE_INTEGER) - (b.days ?? Number.MAX_SAFE_INTEGER));
}
