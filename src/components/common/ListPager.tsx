import { Button } from '../ui/Button';

export const PAGE_SIZE = 50;

/**
 * Footer control for incrementally revealing long lists. Renders nothing once
 * everything is on screen, and always states how much is left.
 */
export function ListPager({
  shown,
  total,
  step = PAGE_SIZE,
  onShowMore,
}: {
  shown: number;
  total: number;
  step?: number;
  onShowMore: () => void;
}) {
  const remaining = total - shown;
  if (remaining <= 0) return null;
  return (
    <div className="flex items-center justify-center gap-3 p-3">
      <Button size="sm" onClick={onShowMore}>
        Show {Math.min(step, remaining)} more
      </Button>
      <span className="mono text-[11px] text-[var(--text-tertiary)]">
        {shown} of {total}
      </span>
    </div>
  );
}
