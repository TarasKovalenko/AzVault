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

import { useState } from 'react';
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
  Textarea,
  Switch,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { setSecret } from '../../services/tauri';
import type { CreateSecretRequest } from '../../types';

interface CreateSecretDialogProps {
  open: boolean;
  vaultUri: string;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateSecretDialog({
  open,
  vaultUri,
  onClose,
  onCreated,
}: CreateSecretDialogProps) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [contentType, setContentType] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [expires, setExpires] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Reset all form fields to defaults. */
  const reset = () => {
    setName('');
    setValue('');
    setContentType('');
    setEnabled(true);
    setExpires('');
    setTagsInput('');
    setError(null);
  };

  /** Validate input and submit the create request. */
  const handleCreate = async () => {
    if (!name.trim() || !value.trim()) {
      setError('Name and value are required.');
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
        expires: expires ? new Date(expires).toISOString() : null,
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
          <DialogTitle>Create Secret</DialogTitle>
          <DialogContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 8 }}>
              <Field label="Name" required hint="Alphanumeric and dashes only">
                <Input
                  value={name}
                  onChange={(_, d) => setName(d.value)}
                  placeholder="my-secret-name"
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
                <Input
                  value={contentType}
                  onChange={(_, d) => setContentType(d.value)}
                  placeholder="text/plain"
                />
              </Field>

              <Field label="Expiration">
                <Input
                  type="datetime-local"
                  value={expires}
                  onChange={(_, d) => setExpires(d.value)}
                />
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
                Creating with an existing name produces a new version.
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
              {loading ? <Spinner size="tiny" /> : 'Create'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
