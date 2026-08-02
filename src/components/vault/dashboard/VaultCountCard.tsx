import { Icon, type IconName } from '../../ui/Icon';

export function VaultCountCard({
  icon,
  label,
  count,
  loading,
  onClick,
}: {
  icon: IconName;
  label: string;
  count?: number;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mac-panel group flex items-center gap-3 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Icon name={icon} size={20} />
      </span>
      <span>
        <strong className="mono block text-xl">{loading ? '…' : (count ?? '—')}</strong>
        <span className="text-xs text-[var(--text-secondary)]">{label}</span>
      </span>
      <Icon
        name="arrow-right"
        size={15}
        className="ml-auto text-[var(--text-tertiary)] transition group-hover:translate-x-0.5"
      />
    </button>
  );
}
