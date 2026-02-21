import { Badge, Button, Field, Text, tokens } from '@fluentui/react-components';
import { Certificate24Regular, Copy24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { differenceInDays, format } from 'date-fns';
import { useState } from 'react';
import type { CertificateItem } from '../../types';

interface CertificateDetailsProps {
  item: CertificateItem | null;
  onClose: () => void;
}

export function CertificateDetails({ item, onClose }: CertificateDetailsProps) {
  const [copiedThumb, setCopiedThumb] = useState(false);

  if (!item) {
    return (
      <div className="azv-empty" style={{ height: '100%' }}>
        <Certificate24Regular style={{ fontSize: 36, opacity: 0.3 }} />
        <Text size={300} weight="semibold" style={{ color: tokens.colorNeutralForeground3 }}>
          No certificate selected
        </Text>
        <Text
          size={200}
          style={{
            color: tokens.colorNeutralForeground3,
            maxWidth: 240,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Click a row in the table to view certificate details, thumbprint, and expiration info.
        </Text>
      </div>
    );
  }

  const extractVersion = (id: string): string => {
    const parts = id.split('/');
    const idx = parts.indexOf('certificates');
    return idx >= 0 ? parts[idx + 2] || '—' : '—';
  };

  const daysUntilExpiry = item.expires
    ? differenceInDays(new Date(item.expires), new Date())
    : null;
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry <= 0;

  const handleCopyThumbprint = () => {
    if (!item.thumbprint) return;
    navigator.clipboard.writeText(item.thumbprint);
    setCopiedThumb(true);
    setTimeout(() => setCopiedThumb(false), 2000);
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '16px 20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Text weight="semibold" size={400} className="azv-mono">
          {item.name}
        </Text>
        <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="azv-status-dot"
            style={{ background: item.enabled ? 'var(--azv-success)' : 'var(--azv-danger)' }}
          />
          <Text size={200}>{item.enabled ? 'Active' : 'Disabled'}</Text>
        </div>
        {isExpired && (
          <Badge appearance="filled" color="danger" size="small">
            Expired
          </Badge>
        )}
        {isExpiringSoon && (
          <Badge appearance="filled" color="warning" size="small">
            Expires in {daysUntilExpiry}d
          </Badge>
        )}
      </div>

      {isExpiringSoon && (
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 4,
            background: tokens.colorPaletteYellowBackground1,
            marginBottom: 12,
          }}
        >
          <Text size={200} style={{ color: tokens.colorPaletteYellowForeground1 }}>
            This certificate expires in {daysUntilExpiry} days. Consider renewing it.
          </Text>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <MetaField label="Name" value={item.name} mono />
        <MetaField label="Version" value={extractVersion(item.id)} mono />
        <MetaField label="Subject" value={item.subject || '—'} />
        <Field label="Thumbprint">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Text size={200} font="monospace" style={{ wordBreak: 'break-all', fontSize: 11 }}>
              {item.thumbprint || '—'}
            </Text>
            {item.thumbprint && (
              <Button
                appearance="subtle"
                size="small"
                icon={<Copy24Regular />}
                onClick={handleCopyThumbprint}
                title={copiedThumb ? 'Copied!' : 'Copy thumbprint'}
                style={{ flexShrink: 0 }}
              />
            )}
          </div>
        </Field>
        <MetaField
          label="Created"
          value={item.created ? format(new Date(item.created), 'PPpp') : '—'}
        />
        <MetaField
          label="Updated"
          value={item.updated ? format(new Date(item.updated), 'PPpp') : '—'}
        />
        <MetaField
          label="Expires"
          value={item.expires ? format(new Date(item.expires), 'PPpp') : 'Never'}
        />
        <MetaField
          label="Not Before"
          value={item.notBefore ? format(new Date(item.notBefore), 'PPpp') : '—'}
        />
        <MetaField label="ID" value={item.id} mono />

        {item.tags && Object.keys(item.tags).length > 0 && (
          <Field label="Tags">
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
              {Object.entries(item.tags).map(([k, v]) => (
                <Badge
                  key={k}
                  appearance="outline"
                  size="medium"
                  className="azv-tag-pill"
                  title={`${k}: ${v}`}
                >
                  <span className="azv-tag-text">
                    {k}: {v}
                  </span>
                </Badge>
              ))}
            </div>
          </Field>
        )}
      </div>
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Field label={label}>
      <Text
        size={200}
        font={mono ? 'monospace' : undefined}
        style={{ wordBreak: 'break-all', fontSize: 12 }}
      >
        {value}
      </Text>
    </Field>
  );
}
