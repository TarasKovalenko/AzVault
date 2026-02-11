//! Data models shared between command handlers and Azure client.
//!
//! All types implement `Serialize`/`Deserialize` for Tauri IPC and
//! use `camelCase` field naming to match the React frontend expectations.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── Auth ──

/// Represents the current authentication state returned to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthState {
    pub signed_in: bool,
    pub user_name: Option<String>,
    pub tenant_id: Option<String>,
}

// ── Azure Resources ──

/// Azure AD tenant descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tenant {
    pub id: String,
    pub tenant_id: String,
    pub display_name: Option<String>,
}

/// Azure subscription descriptor.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Subscription {
    pub subscription_id: String,
    pub display_name: String,
    pub state: String,
    pub tenant_id: String,
}

/// Key Vault resource metadata from ARM.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyVaultInfo {
    pub id: String,
    pub name: String,
    pub location: String,
    pub resource_group: String,
    pub vault_uri: String,
    pub tags: Option<HashMap<String, String>>,
    pub soft_delete_enabled: Option<bool>,
}

// ── Vault Items ──

/// Secret metadata (does not contain the actual secret value).
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
    pub tags: Option<HashMap<String, String>>,
    pub managed: Option<bool>,
}

/// Secret value fetched on-demand from the data plane.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretValue {
    pub value: String,
    pub id: String,
    pub name: String,
}

/// Cryptographic key metadata.
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
    pub tags: Option<HashMap<String, String>>,
    pub managed: Option<bool>,
}

/// X.509 certificate metadata.
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
    pub tags: Option<HashMap<String, String>>,
}

// ── Create/Update ──

/// Payload for creating or versioning a secret.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSecretRequest {
    pub name: String,
    pub value: String,
    pub content_type: Option<String>,
    pub tags: Option<HashMap<String, String>>,
    pub enabled: Option<bool>,
    pub expires: Option<String>,
    pub not_before: Option<String>,
}

// ── Audit ──

/// A single audit log entry persisted to disk.
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

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_subscription_in_camel_case() {
        let sub = Subscription {
            subscription_id: "sub-123".to_string(),
            display_name: "Production".to_string(),
            state: "Enabled".to_string(),
            tenant_id: "tenant-abc".to_string(),
        };

        let json = serde_json::to_string(&sub).expect("should serialize");
        assert!(json.contains("subscriptionId"), "field should be camelCase");
        assert!(json.contains("displayName"));
        assert!(
            !json.contains("subscription_id"),
            "field should not be snake_case"
        );
    }

    #[test]
    fn serializes_secret_item_in_camel_case() {
        let secret = SecretItem {
            id: "id".to_string(),
            name: "db-conn".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            content_type: Some("text/plain".to_string()),
            tags: None,
            managed: None,
        };
        let json = serde_json::to_string(&secret).expect("should serialize");
        assert!(json.contains("contentType"));
        assert!(json.contains("notBefore"));
    }

    #[test]
    fn deserializes_auth_state_from_json() {
        let json = r#"{"signed_in":true,"user_name":"test@example.com","tenant_id":"tid"}"#;
        let state: AuthState = serde_json::from_str(json).expect("should deserialize");
        assert!(state.signed_in);
        assert_eq!(state.user_name.as_deref(), Some("test@example.com"));
    }

    #[test]
    fn secret_item_roundtrip() {
        let original = SecretItem {
            id: "https://vault.azure.net/secrets/test".to_string(),
            name: "test".to_string(),
            enabled: false,
            created: Some("2024-01-01T00:00:00Z".to_string()),
            updated: None,
            expires: Some("2025-12-31T23:59:59Z".to_string()),
            not_before: None,
            content_type: Some("application/json".to_string()),
            tags: Some(HashMap::from([("env".to_string(), "prod".to_string())])),
            managed: Some(true),
        };
        let json = serde_json::to_string(&original).expect("serialize");
        let restored: SecretItem = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(restored.name, "test");
        assert_eq!(restored.enabled, false);
        assert_eq!(restored.tags.unwrap().get("env").unwrap(), "prod");
    }

    #[test]
    fn key_item_serialization() {
        let key = KeyItem {
            id: "https://vault.azure.net/keys/rsa-key".to_string(),
            name: "rsa-key".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            key_type: Some("RSA".to_string()),
            key_ops: Some(vec!["sign".to_string(), "verify".to_string()]),
            tags: None,
            managed: None,
        };
        let json = serde_json::to_string(&key).expect("serialize");
        assert!(json.contains("keyType"));
        assert!(json.contains("keyOps"));
        assert!(json.contains("sign"));
    }

    #[test]
    fn create_secret_request_with_all_fields() {
        let req = CreateSecretRequest {
            name: "my-secret".to_string(),
            value: "super-secret-value".to_string(),
            content_type: Some("text/plain".to_string()),
            tags: Some(HashMap::from([("team".to_string(), "backend".to_string())])),
            enabled: Some(true),
            expires: Some("2026-01-01T00:00:00Z".to_string()),
            not_before: None,
        };
        let json = serde_json::to_string(&req).expect("serialize");
        assert!(json.contains("my-secret"));
        // Value should be serialized (needed for IPC), but never logged
        assert!(json.contains("super-secret-value"));
    }

    #[test]
    fn audit_entry_serialization() {
        let entry = AuditEntry {
            timestamp: "2024-06-15T10:00:00Z".to_string(),
            vault_name: "my-vault".to_string(),
            action: "get_secret_value".to_string(),
            item_type: "secret".to_string(),
            item_name: "db-conn".to_string(),
            result: "success".to_string(),
            details: Some("[REDACTED]".to_string()),
        };
        let json = serde_json::to_string(&entry).expect("serialize");
        assert!(json.contains("vaultName"));
        assert!(json.contains("itemType"));
        assert!(json.contains("[REDACTED]"));
    }
}
