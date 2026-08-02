import { format } from 'date-fns';
import type { KeyItem } from '../../types';
import { DetailField } from '../common/DetailField';
import { EmptyState } from '../common/EmptyState';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';

export function KeyDetails({ item, onClose }: { item: KeyItem | null; onClose: () => void }) {
  if (!item)
    return (
      <EmptyState
        icon={<Icon name="key" />}
        title="No key selected"
        description="Select a row to inspect key properties and allowed operations."
      />
    );
  const parts = item.id.split('/');
  const index = parts.indexOf('keys');
  const version = index >= 0 ? parts[index + 2] || '—' : '—';
  return (
    <div className="h-full overflow-auto p-5">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="mono truncate text-[15px] font-semibold">{item.name}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="grid size-7 place-items-center rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)]"
        >
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span
            className={`size-1.5 rounded-full ${item.enabled ? 'bg-[var(--success)]' : 'bg-[var(--text-tertiary)]'}`}
          />
          {item.enabled ? 'Active' : 'Disabled'}
        </span>
        {item.managed && <Badge tone="blue">Managed</Badge>}
        {item.keyType && <Badge>{item.keyType}</Badge>}
      </div>
      <dl>
        <DetailField label="Name" value={item.name} mono />
        <DetailField label="Version" value={version} mono />
        <DetailField label="Key Type" value={item.keyType || '—'} />
        <DetailField
          label="Created"
          value={item.created ? format(new Date(item.created), 'PPpp') : '—'}
        />
        <DetailField
          label="Updated"
          value={item.updated ? format(new Date(item.updated), 'PPpp') : '—'}
        />
        <DetailField
          label="Expires"
          value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
        />
        <DetailField
          label="Not Before"
          value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '—'}
        />
        <DetailField label="ID" value={item.id} mono />
        {item.keyOps?.length ? (
          <DetailField label="Operations">
            <div className="flex flex-wrap gap-1">
              {item.keyOps.map((operation) => (
                <Badge key={operation} tone="blue">
                  {operation}
                </Badge>
              ))}
            </div>
          </DetailField>
        ) : null}
        {item.tags && Object.keys(item.tags).length ? (
          <DetailField label="Tags">
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.tags).map(([key, value]) => (
                <Badge key={key} title={`${key}: ${value}`}>
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </DetailField>
        ) : null}
      </dl>
      <div className="mt-5 rounded-xl bg-[var(--surface-muted)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
        Key private material cannot be exported through the data plane API.
      </div>
    </div>
  );
}
