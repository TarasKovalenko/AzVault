import { describe, expect, it, vi } from 'vitest';
import type { SecretItem } from '../../types';
import { buildSecretMetadata, exportFileName, exportSecretMetadata } from './secretsExport';

function makeSecret(overrides?: Partial<SecretItem>): SecretItem {
  return {
    id: 'id-1',
    name: 'secret-a',
    enabled: true,
    created: '2025-01-01T00:00:00Z',
    updated: '2025-01-02T00:00:00Z',
    expires: null,
    notBefore: null,
    contentType: 'text/plain',
    tags: { env: 'dev' },
    managed: null,
    ...overrides,
  };
}

describe('secretsExport', () => {
  it('builds metadata rows without secret values', () => {
    const out = buildSecretMetadata([
      makeSecret(),
      makeSecret({ name: 'secret-b', tags: null, contentType: null }),
    ]);

    expect(out).toEqual([
      {
        name: 'secret-a',
        enabled: true,
        created: '2025-01-01T00:00:00Z',
        updated: '2025-01-02T00:00:00Z',
        expires: null,
        contentType: 'text/plain',
        tags: '{"env":"dev"}',
      },
      {
        name: 'secret-b',
        enabled: true,
        created: '2025-01-01T00:00:00Z',
        updated: '2025-01-02T00:00:00Z',
        expires: null,
        contentType: null,
        tags: '',
      },
    ]);
  });

  it('names the file by format and timestamp', () => {
    expect(exportFileName('json', 1_700_000_000_000)).toBe('azvault-secrets-1700000000000.json');
    expect(exportFileName('csv', 1_700_000_000_000)).toBe('azvault-secrets-1700000000000.csv');
  });

  it('saves through the backend and reports the path it actually wrote', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-json');
    const save = vi.fn<(fileName: string, content: string) => Promise<string>>();
    save.mockResolvedValue('/Users/op/Downloads/azvault-secrets-1700000000000.json');
    const writeClipboard = vi.fn<(content: string) => Promise<void>>();
    writeClipboard.mockResolvedValue();
    const onError = vi.fn<(error: unknown) => void>();
    const onSuccess = vi.fn<(mode: 'file' | 'clipboard', target?: string) => void>();

    await exportSecretMetadata([makeSecret()], 'json', {
      exportItems,
      save,
      writeClipboard,
      onError,
      onSuccess,
      now: () => 1_700_000_000_000,
    });

    expect(exportItems).toHaveBeenCalledWith(
      JSON.stringify([
        {
          name: 'secret-a',
          enabled: true,
          created: '2025-01-01T00:00:00Z',
          updated: '2025-01-02T00:00:00Z',
          expires: null,
          contentType: 'text/plain',
          tags: '{"env":"dev"}',
        },
      ]),
      'json',
    );
    expect(save).toHaveBeenCalledWith('azvault-secrets-1700000000000.json', 'payload-json');
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith(
      'file',
      '/Users/op/Downloads/azvault-secrets-1700000000000.json',
    );
  });

  it('falls back to the clipboard when the save fails', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-csv');
    const save = vi.fn<(fileName: string, content: string) => Promise<string>>();
    save.mockRejectedValue(new Error('Could not write the export.'));
    const writeClipboard = vi.fn<(content: string) => Promise<void>>();
    writeClipboard.mockResolvedValue();
    const onError = vi.fn<(error: unknown) => void>();
    const onSuccess = vi.fn<(mode: 'file' | 'clipboard', target?: string) => void>();

    await exportSecretMetadata([makeSecret()], 'csv', {
      exportItems,
      save,
      writeClipboard,
      onError,
      onSuccess,
    });

    expect(writeClipboard).toHaveBeenCalledWith('payload-csv');
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('clipboard');
  });

  it('reports the save failure when there is no clipboard to fall back to', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-json');
    const save = vi.fn<(fileName: string, content: string) => Promise<string>>();
    save.mockRejectedValue(new Error('Could not write the export.'));
    const onError = vi.fn<(error: unknown) => void>();
    const onSuccess = vi.fn<(mode: 'file' | 'clipboard', target?: string) => void>();

    await exportSecretMetadata([makeSecret()], 'json', { exportItems, save, onError, onSuccess });

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('Could not write the export.');
  });

  it('reports backend render errors without touching the disk', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockRejectedValue(new Error('backend failed'));
    const save = vi.fn<(fileName: string, content: string) => Promise<string>>();
    const onError = vi.fn<(error: unknown) => void>();

    await exportSecretMetadata([makeSecret()], 'json', { exportItems, save, onError });

    expect(save).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('backend failed');
  });
});
