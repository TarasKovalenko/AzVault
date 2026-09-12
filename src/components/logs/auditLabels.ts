/**
 * The audit log stores backend enums (`get_value`, `secret`, `error`). Those are
 * fine as filter values and as stored data, but they are not what a user should
 * read, so every enum gets a display label here and nowhere else.
 */

const ACTION_LABELS: Record<string, string> = {
  list: 'List',
  get: 'Read',
  get_value: 'Read value',
  set: 'Create or update',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  recover: 'Recover',
  purge: 'Purge',
  sign: 'Sign',
  verify: 'Verify',
  encrypt: 'Encrypt',
  decrypt: 'Decrypt',
  import: 'Import',
  export: 'Export',
  clear: 'Clear',
};

const ITEM_TYPE_LABELS: Record<string, string> = {
  secret: 'Secret', // pragma: allowlist secret
  key: 'Key',
  certificate: 'Certificate',
  vault: 'Vault',
};

const RESULT_LABELS: Record<string, string> = {
  success: 'Success',
  error: 'Error',
};

/** Sentence-case fallback for enums the app has not seen before. */
function humanize(value: string) {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '—';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? humanize(action);
export const itemTypeLabel = (itemType: string) => ITEM_TYPE_LABELS[itemType] ?? humanize(itemType);
export const resultLabel = (result: string) => RESULT_LABELS[result] ?? humanize(result);
