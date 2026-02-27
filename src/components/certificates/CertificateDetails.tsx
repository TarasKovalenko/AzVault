import {
  Badge,
  Button,
  Field,
  makeStyles,
  mergeClasses,
  Text,
  tokens,
} from '@fluentui/react-components';
import { Certificate24Regular, Copy24Regular, Dismiss24Regular } from '@fluentui/react-icons';
import { differenceInDays, format } from 'date-fns';
import { useState } from 'react';
import type { CertificateItem } from '../../types';

const useStyles = makeStyles({
  root: {
    height: '100%',
    overflow: 'auto',
    padding: '16px 20px',
  },
  emptyRoot: {
    height: '100%',
  },
  emptyIcon: {
    fontSize: '36px',
    opacity: 0.3,
  },
  emptyTitle: {
    color: tokens.colorNeutralForeground3,
  },
  emptySubtitle: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '240px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  statusBadges: {
    display: 'flex',
    gap: '6px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  warningBox: {
    padding: '8px 12px',
    borderRadius: '4px',
    background: tokens.colorPaletteYellowBackground1,
    marginBottom: '12px',
  },
  warningText: {
    color: tokens.colorPaletteYellowForeground1,
  },
  metaSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  thumbprintRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  thumbprintText: {
    wordBreak: 'break-all',
    fontSize: '11px',
  },
  copyButton: {
    flexShrink: 0,
  },
  tagsRow: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  metaValue: {
    wordBreak: 'break-all',
    fontSize: '12px',
  },
});

interface CertificateDetailsProps {
  item: CertificateItem | null;
  onClose: () => void;
}

export function CertificateDetails({ item, onClose }: CertificateDetailsProps) {
  const classes = useStyles();
  const [copiedThumb, setCopiedThumb] = useState(false);

  if (!item) {
    return (
      <div className={mergeClasses('azv-empty', classes.emptyRoot)}>
        <Certificate24Regular className={classes.emptyIcon} />
        <Text size={300} weight="semibold" className={classes.emptyTitle}>
          No certificate selected
        </Text>
        <Text size={200} className={classes.emptySubtitle}>
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
    <div className={classes.root}>
      <div className={classes.header}>
        <Text weight="semibold" size={400} className="azv-mono">
          {item.name}
        </Text>
        <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
      </div>

      <div className={classes.statusBadges}>
        <div className={classes.statusRow}>
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
        <div className={classes.warningBox}>
          <Text size={200} className={classes.warningText}>
            This certificate expires in {daysUntilExpiry} days. Consider renewing it.
          </Text>
        </div>
      )}

      <div className={classes.metaSection}>
        <MetaField label="Name" value={item.name} mono />
        <MetaField label="Version" value={extractVersion(item.id)} mono />
        <MetaField label="Subject" value={item.subject || '—'} />
        <Field label="Thumbprint">
          <div className={classes.thumbprintRow}>
            <Text size={200} font="monospace" className={classes.thumbprintText}>
              {item.thumbprint || '—'}
            </Text>
            {item.thumbprint && (
              <Button
                appearance="subtle"
                size="small"
                icon={<Copy24Regular />}
                onClick={handleCopyThumbprint}
                title={copiedThumb ? 'Copied!' : 'Copy thumbprint'}
                className={classes.copyButton}
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
            <div className={classes.tagsRow}>
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
  const classes = useStyles();
  return (
    <Field label={label}>
      <Text size={200} font={mono ? 'monospace' : undefined} className={classes.metaValue}>
        {value}
      </Text>
    </Field>
  );
}
