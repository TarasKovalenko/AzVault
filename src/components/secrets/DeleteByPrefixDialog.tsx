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
  mergeClasses,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { Warning24Regular } from '@fluentui/react-icons';
import { useEffect, useMemo, useState } from 'react';
import type { SecretItem } from '../../types';
import { filterSecretsByPrefix } from './secretsBulkDeleteLogic';

interface DeleteByPrefixDialogProps {
  open: boolean;
  allSecrets: SecretItem[];
  vaultUri: string;
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
  onCompleted: (deletedIds: string[]) => void;
}

const useStyles = makeStyles({
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    paddingTop: '4px',
  },
  monoInput: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '12px',
  },
  matchSection: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '6px',
    padding: '8px 10px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  matchItem: {
    padding: '2px 0',
  },
  noMatch: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
  confirmSection: {
    marginTop: '2px',
  },
  confirmInput: {
    marginTop: '6px',
    width: '100%',
  },
  progressRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  errorBox: {
    padding: '8px',
    borderRadius: '4px',
    background: tokens.colorPaletteRedBackground1,
    color: tokens.colorPaletteRedForeground1,
    fontSize: '12px',
  },
  dangerBtn: {
    backgroundColor: tokens.colorPaletteRedBackground3,
  },
  matchCount: {
    color: tokens.colorPaletteRedForeground1,
    fontWeight: 600,
  },
  matchCountSafe: {
    color: tokens.colorNeutralForeground3,
  },
});

export function DeleteByPrefixDialog({
  open,
  allSecrets,
  vaultUri,
  onDelete,
  onClose,
  onCompleted,
}: DeleteByPrefixDialogProps) {
  const classes = useStyles();
  const [prefix, setPrefix] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ total: 0, completed: 0, failed: 0 });

  const matchingSecrets = useMemo(
    () => filterSecretsByPrefix(allSecrets, prefix),
    [allSecrets, prefix],
  );

  const confirmValid = confirmInput.trim() === 'delete' && matchingSecrets.length > 0;

  useEffect(() => {
    if (!open) {
      setPrefix('');
      setConfirmInput('');
      setError(null);
      setProgress({ total: 0, completed: 0, failed: 0 });
    }
  }, [open]);

  const handleDelete = async () => {
    if (!vaultUri || matchingSecrets.length === 0) return;

    const total = matchingSecrets.length;
    setLoading(true);
    setError(null);
    setProgress({ total, completed: 0, failed: 0 });

    try {
      const results = await Promise.all(
        matchingSecrets.map(async (item) => {
          try {
            await onDelete(item.name);
            return { id: item.id, ok: true } as const;
          } catch {
            return { id: item.id, ok: false } as const;
          } finally {
            setProgress((prev) => ({
              ...prev,
              completed: prev.completed + 1,
            }));
          }
        }),
      );

      const succeededIds = results.filter((r) => r.ok).map((r) => r.id);
      const failedCount = results.filter((r) => !r.ok).length;

      setProgress((prev) => ({ ...prev, failed: failedCount }));

      if (failedCount > 0) {
        setError(`${failedCount} secret(s) failed to delete. Check permissions.`);
      } else {
        onClose();
      }

      onCompleted(succeededIds);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(_, d) => {
        if (!d.open && !loading) onClose();
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>
            <div className={classes.titleRow}>
              <Warning24Regular style={{ color: 'var(--azv-warning)' }} />
              Delete Secrets by Prefix
            </div>
          </DialogTitle>
          <DialogContent>
            <div className={classes.form}>
              <Text size={200}>
                Enter a prefix to match secrets for deletion. All secrets whose names start with the
                prefix will be soft-deleted.
              </Text>

              <Input
                value={prefix}
                onChange={(_, d) => setPrefix(d.value)}
                placeholder="e.g. staging-"
                disabled={loading}
                className={classes.monoInput}
                autoFocus
              />

              <Text size={200}>
                <span>Matching secrets: </span>
                <span
                  className={
                    matchingSecrets.length > 0 ? classes.matchCount : classes.matchCountSafe
                  }
                >
                  {matchingSecrets.length}
                </span>
              </Text>

              {prefix.length > 0 && (
                <div className={classes.matchSection}>
                  {matchingSecrets.length === 0 ? (
                    <Text size={200} className={classes.noMatch}>
                      No secrets match this prefix.
                    </Text>
                  ) : (
                    matchingSecrets.map((item) => (
                      <div key={item.id} className={classes.matchItem}>
                        <Text size={200} className="azv-mono">
                          {item.name}
                        </Text>
                      </div>
                    ))
                  )}
                </div>
              )}

              {matchingSecrets.length > 0 && (
                <div className={classes.confirmSection}>
                  <Text size={200}>
                    Type <strong className="azv-mono">delete</strong> to confirm:
                  </Text>
                  <Input
                    value={confirmInput}
                    onChange={(_, d) => setConfirmInput(d.value)}
                    placeholder="delete"
                    disabled={loading}
                    className={classes.confirmInput}
                  />
                </div>
              )}

              {loading && (
                <div className={classes.progressRow}>
                  <Spinner size="tiny" />
                  <Text size={200}>
                    Deleting {progress.completed} / {progress.total}
                    {progress.failed > 0 ? ` (failed: ${progress.failed})` : ''}
                  </Text>
                </div>
              )}

              {error && <div className={classes.errorBox}>{error}</div>}
            </div>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              appearance="primary"
              onClick={handleDelete}
              disabled={loading || !confirmValid}
              className={mergeClasses(confirmValid ? classes.dangerBtn : undefined)}
            >
              {loading ? (
                <Spinner size="tiny" />
              ) : (
                `Delete ${matchingSecrets.length} Secret${matchingSecrets.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
