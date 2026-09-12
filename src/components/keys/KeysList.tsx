import { listKeys } from '../../services/tauri';
import type { KeyItem } from '../../types';
import type { Column } from '../common/ItemTable';
import { renderDate, renderEnabled, renderExpiry, renderName } from '../common/ItemTable';
import { VaultItemsList } from '../common/VaultItemsList';
import { Badge } from '../ui/Badge';
import { KeyDetails } from './KeyDetails';

const columns: Column<KeyItem>[] = [
  { key: 'name', label: 'Name', width: '25%', sortValue: (item) => item.name, render: renderName },
  {
    key: 'enabled',
    label: 'Status',
    width: '10%',
    sortValue: (item) => Number(item.enabled),
    render: (item) => renderEnabled(item.enabled),
  },
  {
    key: 'keyType',
    label: 'Type',
    width: '10%',
    sortValue: (item) => item.keyType ?? '',
    render: (item) => <Badge>{item.keyType || '—'}</Badge>,
  },
  {
    key: 'keyOps',
    label: 'Operations',
    width: '25%',
    render: (item) => (
      <div className="flex flex-wrap gap-1">
        {(item.keyOps || []).map((operation) => (
          <Badge key={operation} tone="blue">
            {operation}
          </Badge>
        ))}
      </div>
    ),
  },
  {
    key: 'updated',
    label: 'Updated',
    width: '15%',
    sortValue: (item) => item.updated,
    render: (item) => renderDate(item.updated),
  },
  {
    key: 'expires',
    label: 'Expires',
    width: '15%',
    sortValue: (item) => item.expires,
    render: (item) => renderExpiry(item.expires),
  },
];

export function KeysList() {
  return (
    <VaultItemsList<KeyItem>
      title="Keys"
      noun="keys"
      tab="keys"
      queryKey="keys"
      fetchItems={listKeys}
      columns={columns}
      skeletonColumns={[25, 10, 10, 25, 15, 15]}
      renderDetails={(item, clearSelection) => <KeyDetails item={item} onClose={clearSelection} />}
    />
  );
}
