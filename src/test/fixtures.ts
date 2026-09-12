import type {
  AuditEntry,
  CertificateItem,
  KeyItem,
  KeyVaultInfo,
  SecretItem,
  Subscription,
  Tenant,
} from '../types';

export function makeSecret(overrides: Partial<SecretItem> = {}): SecretItem {
  return {
    id: 'https://v.vault.azure.net/secrets/alpha',
    name: 'alpha',
    enabled: true,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    expires: null,
    notBefore: null,
    contentType: 'text/plain',
    tags: null,
    managed: false,
    ...overrides,
  };
}

export function makeKey(overrides: Partial<KeyItem> = {}): KeyItem {
  return {
    id: 'https://v.vault.azure.net/keys/signing-key/abc123',
    name: 'signing-key',
    enabled: true,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    expires: null,
    notBefore: null,
    keyType: 'RSA',
    keyOps: ['sign', 'verify'],
    tags: null,
    managed: false,
    ...overrides,
  };
}

export function makeCertificate(overrides: Partial<CertificateItem> = {}): CertificateItem {
  return {
    id: 'https://v.vault.azure.net/certificates/web-cert/def456',
    name: 'web-cert',
    enabled: true,
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-02T00:00:00Z',
    expires: null,
    notBefore: null,
    subject: 'CN=example.com',
    thumbprint: 'AABBCC',
    tags: null,
    ...overrides,
  };
}

export function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    timestamp: '2024-03-01T10:00:00Z',
    vaultName: 'my-vault',
    action: 'get',
    itemType: 'secret',
    itemName: 'alpha',
    result: 'success',
    details: null,
    ...overrides,
  };
}

export function makeVault(overrides: Partial<KeyVaultInfo> = {}): KeyVaultInfo {
  return {
    id: '/subscriptions/sub-1/vaults/my-vault',
    name: 'my-vault',
    location: 'westeurope',
    resourceGroup: 'rg-1',
    vaultUri: 'https://my-vault.vault.azure.net/',
    tags: null,
    softDeleteEnabled: true,
    ...overrides,
  };
}

export function makeTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: '/tenants/tenant-1',
    tenant_id: 'tenant-1',
    display_name: 'Contoso',
    ...overrides,
  };
}

export function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    subscriptionId: 'sub-1',
    displayName: 'Production',
    state: 'Enabled',
    tenantId: 'tenant-1',
    ...overrides,
  };
}
