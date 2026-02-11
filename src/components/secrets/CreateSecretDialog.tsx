/**
 * CreateSecretDialog.tsx – Modal form for creating a new secret.
 *
 * Validates:
 * - Name: required, alphanumeric + dashes only (Azure KV constraint)
 * - Value: required, non-empty
 *
 * Supports optional content type, expiration, and tags.
 * Creating with an existing name creates a new version (Azure KV behaviour).
 */

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Field,
  Input,
  Combobox,
  Option,
  Textarea,
  Switch,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { setSecret } from '../../services/tauri';
import type { CreateSecretRequest } from '../../types';

const CONTENT_TYPE_OPTIONS = [
  'text/plain',
  'application/json',
  'application/octet-stream',
  'application/x-pem-file',
  'application/x-pkcs12',
  'text/csv',
] as const;

interface CreateSecretDialogProps {
  open: boolean;
  vaultUri: string;
  onClose: () => void;
  onCreated: () => void;
  mode?: 'create' | 'edit';
  initialName?: string;
  initialValue?: string;
  initialContentType?: string | null;
  initialEnabled?: boolean | null;
  initialExpires?: string | null;
  initialTags?: Record<string, string> | null;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function tagsToInput(tags: Record<string, string> | null | undefined): string {
  if (!tags) return '';
  return Object.entries(tags)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
}

export function CreateSecretDialog({
  open,
  vaultUri,
  onClose,
  onCreated,
  mode = 'create',
  initialName,
  initialValue,
  initialContentType,
  initialEnabled,
  initialExpires,
  initialTags,
}: CreateSecretDialogProps) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [contentType, setContentType] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [hasExpiration, setHasExpiration] = useState(false);
  const [expires, setExpires] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = mode === 'edit';

  useEffect(() => {
    if (!open) return;
    const initialExpiresLocal = toDatetimeLocal(initialExpires);
    setName(initialName ?? '');
    setValue(initialValue ?? '');
    setContentType(initialContentType ?? '');
    setEnabled(initialEnabled ?? true);
    setHasExpiration(Boolean(initialExpiresLocal));
    setExpires(initialExpiresLocal);
    setTagsInput(tagsToInput(initialTags));
    setError(null);
  }, [
    open,
    initialName,
    initialValue,
    initialContentType,
    initialEnabled,
    initialExpires,
    initialTags,
  ]);

  /** Reset all form fields to defaults. */
  const reset = () => {
    setName('');
    setValue('');
    setContentType('');
    setEnabled(true);
    setHasExpiration(false);
    setExpires('');
    setTagsInput('');
    setError(null);
  };

  /** Validate input and submit the create request. */
  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!value.trim()) {
      setError(isEdit ? 'Value is required when updating a secret.' : 'Value is required.');
      return;
    }

    // Azure Key Vault secret names: alphanumeric and dashes only
    if (!/^[a-zA-Z0-9-]+$/.test(name)) {
      setError('Name may only contain letters, numbers, and dashes.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Parse comma-separated key=value pairs into a tag map
      let tags: Record<string, string> | null = null;
      if (tagsInput.trim()) {
        tags = {};
        for (const pair of tagsInput.split(',')) {
          const [k, v] = pair.split('=').map((s) => s.trim());
          if (k && v) tags[k] = v;
        }
      }

      const request: CreateSecretRequest = {
        name: name.trim(),
        value,
        contentType: contentType.trim() || null,
        enabled,
        expires: hasExpiration && expires ? new Date(expires).toISOString() : null,
        notBefore: null,
        tags,
      };

      await setSecret(vaultUri, request);
      reset();
      onCreated();
      onClose();
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
        if (!d.open) {
          reset();
          onClose();
        }
      }}
    >
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{isEdit ? 'Edit Secret' : 'Create Secret'}</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
              <Field label="Name" required hint="Alphanumeric and dashes only">
                <Input
                  value={name}
                  onChange={(_, d) => setName(d.value)}
                  placeholder="my-secret-name"
                  disabled={isEdit}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                />
              </Field>

              <Field label="Value" required>
                <Textarea
                  value={value}
                  onChange={(_, d) => setValue(d.value)}
                  placeholder="Secret value…"
                  rows={3}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                />
              </Field>

              <Field label="Content Type" hint="e.g., text/plain, application/json">
                <Combobox
                  freeform
                  value={contentType}
                  selectedOptions={contentType ? [contentType] : []}
                  onOptionSelect={(_, data) =>
                    setContentType(String(data.optionValue ?? data.optionText ?? ''))
                  }
                  onChange={(event) => setContentType(event.target.value)}
                  placeholder="Select or type content type"
                >
                  {CONTENT_TYPE_OPTIONS.map((option) => (
                    <Option key={option} value={option}>
                      {option}
                    </Option>
                  ))}
                </Combobox>
              </Field>

              <Field label="Expiration (Optional)">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Switch
                      checked={hasExpiration}
                      onChange={(_, d) => {
                        setHasExpiration(d.checked);
                        if (!d.checked) setExpires('');
                      }}
                    />
                    <Text size={200}>Set expiration</Text>
                  </div>
                  <Input
                    type="datetime-local"
                    value={expires}
                    onChange={(_, d) => setExpires(d.value)}
                    disabled={!hasExpiration}
                  />
                </div>
              </Field>

              <Field label="Tags" hint="Comma-separated key=value pairs">
                <Input
                  value={tagsInput}
                  onChange={(_, d) => setTagsInput(d.value)}
                  placeholder="env=prod, team=backend"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 }}
                />
              </Field>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Switch checked={enabled} onChange={(_, d) => setEnabled(d.checked)} />
                <Text size={200}>Enabled</Text>
              </div>

              {error && (
                <div
                  style={{
                    padding: 8,
                    background: tokens.colorPaletteRedBackground1,
                    borderRadius: 4,
                  }}
                >
                  <Text size={200} style={{ color: tokens.colorPaletteRedForeground1 }}>
                    {error}
                  </Text>
                </div>
              )}

              <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                {isEdit
                  ? 'Saving creates a new version of this secret.'
                  : 'Creating with an existing name produces a new version.'}
              </Text>
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="secondary"
              onClick={() => {
                reset();
                onClose();
              }}
            >
              Cancel
            </Button>
            <Button appearance="primary" onClick={handleCreate} disabled={loading}>
              {loading ? <Spinner size="tiny" /> : isEdit ? 'Save' : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
