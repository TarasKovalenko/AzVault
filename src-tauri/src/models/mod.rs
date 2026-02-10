use serde::{Deserialize, Serialize};

// ── Auth ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub signed_in: bool,
    pub user_name: Option<String>,
    pub tenant_id: Option<String>,
}

// ── Azure Resources ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
    pub id: String,
    pub tenant_id: String,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub subscription_id: String,
    pub display_name: String,
    pub state: String,
    pub tenant_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyVaultInfo {
    pub id: String,
    pub name: String,
    pub location: String,
    pub resource_group: String,
    pub vault_uri: String,
    pub tags: Option<std::collections::HashMap<String, String>>,
    pub soft_delete_enabled: Option<bool>,
}

// ── Vault Items ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretItem {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub expires: Option<String>,
    pub not_before: Option<String>,
    pub content_type: Option<String>,
    pub tags: Option<std::collections::HashMap<String, String>>,
    pub managed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretValue {
    pub value: String,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyItem {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub expires: Option<String>,
    pub not_before: Option<String>,
    pub key_type: Option<String>,
    pub key_ops: Option<Vec<String>>,
    pub tags: Option<std::collections::HashMap<String, String>>,
    pub managed: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateItem {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub expires: Option<String>,
    pub not_before: Option<String>,
    pub subject: Option<String>,
    pub thumbprint: Option<String>,
    pub tags: Option<std::collections::HashMap<String, String>>,
}

// ── Create/Update ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSecretRequest {
    pub name: String,
    pub value: String,
    pub content_type: Option<String>,
    pub tags: Option<std::collections::HashMap<String, String>>,
    pub enabled: Option<bool>,
    pub expires: Option<String>,
    pub not_before: Option<String>,
}

// ── Audit ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub timestamp: String,
    pub vault_name: String,
    pub action: String,
    pub item_type: String,
    pub item_name: String,
    pub result: String,
    pub details: Option<String>,
}

