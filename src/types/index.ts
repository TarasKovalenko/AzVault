// ── Auth ──

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message: string;
}

export interface AuthState {
  signed_in: boolean;
  user_name: string | null;
  tenant_id: string | null;
}

// ── Azure Resources ──

export interface Tenant {
  id: string;
  tenant_id: string;
  display_name: string | null;
}

export interface Subscription {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId: string;
}

export interface KeyVaultInfo {
  id: string;
  name: string;
  location: string;
  resourceGroup: string;
  vaultUri: string;
  tags: Record<string, string> | null;
  softDeleteEnabled: boolean | null;
}

// ── Vault Items ──

export interface SecretItem {
  id: string;
  name: string;
  enabled: boolean;
  created: string | null;
  updated: string | null;
  expires: string | null;
  notBefore: string | null;
  contentType: string | null;
  tags: Record<string, string> | null;
  managed: boolean | null;
}

export interface SecretValue {
  value: string;
  id: string;
  name: string;
}

export interface KeyItem {
  id: string;
  name: string;
  enabled: boolean;
  created: string | null;
  updated: string | null;
  expires: string | null;
  notBefore: string | null;
  keyType: string | null;
  keyOps: string[] | null;
  tags: Record<string, string> | null;
  managed: boolean | null;
}

export interface CertificateItem {
  id: string;
  name: string;
  enabled: boolean;
  created: string | null;
  updated: string | null;
  expires: string | null;
  notBefore: string | null;
  subject: string | null;
  thumbprint: string | null;
  tags: Record<string, string> | null;
}

// ── Create/Update ──

export interface CreateSecretRequest {
  name: string;
  value: string;
  contentType: string | null;
  tags: Record<string, string> | null;
  enabled: boolean | null;
  expires: string | null;
  notBefore: string | null;
}

// ── Audit ──

export interface AuditEntry {
  timestamp: string;
  vaultName: string;
  action: string;
  itemType: string;
  itemName: string;
  result: string;
  details: string | null;
}

// ── UI State ──

export type ItemTab = 'secrets' | 'keys' | 'certificates' | 'access' | 'logs';

export interface SessionSettings {
  tenantId: string | null;
  subscriptionId: string | null;
  vaultUri: string | null;
  vaultName: string | null;
  recentVaults: { name: string; uri: string }[];
  mockMode: boolean;
}

export type AzureEnvironment = 'azurePublic' | 'azureUsGovernment' | 'azureChina';
export type ThemeMode = 'light' | 'dark';
