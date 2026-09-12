import type { SecretItem } from '../../types';

export type ExportFormat = 'json' | 'csv';

type ExportItemsFn = (itemsJson: string, format: ExportFormat) => Promise<string>;
type SaveFn = (fileName: string, content: string) => Promise<string>;
type ClipboardFn = (content: string) => Promise<void>;
type ErrorFn = (error: unknown) => void;
type SuccessFn = (mode: 'file' | 'clipboard', target?: string) => void;

export type SecretExportMetadata = {
  name: string;
  enabled: boolean;
  created: string | null;
  updated: string | null;
  expires: string | null;
  contentType: string | null;
  tags: string;
};

export function buildSecretMetadata(items: SecretItem[]): SecretExportMetadata[] {
  return items.map(({ name, enabled, created, updated, expires, contentType, tags }) => ({
    name,
    enabled,
    created,
    updated,
    expires,
    contentType,
    tags: tags ? JSON.stringify(tags) : '',
  }));
}

export function exportFileName(format: ExportFormat, now: number = Date.now()): string {
  return `azvault-secrets-${now}.${format}`;
}

/**
 * Renders the metadata and hands it to the backend to write.
 *
 * The save has to be observable: an `<a download>` click reports nothing back,
 * and the desktop webview has no download handling at all, so the old path
 * showed "CSV downloaded" while writing no file. The clipboard is kept as a
 * fallback for when saving genuinely fails.
 */
export async function exportSecretMetadata(
  items: SecretItem[],
  format: ExportFormat,
  deps: {
    exportItems: ExportItemsFn;
    save: SaveFn;
    writeClipboard?: ClipboardFn;
    onError?: ErrorFn;
    onSuccess?: SuccessFn;
    now?: () => number;
  },
): Promise<void> {
  const { exportItems, save, writeClipboard, onError, onSuccess, now } = deps;

  try {
    const metadata = buildSecretMetadata(items);
    const result = await exportItems(JSON.stringify(metadata), format);

    try {
      const path = await save(exportFileName(format, now?.()), result);
      onSuccess?.('file', path);
    } catch (saveError) {
      if (!writeClipboard) throw saveError;
      await writeClipboard(result);
      onSuccess?.('clipboard');
    }
  } catch (error) {
    onError?.(error);
  }
}
