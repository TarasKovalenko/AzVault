import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { Warning24Regular } from '@fluentui/react-icons';
import { useEffect, useState } from 'react';

interface DangerConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmText: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  dangerLevel?: 'warning' | 'critical';
  children?: React.ReactNode;
}

export function DangerConfirmDialog({
  open,
  title,
  description,
  confirmText,
  confirmLabel,
  onConfirm,
  onCancel,
  loading = false,
  dangerLevel = 'warning',
  children,
}: DangerConfirmDialogProps) {
  const [input, setInput] = useState('');
  const isValid = input.toLowerCase() === confirmText.toLowerCase();

  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  const isCritical = dangerLevel === 'critical';

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open && !loading) onCancel();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Warning24Regular
                style={{ color: isCritical ? 'var(--azv-danger)' : 'var(--azv-warning)' }}
              />
              {title}
            </div>
          </DialogTitle>
          <DialogContent>
            {isCritical && (
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 4,
                  background: tokens.colorPaletteRedBackground1,
                  color: tokens.colorPaletteRedForeground1,
                  marginBottom: 12,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                This action is irreversible.
              </div>
            )}

            <Text size={200} style={{ lineHeight: 1.5 }}>
              {description}
            </Text>

            {children}

            <div style={{ marginTop: 14 }}>
              <Text size={200}>
                Type <strong className="azv-mono">{confirmText}</strong> to confirm:
              </Text>
              <Input
                value={input}
                onChange={(_, d) => setInput(d.value)}
                placeholder={confirmText}
                disabled={loading}
                style={{ marginTop: 6, width: '100%' }}
                autoFocus
              />
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={onConfirm}
              disabled={loading || !isValid}
              style={{
                background: isCritical
                  ? tokens.colorPaletteRedBackground3
                  : tokens.colorPaletteRedBackground3,
              }}
            >
              {loading ? <Spinner size="tiny" /> : confirmLabel || title}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
