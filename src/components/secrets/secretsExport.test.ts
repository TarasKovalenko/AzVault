import { describe, expect, it, vi } from 'vitest';
import type { SecretItem } from '../../types';
import { buildSecretMetadata, exportSecretMetadata } from './secretsExport';

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

  it('exports and downloads when primary path succeeds', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-json');
    const download = vi.fn<(content: string, format: 'json' | 'csv') => void>();
    const writeClipboard = vi.fn<(content: string) => Promise<void>>();
    writeClipboard.mockResolvedValue();
    const onError = vi.fn<(error: unknown) => void>();
    const onSuccess = vi.fn<(mode: 'download' | 'clipboard') => void>();

    await exportSecretMetadata([makeSecret()], 'json', {
      exportItems,
      download,
      writeClipboard,
      onError,
      onSuccess,
    });

    expect(exportItems).toHaveBeenCalledTimes(1);
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
    expect(download).toHaveBeenCalledWith('payload-json', 'json');
    expect(writeClipboard).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('download');
  });

  it('falls back to clipboard when download fails', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-csv');
    const download = vi.fn<(content: string, format: 'json' | 'csv') => void>();
    download.mockImplementation(() => {
      throw new Error('download blocked');
    });
    const writeClipboard = vi.fn<(content: string) => Promise<void>>();
    writeClipboard.mockResolvedValue();
    const onError = vi.fn<(error: unknown) => void>();
    const onSuccess = vi.fn<(mode: 'download' | 'clipboard') => void>();

    await exportSecretMetadata([makeSecret()], 'csv', {
      exportItems,
      download,
      writeClipboard,
      onError,
      onSuccess,
    });

    expect(download).toHaveBeenCalledWith('payload-csv', 'csv');
    expect(writeClipboard).toHaveBeenCalledWith('payload-csv');
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledWith('clipboard');
  });

  it('reports error when both download and clipboard are unavailable', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockResolvedValue('payload-json');
    const download = vi.fn<(content: string, format: 'json' | 'csv') => void>();
    download.mockImplementation(() => {
      throw new Error('download blocked');
    });
    const onError = vi.fn<(error: unknown) => void>();

    await exportSecretMetadata([makeSecret()], 'json', {
      exportItems,
      download,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('Unable to download or copy export.');
  });

  it('reports backend export errors', async () => {
    const exportItems = vi.fn<(...args: [string, 'json' | 'csv']) => Promise<string>>();
    exportItems.mockRejectedValue(new Error('backend failed'));
    const download = vi.fn<(content: string, format: 'json' | 'csv') => void>();
    const onError = vi.fn<(error: unknown) => void>();

    await exportSecretMetadata([makeSecret()], 'json', {
      exportItems,
      download,
      onError,
    });

    expect(download).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('backend failed');
  });
});
