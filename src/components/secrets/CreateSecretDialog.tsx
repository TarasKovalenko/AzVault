import { useEffect, useState } from 'react';
import { setSecret } from '../../services/tauri';
import type { CreateSecretRequest } from '../../types';
import { Button } from '../ui/Button';
import { Field, Input, Switch, Textarea } from '../ui/Field';
import { Modal } from '../ui/Modal';

const CONTENT_TYPES = [
  'text/plain',
  'application/json',
  'application/octet-stream',
  'application/x-pem-file',
  'application/x-pkcs12',
  'text/csv',
];

function toLocalDate(iso?: string | null) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function serializeTags(tags?: Record<string, string> | null) {
  return tags
    ? Object.entries(tags)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ')
    : '';
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
}: {
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
}) {
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [contentType, setContentType] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [hasExpiration, setHasExpiration] = useState(false);
  const [expires, setExpires] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = mode === 'edit';
  useEffect(() => {
    if (!open) return;
    const date = toLocalDate(initialExpires);
    setName(initialName ?? '');
    setValue(initialValue ?? '');
    setContentType(initialContentType ?? '');
    setEnabled(initialEnabled ?? true);
    setHasExpiration(Boolean(date));
    setExpires(date);
    setTags(serializeTags(initialTags));
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
  const close = () => {
    if (!loading) onClose();
  };
  const submit = async () => {
    if (!name.trim()) return setError('Name is required.');
    if (!value.trim())
      return setError(editing ? 'Value is required when updating a secret.' : 'Value is required.');
    if (!/^[a-zA-Z0-9-]+$/.test(name))
      return setError('Name may only contain letters, numbers, and dashes.');
    setLoading(true);
    setError(null);
    try {
      let parsedTags: Record<string, string> | null = null;
      if (tags.trim()) {
        parsedTags = {};
        for (const pair of tags.split(',')) {
          const [key, tagValue] = pair.split('=').map((part) => part.trim());
          if (key && tagValue) parsedTags[key] = tagValue;
        }
      }
      const request: CreateSecretRequest = {
        name: name.trim(),
        value,
        contentType: contentType.trim() || null,
        enabled,
        expires: hasExpiration && expires ? new Date(expires).toISOString() : null,
        notBefore: null,
        tags: parsedTags,
      };
      await setSecret(vaultUri, request);
      onCreated();
      onClose();
    } catch (caught) {
      setError(String(caught));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      closeDisabled={loading}
      title={editing ? 'Edit Secret' : 'Create Secret'}
      description={
        editing
          ? 'Saving creates a new version of this secret.'
          : 'Create a secret or a new version of an existing name.'
      }
      footer={
        <>
          <Button onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={submit}>
            {editing ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field
          label="Name"
          hint="Alphanumeric characters and dashes only"
          error={error?.startsWith('Name') ? error : undefined}
        >
          <Input
            className="mono"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="my-secret-name"
            disabled={editing}
          />
        </Field>
        <Field label="Value">
          <Textarea
            className="mono"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Secret value…"
            rows={4}
          />
        </Field>
        <Field label="Content Type" hint="Choose a common type or enter your own">
          <Input
            list="secret-content-types"
            value={contentType}
            onChange={(event) => setContentType(event.target.value)}
            placeholder="text/plain"
          />
          <datalist id="secret-content-types">
            {CONTENT_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </Field>
        <Field label="Expiration">
          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <Switch
                checked={hasExpiration}
                onChange={(checked) => {
                  setHasExpiration(checked);
                  if (!checked) setExpires('');
                }}
                label="Set expiration"
              />
              <span className="text-xs">Set expiration</span>
            </div>
            <Input
              type="datetime-local"
              value={expires}
              onChange={(event) => setExpires(event.target.value)}
              disabled={!hasExpiration}
            />
          </div>
        </Field>
        <Field label="Tags" hint="Comma-separated key=value pairs">
          <Input
            className="mono"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="env=prod, team=backend"
          />
        </Field>
        <div className="flex items-center gap-2">
          <Switch checked={enabled} onChange={setEnabled} label="Enabled" />
          <span className="text-xs">Enabled</span>
        </div>
        {error && !error.startsWith('Name') && (
          <div className="rounded-lg bg-red-500/10 p-2.5 text-xs text-[var(--danger)]">{error}</div>
        )}
      </div>
    </Modal>
  );
}
