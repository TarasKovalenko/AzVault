import { describe, expect, it } from 'vitest';
import { parseSecretsImportJson } from './secretsImport';

describe('secretsImport', () => {
  it('parses array form', () => {
    const input = JSON.stringify([
      {
        name: 'api-key',
        value: 'top-secret',
        contentType: 'text/plain',
        enabled: true,
        expires: '2030-01-01T00:00:00Z',
        tags: { env: 'prod' },
      },
    ]);

    const out = parseSecretsImportJson(input);
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0]).toEqual({
      name: 'api-key',
      value: 'top-secret',
      contentType: 'text/plain',
      enabled: true,
      expires: '2030-01-01T00:00:00.000Z',
      notBefore: null,
      tags: { env: 'prod' },
    });
  });

  it('parses envelope form', () => {
    const input = JSON.stringify({
      secrets: [{ name: 'db-pass', value: '12345' }],
    });

    const out = parseSecretsImportJson(input);
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0].name).toBe('db-pass');
  });

  it('rejects invalid secret names', () => {
    const input = JSON.stringify([{ name: 'bad name', value: '123' }]);
    expect(() => parseSecretsImportJson(input)).toThrow(/letters, numbers, and dashes/);
  });

  it('rejects invalid tags shape', () => {
    const input = JSON.stringify([{ name: 'ok-name', value: '123', tags: 'env=prod' }]);
    expect(() => parseSecretsImportJson(input)).toThrow(/tags/);
  });
});
