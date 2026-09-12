import { listCertificates } from '../../services/tauri';
import type { CertificateItem } from '../../types';
import type { Column } from '../common/ItemTable';
import { renderDate, renderEnabled, renderExpiry, renderName } from '../common/ItemTable';
import { VaultItemsList } from '../common/VaultItemsList';
import { CertificateDetails } from './CertificateDetails';

const columns: Column<CertificateItem>[] = [
  { key: 'name', label: 'Name', width: '20%', sortValue: (item) => item.name, render: renderName },
  {
    key: 'enabled',
    label: 'Status',
    width: '10%',
    sortValue: (item) => Number(item.enabled),
    render: (item) => renderEnabled(item.enabled),
  },
  {
    key: 'subject',
    label: 'Subject',
    width: '20%',
    sortValue: (item) => item.subject ?? '',
    render: (item) => (
      <span className={`mono ${item.subject ? '' : 'text-[var(--text-tertiary)]'}`}>
        {item.subject || '—'}
      </span>
    ),
  },
  {
    key: 'thumbprint',
    label: 'Thumbprint',
    width: '15%',
    render: (item) => (
      <span
        className="mono block truncate text-[10px] text-[var(--text-secondary)]"
        title={item.thumbprint || undefined}
      >
        {item.thumbprint || '—'}
      </span>
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

export function CertificatesList() {
  return (
    <VaultItemsList<CertificateItem>
      title="Certificates"
      noun="certificates"
      tab="certificates"
      queryKey="certificates"
      fetchItems={listCertificates}
      columns={columns}
      skeletonColumns={[20, 10, 20, 15, 15, 15]}
      renderDetails={(item, clearSelection) => (
        <CertificateDetails item={item} onClose={clearSelection} />
      )}
    />
  );
}
