import { differenceInDays, format } from 'date-fns';
import { useState } from 'react';
import type { CertificateItem } from '../../types';
import { DetailField } from '../common/DetailField';
import { EmptyState } from '../common/EmptyState';
import { Badge } from '../ui/Badge';
import { Icon } from '../ui/Icon';

export function CertificateDetails({
  item,
  onClose,
}: {
  item: CertificateItem | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!item)
    return (
      <EmptyState
        icon={<Icon name="certificate" />}
        title="No certificate selected"
        description="Select a row to inspect certificate details and expiration."
      />
    );
  const parts = item.id.split('/');
  const index = parts.indexOf('certificates');
  const version = index >= 0 ? parts[index + 2] || '—' : '—';
  const days = item.expires ? differenceInDays(new Date(item.expires), new Date()) : null;
  const expiring = days !== null && days > 0 && days <= 30;
  const expired = days !== null && days <= 0;
  const copyThumbprint = () => {
    if (!item.thumbprint) return;
    void navigator.clipboard.writeText(item.thumbprint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
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
        {expired && <Badge tone="red">Expired</Badge>}
        {expiring && <Badge tone="orange">Expires in {days}d</Badge>}
      </div>
      {expiring && (
        <div className="mb-3 rounded-xl bg-orange-500/10 p-3 text-xs text-[var(--warning)]">
          This certificate expires in {days} days. Consider renewing it.
        </div>
      )}
      <dl>
        <DetailField label="Name" value={item.name} mono />
        <DetailField label="Version" value={version} mono />
        <DetailField label="Subject" value={item.subject || '—'} />
        <DetailField label="Thumbprint">
          <div className="flex items-center gap-2">
            <span className="mono min-w-0 flex-1 break-all text-[11px]">
              {item.thumbprint || '—'}
            </span>
            {item.thumbprint && (
              <button
                type="button"
                title={copied ? 'Copied' : 'Copy thumbprint'}
                onClick={copyThumbprint}
                className="grid size-7 shrink-0 place-items-center rounded-lg hover:bg-[var(--surface-hover)]"
              >
                <Icon name={copied ? 'check' : 'copy'} size={14} />
              </button>
            )}
          </div>
        </DetailField>
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
        {item.tags && Object.keys(item.tags).length ? (
          <DetailField label="Tags">
            <div className="flex flex-wrap gap-1">
              {Object.entries(item.tags).map(([key, value]) => (
                <Badge key={key}>
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </DetailField>
        ) : null}
      </dl>
    </div>
  );
}
