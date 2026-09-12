import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMockStore } from '../stores/mockStore';
import * as api from './tauri';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const invokeMock = vi.mocked(invoke);

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockResolvedValue(undefined as never);
  useMockStore.setState({ mockMode: false });
});

afterEach(() => {
  useMockStore.setState({ mockMode: false });
});

describe('tauri bridge in live mode', () => {
  it('forwards auth commands', async () => {
    await api.authStatus();
    await api.authSignOut();
    await api.setTenant('tenant-1');
    expect(invokeMock.mock.calls).toEqual([
      ['auth_status'],
      ['auth_sign_out'],
      ['set_tenant', { tenantId: 'tenant-1' }],
    ]);
  });

  it('forwards resource listing commands', async () => {
    await api.listTenants();
    await api.listSubscriptions();
    await api.listKeyvaults('sub-1');
    expect(invokeMock.mock.calls).toEqual([
      ['list_tenants'],
      ['list_subscriptions'],
      ['list_keyvaults', { subscriptionId: 'sub-1' }],
    ]);
  });

  it('forwards vault item commands', async () => {
    await api.listSecrets('https://v/');
    await api.listKeys('https://v/');
    await api.listCertificates('https://v/');
    await api.getSecretValue('https://v/', 'alpha');
    await api.getSecretMetadata('https://v/', 'alpha');
    expect(invokeMock.mock.calls).toEqual([
      ['list_secrets', { vaultUri: 'https://v/' }],
      ['list_keys', { vaultUri: 'https://v/' }],
      ['list_certificates', { vaultUri: 'https://v/' }],
      ['get_secret_value', { vaultUri: 'https://v/', name: 'alpha' }],
      ['get_secret_metadata', { vaultUri: 'https://v/', name: 'alpha' }],
    ]);
  });

  it('forwards secret mutations', async () => {
    const request = {
      name: 'alpha',
      value: 'v',
      contentType: null,
      tags: null,
      enabled: true,
      expires: null,
      notBefore: null,
    };
    await api.setSecret('https://v/', request);
    await api.deleteSecret('https://v/', 'alpha');
    await api.recoverSecret('https://v/', 'alpha');
    await api.purgeSecret('https://v/', 'alpha');
    expect(invokeMock.mock.calls).toEqual([
      ['set_secret', { vaultUri: 'https://v/', request }],
      ['delete_secret', { vaultUri: 'https://v/', name: 'alpha' }],
      ['recover_secret', { vaultUri: 'https://v/', name: 'alpha' }],
      ['purge_secret', { vaultUri: 'https://v/', name: 'alpha' }],
    ]);
  });

  it('sends explicit nulls for optional audit arguments', async () => {
    await api.getAuditLog();
    await api.exportAuditLog();
    await api.clearAuditLog();
    expect(invokeMock.mock.calls).toEqual([
      ['get_audit_log', { limit: null, vaultName: null }],
      ['export_audit_log', { vaultName: null }],
      ['clear_audit_log', { vaultName: null }],
    ]);
  });

  it('passes audit arguments through when provided', async () => {
    await api.getAuditLog(50, 'my-vault');
    await api.exportAuditLog('my-vault');
    await api.clearAuditLog('my-vault');
    expect(invokeMock.mock.calls).toEqual([
      ['get_audit_log', { limit: 50, vaultName: 'my-vault' }],
      ['export_audit_log', { vaultName: 'my-vault' }],
      ['clear_audit_log', { vaultName: 'my-vault' }],
    ]);
  });

  it('forwards exports', async () => {
    invokeMock.mockResolvedValue('csv-content' as never);
    await expect(api.exportItems('[]', 'csv')).resolves.toBe('csv-content');
    expect(invokeMock).toHaveBeenCalledWith('export_items', { itemsJson: '[]', format: 'csv' });
  });
});

describe('tauri bridge in mock mode', () => {
  beforeEach(() => {
    useMockStore.setState({ mockMode: true });
  });

  it('never reaches the backend', async () => {
    await api.authStatus();
    await api.listTenants();
    await api.listSubscriptions();
    await api.listKeyvaults('sub-1');
    await api.listSecrets('https://v/');
    await api.listKeys('https://v/');
    await api.listCertificates('https://v/');
    await api.authSignOut();
    await api.setTenant('tenant-1');
    await api.deleteSecret('https://v/', 'alpha');
    await api.recoverSecret('https://v/', 'alpha');
    await api.purgeSecret('https://v/', 'alpha');
    await api.clearAuditLog();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('serves secret values and metadata from the fixture set', async () => {
    const secrets = await api.listSecrets('https://v/');
    const first = secrets[0];
    await expect(api.getSecretValue('https://v/', first.name)).resolves.toHaveProperty('value');
    await expect(api.getSecretMetadata('https://v/', first.name)).resolves.toMatchObject({
      name: first.name,
    });
  });

  it('reports a missing secret by name', async () => {
    await expect(api.getSecretMetadata('https://v/', 'nope')).rejects.toThrow(
      'Secret nope not found in mock data',
    );
  });

  it('creates a secret locally', async () => {
    const created = await api.setSecret('https://v/', {
      name: 'new-one',
      value: 'v',
      contentType: null,
      tags: null,
      enabled: true,
      expires: null,
      notBefore: null,
    });
    expect(created.name).toBe('new-one');
  });

  it('filters the audit log by vault and exports it as JSON', async () => {
    const all = await api.getAuditLog();
    expect(all.length).toBeGreaterThan(0);
    const scoped = await api.getAuditLog(10, all[0].vaultName);
    expect(scoped.every((entry) => entry.vaultName === all[0].vaultName)).toBe(true);
    expect(JSON.parse(await api.exportAuditLog(all[0].vaultName))).toHaveLength(scoped.length);
    expect(JSON.parse(await api.exportAuditLog())).toHaveLength(all.length);
  });

  it('echoes export payloads back unchanged', async () => {
    await expect(api.exportItems('[1]', 'json')).resolves.toBe('[1]');
  });
});

describe('mockStore', () => {
  it('refuses to enable mock mode when the build did not opt in', () => {
    useMockStore.setState({ mockMode: false, mockAvailable: false });
    useMockStore.getState().setMockMode(true);
    expect(useMockStore.getState().mockMode).toBe(false);
  });

  it('enables mock mode when the build opted in', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK_MODE', 'true');
    vi.resetModules();
    const { useMockStore: freshStore } = await import('../stores/mockStore');
    expect(freshStore.getState().mockAvailable).toBe(true);
    freshStore.getState().setMockMode(true);
    expect(freshStore.getState().mockMode).toBe(true);
    freshStore.getState().setMockMode(false);
    expect(freshStore.getState().mockMode).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
