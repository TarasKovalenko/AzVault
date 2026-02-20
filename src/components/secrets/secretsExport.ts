import type { SecretItem } from '../../types';

export type ExportFormat = 'json' | 'csv';

type ExportItemsFn = (itemsJson: string, format: ExportFormat) => Promise<string>;
type DownloadFn = (content: string, format: ExportFormat) => void;
type ClipboardFn = (content: string) => Promise<void>;
type ErrorFn = (error: unknown) => void;
type SuccessFn = (mode: 'download' | 'clipboard') => void;

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

export async function exportSecretMetadata(
  items: SecretItem[],
  format: ExportFormat,
  deps: {
    exportItems: ExportItemsFn;
    download: DownloadFn;
    writeClipboard?: ClipboardFn;
    onError?: ErrorFn;
    onSuccess?: SuccessFn;
  },
): Promise<void> {
  const { exportItems, download, writeClipboard, onError, onSuccess } = deps;

  try {
    const metadata = buildSecretMetadata(items);
    const result = await exportItems(JSON.stringify(metadata), format);

    try {
      download(result, format);
      onSuccess?.('download');
    } catch {
      if (!writeClipboard) {
        throw new Error('Unable to download or copy export.');
      }
      await writeClipboard(result);
      onSuccess?.('clipboard');
    }
  } catch (error) {
    onError?.(error);
  }
}
