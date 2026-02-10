import {
  DrawerBody,
  DrawerHeader,
  DrawerHeaderTitle,
  OverlayDrawer,
  Button,
  Text,
  Badge,
  Field,
  tokens,
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';

interface ItemMetadataDrawerProps {
  title: string;
  open: boolean;
  onClose: () => void;
  metadata: Record<string, string | boolean | null | undefined>;
  tags?: Record<string, string> | null;
  enabled?: boolean;
}

export function ItemMetadataDrawer({
  title,
  open,
  onClose,
  metadata,
  tags,
  enabled,
}: ItemMetadataDrawerProps) {
  return (
    <OverlayDrawer
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open) onClose();
      }}
      position="end"
      size="medium"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={<Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />}
        >
          {title}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody style={{ padding: '0 24px 24px' }}>
        {typeof enabled === 'boolean' && (
          <div style={{ marginBottom: 16 }}>
            <Badge appearance="filled" color={enabled ? 'success' : 'danger'}>
              {enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(metadata).map(([label, value]) => (
            <Field key={label} label={label}>
              <Text
                size={200}
                style={{ wordBreak: 'break-all', color: tokens.colorNeutralForeground1 }}
                font={label.toLowerCase().includes('id') ? 'monospace' : undefined}
              >
                {value === null || value === undefined || value === '' ? '-' : String(value)}
              </Text>
            </Field>
          ))}

          {tags && Object.keys(tags).length > 0 && (
            <Field label="Tags">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {Object.entries(tags).map(([k, v]) => (
                  <Badge key={k} appearance="outline" className="azv-tag-pill" title={`${k}: ${v}`}>
                    <span className="azv-tag-text">{k}: {v}</span>
                  </Badge>
                ))}
              </div>
            </Field>
          )}
        </div>
      </DrawerBody>
    </OverlayDrawer>
  );
}
