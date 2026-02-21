import {
  Badge,
  Button,
  Divider,
  Field,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular, LockClosed24Regular } from '@fluentui/react-icons';
import { format } from 'date-fns';
import type { KeyItem } from '../../types';

const useStyles = makeStyles({
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
  emptyDescription: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '240px',
    textAlign: 'center',
    lineHeight: 1.5,
  },
  contentRoot: {
    height: '100%',
    overflow: 'auto',
    padding: '16px 20px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  badgesRow: {
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
  fieldsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  badgesWrap: {
    display: 'flex',
    gap: '4px',
    flexWrap: 'wrap',
    marginTop: '4px',
  },
  divider: {
    margin: '16px 0',
  },
  infoBox: {
    padding: '12px 14px',
    borderRadius: '6px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    background: tokens.colorNeutralBackground3,
  },
  infoText: {
    color: tokens.colorNeutralForeground3,
  },
  metaFieldValue: {
    wordBreak: 'break-all',
    fontSize: '12px',
  },
});

interface KeyDetailsProps {
  item: KeyItem | null;
  onClose: () => void;
}

export function KeyDetails({ item, onClose }: KeyDetailsProps) {
  const classes = useStyles();

  if (!item) {
    return (
      <div className={`azv-empty ${classes.emptyRoot}`}>
        <LockClosed24Regular className={classes.emptyIcon} />
        <Text size={300} weight="semibold" className={classes.emptyTitle}>
          No key selected
        </Text>
        <Text size={200} className={classes.emptyDescription}>
          Click a row in the table to view key properties, allowed operations, and expiration info.
        </Text>
      </div>
    );
  }

  const extractVersion = (id: string): string => {
    const parts = id.split('/');
    const idx = parts.indexOf('keys');
    return idx >= 0 ? parts[idx + 2] || '—' : '—';
  };

  return (
    <div className={classes.contentRoot}>
      <div className={classes.header}>
        <Text weight="semibold" size={400} className="azv-mono">
          {item.name}
        </Text>
        <Button appearance="subtle" size="small" icon={<Dismiss24Regular />} onClick={onClose} />
      </div>

      <div className={classes.badgesRow}>
        <div className={classes.statusRow}>
          <span
            className="azv-status-dot"
            style={{ background: item.enabled ? 'var(--azv-success)' : 'var(--azv-danger)' }}
          />
          <Text size={200}>{item.enabled ? 'Active' : 'Disabled'}</Text>
        </div>
        {item.managed && (
          <Badge appearance="outline" color="informative" size="small">
            Managed
          </Badge>
        )}
        {item.keyType && (
          <Badge appearance="outline" size="small">
            {item.keyType}
          </Badge>
        )}
      </div>

      <div className={classes.fieldsContainer}>
        <MetaField label="Name" value={item.name} mono />
        <MetaField label="Version" value={extractVersion(item.id)} mono />
        <MetaField label="Key Type" value={item.keyType || '—'} />
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

        {item.keyOps && item.keyOps.length > 0 && (
          <Field label="Operations">
            <div className={classes.badgesWrap}>
              {item.keyOps.map((op) => (
                <Badge key={op} size="small" appearance="outline" color="informative">
                  {op}
                </Badge>
              ))}
            </div>
          </Field>
        )}

        {item.tags && Object.keys(item.tags).length > 0 && (
          <Field label="Tags">
            <div className={classes.badgesWrap}>
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

      <Divider className={classes.divider} />

      <div className={classes.infoBox}>
        <Text size={200} className={classes.infoText}>
          Key private material cannot be exported through the data plane API.
        </Text>
      </div>
    </div>
  );
}

function MetaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const classes = useStyles();
  return (
    <Field label={label}>
      <Text
        size={200}
        font={mono ? 'monospace' : undefined}
        className={classes.metaFieldValue}
      >
        {value}
      </Text>
    </Field>
  );
}
