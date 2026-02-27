import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  makeStyles,
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

const useStyles = makeStyles({
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  criticalBanner: {
    padding: '8px 12px',
    borderRadius: '4px',
    backgroundColor: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    marginBottom: '12px',
    fontSize: '12px',
    fontWeight: 600,
  },
  descriptionText: {
    lineHeight: 1.5,
  },
  confirmSection: {
    marginTop: '14px',
  },
  confirmInput: {
    marginTop: '6px',
    width: '100%',
  },
  dangerBtn: {
    backgroundColor: tokens.colorPaletteRedBackground3,
  },
});

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
  const classes = useStyles();

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
            <div className={classes.titleRow}>
              <Warning24Regular
                style={{ color: isCritical ? 'var(--azv-danger)' : 'var(--azv-warning)' }}
              />
              {title}
            </div>
          </DialogTitle>
          <DialogContent>
            {isCritical && (
              <div className={classes.criticalBanner}>This action is irreversible.</div>
            )}

            <Text size={200} className={classes.descriptionText}>
              {description}
            </Text>

            {children}

            <div className={classes.confirmSection}>
              <Text size={200}>
                Type <strong className="azv-mono">{confirmText}</strong> to confirm:
              </Text>
              <Input
                value={input}
                onChange={(_, d) => setInput(d.value)}
                placeholder={confirmText}
                disabled={loading}
                className={classes.confirmInput}
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
              className={classes.dangerBtn}
            >
              {loading ? <Spinner size="tiny" /> : confirmLabel || title}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
