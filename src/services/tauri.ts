import { invoke } from '@tauri-apps/api/core';
import type {
  DeviceCodeResponse,
  AuthState,
  Tenant,
  Subscription,
  KeyVaultInfo,
  SecretItem,
  SecretValue,
  KeyItem,
  CertificateItem,
  CreateSecretRequest,
  AuditEntry,
} from '../types';
import { useMockStore } from '../stores/mockStore';

function isMock(): boolean {
  return useMockStore.getState().mockMode;
}

// ─── Auth ───

export async function authStart(): Promise<DeviceCodeResponse> {
  if (isMock()) {
    const { mockAuthStart } = await import('../mock/data');
    return mockAuthStart();
  }
  return invoke<DeviceCodeResponse>('auth_start');
}

export async function authPoll(deviceCode: string): Promise<boolean> {
  if (isMock()) {
    const { mockAuthPoll } = await import('../mock/data');
    return mockAuthPoll();
  }
  return invoke<boolean>('auth_poll', { deviceCode });
}

export async function authStatus(): Promise<AuthState> {
  if (isMock()) {
    const { mockAuthStatus } = await import('../mock/data');
    return mockAuthStatus();
  }
  return invoke<AuthState>('auth_status');
}

export async function authSignOut(): Promise<void> {
  if (isMock()) return;
  return invoke<void>('auth_sign_out');
}

export async function setTenant(tenantId: string): Promise<void> {
  if (isMock()) return;
  return invoke<void>('set_tenant', { tenantId });
}

// ─── Resources ───

export async function listTenants(): Promise<Tenant[]> {
  if (isMock()) {
    const { mockTenants } = await import('../mock/data');
    return mockTenants();
  }
  return invoke<Tenant[]>('list_tenants');
}

export async function listSubscriptions(): Promise<Subscription[]> {
  if (isMock()) {
    const { mockSubscriptions } = await import('../mock/data');
    return mockSubscriptions();
  }
  return invoke<Subscription[]>('list_subscriptions');
}

export async function listKeyvaults(subscriptionId: string): Promise<KeyVaultInfo[]> {
  if (isMock()) {
    const { mockKeyvaults } = await import('../mock/data');
    return mockKeyvaults();
  }
  return invoke<KeyVaultInfo[]>('list_keyvaults', { subscriptionId });
}

// ─── Vault Items ───

export async function listSecrets(vaultUri: string): Promise<SecretItem[]> {
  if (isMock()) {
    const { mockSecrets } = await import('../mock/data');
    return mockSecrets();
  }
  return invoke<SecretItem[]>('list_secrets', { vaultUri });
}

export async function listKeys(vaultUri: string): Promise<KeyItem[]> {
  if (isMock()) {
    const { mockKeys } = await import('../mock/data');
    return mockKeys();
  }
  return invoke<KeyItem[]>('list_keys', { vaultUri });
}

export async function listCertificates(vaultUri: string): Promise<CertificateItem[]> {
  if (isMock()) {
    const { mockCertificates } = await import('../mock/data');
    return mockCertificates();
  }
  return invoke<CertificateItem[]>('list_certificates', { vaultUri });
}

export async function getSecretValue(vaultUri: string, name: string): Promise<SecretValue> {
  if (isMock()) {
    const { mockSecretValue } = await import('../mock/data');
    return mockSecretValue(name);
  }
  return invoke<SecretValue>('get_secret_value', { vaultUri, name });
}

export async function getSecretMetadata(vaultUri: string, name: string): Promise<SecretItem> {
  if (isMock()) {
    const { mockSecrets } = await import('../mock/data');
    const item = mockSecrets().find((s) => s.name === name);
    if (!item) throw new Error(`Secret ${name} not found in mock data`);
    return item;
  }
  return invoke<SecretItem>('get_secret_metadata', { vaultUri, name });
}

export async function setSecret(vaultUri: string, request: CreateSecretRequest): Promise<SecretItem> {
  if (isMock()) {
    const { mockSetSecret } = await import('../mock/data');
    return mockSetSecret(request);
  }
  return invoke<SecretItem>('set_secret', { vaultUri, request });
}

export async function deleteSecret(vaultUri: string, name: string): Promise<void> {
  if (isMock()) return;
  return invoke<void>('delete_secret', { vaultUri, name });
}

export async function recoverSecret(vaultUri: string, name: string): Promise<void> {
  if (isMock()) return;
  return invoke<void>('recover_secret', { vaultUri, name });
}

export async function purgeSecret(vaultUri: string, name: string): Promise<void> {
  if (isMock()) return;
  return invoke<void>('purge_secret', { vaultUri, name });
}

// ─── Audit ───

export async function getAuditLog(limit?: number): Promise<AuditEntry[]> {
  if (isMock()) {
    const { mockAuditLog } = await import('../mock/data');
    return mockAuditLog();
  }
  return invoke<AuditEntry[]>('get_audit_log', { limit: limit ?? null });
}

export async function exportAuditLog(): Promise<string> {
  if (isMock()) return '[]';
  return invoke<string>('export_audit_log');
}

export async function clearAuditLog(): Promise<void> {
  if (isMock()) return;
  return invoke<void>('clear_audit_log');
}

// ─── Export ───

export async function exportItems(itemsJson: string, format: string): Promise<string> {
  if (isMock()) return itemsJson;
  return invoke<string>('export_items', { itemsJson, format });
}
