import type {
  AuditEntry,
  AuthState,
  CertificateItem,
  CreateSecretRequest,
  KeyItem,
  KeyVaultInfo,
  SecretItem,
  SecretValue,
  Subscription,
  Tenant,
} from '../types';

const mockSignedIn = false;

export function mockAuthStatus(): AuthState {
  return {
    signed_in: mockSignedIn,
    user_name: mockSignedIn ? 'demo@contoso.com' : null,
    tenant_id: mockSignedIn ? 'mock-tenant-id' : null,
  };
}

export function mockTenants(): Tenant[] {
  return [
    { id: '/tenants/t1', tenant_id: 'tenant-001', display_name: 'Contoso Corp' },
    { id: '/tenants/t2', tenant_id: 'tenant-002', display_name: 'Fabrikam Inc' },
  ];
}

export function mockSubscriptions(): Subscription[] {
  return [
    {
      subscriptionId: 'sub-001',
      displayName: 'Production',
      state: 'Enabled',
      tenantId: 'tenant-001',
    },
    {
      subscriptionId: 'sub-002',
      displayName: 'Development',
      state: 'Enabled',
      tenantId: 'tenant-001',
    },
    {
      subscriptionId: 'sub-003',
      displayName: 'Staging',
      state: 'Enabled',
      tenantId: 'tenant-001',
    },
  ];
}

export function mockKeyvaults(): KeyVaultInfo[] {
  return [
    {
      id: '/subscriptions/sub-001/resourceGroups/rg-prod/providers/Microsoft.KeyVault/vaults/kv-prod-app',
      name: 'kv-prod-app',
      location: 'eastus',
      resourceGroup: 'rg-prod',
      vaultUri: 'https://kv-prod-app.vault.azure.net',
      tags: { environment: 'production', team: 'platform' },
      softDeleteEnabled: true,
    },
    {
      id: '/subscriptions/sub-001/resourceGroups/rg-prod/providers/Microsoft.KeyVault/vaults/kv-prod-data',
      name: 'kv-prod-data',
      location: 'eastus',
      resourceGroup: 'rg-prod',
      vaultUri: 'https://kv-prod-data.vault.azure.net',
      tags: { environment: 'production', team: 'data' },
      softDeleteEnabled: true,
    },
    {
      id: '/subscriptions/sub-001/resourceGroups/rg-dev/providers/Microsoft.KeyVault/vaults/kv-dev-app',
      name: 'kv-dev-app',
      location: 'westus2',
      resourceGroup: 'rg-dev',
      vaultUri: 'https://kv-dev-app.vault.azure.net',
      tags: { environment: 'development' },
      softDeleteEnabled: true,
    },
    {
      id: '/subscriptions/sub-001/resourceGroups/rg-shared/providers/Microsoft.KeyVault/vaults/kv-shared-certs',
      name: 'kv-shared-certs',
      location: 'eastus',
      resourceGroup: 'rg-shared',
      vaultUri: 'https://kv-shared-certs.vault.azure.net',
      tags: { environment: 'shared', purpose: 'certificates' },
      softDeleteEnabled: true,
    },
  ];
}

const now = new Date().toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const lastWeek = new Date(Date.now() - 604800000).toISOString();
const nextYear = new Date(Date.now() + 365 * 86400000).toISOString();

export function mockSecrets(): SecretItem[] {
  return [
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/database-connection-string',
      name: 'database-connection-string',
      enabled: true,
      created: lastWeek,
      updated: yesterday,
      expires: nextYear,
      notBefore: null,
      contentType: 'text/plain',
      tags: { service: 'api', managed: 'true' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/api-key-external',
      name: 'api-key-external',
      enabled: true,
      created: lastWeek,
      updated: lastWeek,
      expires: nextYear,
      notBefore: null,
      contentType: 'text/plain',
      tags: { service: 'external-api' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/storage-account-key',
      name: 'storage-account-key',
      enabled: true,
      created: lastWeek,
      updated: now,
      expires: null,
      notBefore: null,
      contentType: null,
      tags: { service: 'storage' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/redis-password',
      name: 'redis-password',
      enabled: true,
      created: lastWeek,
      updated: lastWeek,
      expires: null,
      notBefore: null,
      contentType: 'text/plain',
      tags: null,
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/jwt-signing-key',
      name: 'jwt-signing-key',
      enabled: true,
      created: lastWeek,
      updated: yesterday,
      expires: nextYear,
      notBefore: null,
      contentType: 'application/json',
      tags: { service: 'auth', rotation: 'quarterly' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/secrets/deprecated-key',
      name: 'deprecated-key',
      enabled: false,
      created: lastWeek,
      updated: lastWeek,
      expires: yesterday,
      notBefore: null,
      contentType: null,
      tags: { deprecated: 'true' },
      managed: false,
    },
  ];
}

export function mockSecretValue(name: string): SecretValue {
  return {
    value: `mock-secret-value-for-${name}-${Math.random().toString(36).slice(2, 10)}`,
    id: `https://kv-prod-app.vault.azure.net/secrets/${name}/version1`,
    name,
  };
}

export function mockSetSecret(req: CreateSecretRequest): SecretItem {
  return {
    id: `https://kv-prod-app.vault.azure.net/secrets/${req.name}`,
    name: req.name,
    enabled: req.enabled ?? true,
    created: now,
    updated: now,
    expires: req.expires,
    notBefore: req.notBefore,
    contentType: req.contentType,
    tags: req.tags,
    managed: false,
  };
}

export function mockKeys(): KeyItem[] {
  return [
    {
      id: 'https://kv-prod-app.vault.azure.net/keys/rsa-signing-key',
      name: 'rsa-signing-key',
      enabled: true,
      created: lastWeek,
      updated: yesterday,
      expires: nextYear,
      notBefore: null,
      keyType: 'RSA',
      keyOps: ['sign', 'verify'],
      tags: { purpose: 'jwt-signing' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/keys/encryption-key',
      name: 'encryption-key',
      enabled: true,
      created: lastWeek,
      updated: lastWeek,
      expires: null,
      notBefore: null,
      keyType: 'RSA',
      keyOps: ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
      tags: { purpose: 'data-encryption' },
      managed: false,
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/keys/ec-key',
      name: 'ec-key',
      enabled: true,
      created: lastWeek,
      updated: lastWeek,
      expires: null,
      notBefore: null,
      keyType: 'EC',
      keyOps: ['sign', 'verify'],
      tags: null,
      managed: false,
    },
  ];
}

export function mockCertificates(): CertificateItem[] {
  return [
    {
      id: 'https://kv-prod-app.vault.azure.net/certificates/api-tls-cert',
      name: 'api-tls-cert',
      enabled: true,
      created: lastWeek,
      updated: yesterday,
      expires: nextYear,
      notBefore: lastWeek,
      subject: 'CN=api.contoso.com',
      thumbprint: 'A1B2C3D4E5F6...',
      tags: { purpose: 'tls', domain: 'api.contoso.com' },
    },
    {
      id: 'https://kv-prod-app.vault.azure.net/certificates/wildcard-cert',
      name: 'wildcard-cert',
      enabled: true,
      created: lastWeek,
      updated: lastWeek,
      expires: nextYear,
      notBefore: lastWeek,
      subject: 'CN=*.contoso.com',
      thumbprint: 'F6E5D4C3B2A1...',
      tags: { purpose: 'tls', domain: '*.contoso.com' },
    },
  ];
}

export function mockAuditLog(): AuditEntry[] {
  return [
    {
      timestamp: now,
      vaultName: 'kv-prod-app',
      action: 'list_secrets',
      itemType: 'secret',
      itemName: '*',
      result: 'success',
      details: null,
    },
    {
      timestamp: yesterday,
      vaultName: 'kv-prod-app',
      action: 'get_secret_value',
      itemType: 'secret',
      itemName: 'database-connection-string',
      result: 'success',
      details: '[REDACTED]',
    },
    {
      timestamp: yesterday,
      vaultName: 'kv-prod-app',
      action: 'set_secret',
      itemType: 'secret',
      itemName: 'new-api-key',
      result: 'success',
      details: '[REDACTED]',
    },
    {
      timestamp: lastWeek,
      vaultName: 'system',
      action: 'sign_in',
      itemType: 'auth',
      itemName: 'user',
      result: 'success',
      details: null,
    },
  ];
}
