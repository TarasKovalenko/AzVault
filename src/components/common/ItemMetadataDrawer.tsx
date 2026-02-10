/**
 * ItemMetadataDrawer.tsx – Generic metadata side panel.
 *
 * Used by Keys and Certificates lists to display item details
 * in a consistent drawer format with tags support.
 */

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
          action={
            <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} />
          }
        >
          <span className="azv-mono">{title}</span>
        </DrawerHeaderTitle>
      </DrawerHeader>

      <DrawerBody style={{ padding: '0 24px 24px' }}>
        {/* Enabled/disabled indicator */}
        {typeof enabled === 'boolean' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
            <span
              className="azv-status-dot"
              style={{
                background: enabled ? 'var(--azv-success)' : 'var(--azv-danger)',
              }}
            />
            <Text size={200}>{enabled ? 'Active' : 'Disabled'}</Text>
          </div>
        )}

        {/* Dynamic metadata fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(metadata).map(([label, value]) => (
            <Field key={label} label={label}>
              <Text
                size={200}
                style={{
                  wordBreak: 'break-all',
                  color: tokens.colorNeutralForeground1,
                  fontSize: 12,
                }}
                font={label.toLowerCase().includes('id') ? 'monospace' : undefined}
              >
                {value === null || value === undefined || value === ''
                  ? '—'
                  : String(value)}
              </Text>
            </Field>
          ))}

          {/* Tags */}
          {tags && Object.keys(tags).length > 0 && (
            <Field label="Tags">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {Object.entries(tags).map(([k, v]) => (
                  <Badge
                    key={k}
                    appearance="outline"
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
      </DrawerBody>
    </OverlayDrawer>
  );
}
