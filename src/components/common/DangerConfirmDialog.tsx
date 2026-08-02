import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Field';
import { Modal } from '../ui/Modal';

interface DangerConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
  dangerLevel?: 'warning' | 'critical';
  children?: ReactNode;
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
  const valid = input.toLowerCase() === confirmText.toLowerCase();
  useEffect(() => {
    if (!open) setInput('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      closeDisabled={loading}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!valid} loading={loading}>
            {confirmLabel || title}
          </Button>
        </>
      }
    >
      {dangerLevel === 'critical' && (
        <div className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-semibold text-[var(--danger)]">
          This action is irreversible.
        </div>
      )}
      {children}
      <div className="mt-4 grid gap-1.5 text-xs text-[var(--text-secondary)]">
        <span>
          Type <strong className="mono text-[var(--text)]">{confirmText}</strong> to confirm:
        </span>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={confirmText}
          disabled={loading}
          autoFocus
        />
      </div>
    </Modal>
  );
}
