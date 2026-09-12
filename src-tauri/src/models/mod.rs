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
#[derive(Clone, Serialize, Deserialize)]
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

/// Hand-written so the secret material never reaches a log line, a panic
/// message or an `unwrap()` on a `Result` containing this type. Deriving
/// `Debug` would print `value` in full.
impl std::fmt::Debug for CreateSecretRequest {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CreateSecretRequest")
            .field("name", &self.name)
            .field("value", &"[redacted]")
            .field("content_type", &self.content_type)
            .field("tags", &self.tags)
            .field("enabled", &self.enabled)
            .field("expires", &self.expires)
            .field("not_before", &self.not_before)
            .finish()
    }
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
        assert!(!restored.enabled);
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

#[cfg(test)]
mod wire_format_tests {
    use super::*;

    /// Every field name the React UI reads off the IPC boundary, sorted so
    /// the assertions do not depend on serde_json's map ordering.
    fn field_names(value: &serde_json::Value) -> Vec<String> {
        let mut names: Vec<String> = value
            .as_object()
            .expect("model should serialize to an object")
            .keys()
            .cloned()
            .collect();
        names.sort();
        names
    }

    /// Sorted copy of an expected field-name list.
    fn expect(names: &[&str]) -> Vec<String> {
        let mut names: Vec<String> = names.iter().map(|s| (*s).to_string()).collect();
        names.sort();
        names
    }

    #[test]
    fn auth_state_uses_snake_case_on_the_wire() {
        // AuthState deliberately has no rename_all attribute.
        let json = serde_json::to_value(AuthState {
            signed_in: true,
            user_name: Some("u".to_string()),
            tenant_id: Some("t".to_string()),
        })
        .unwrap();
        assert_eq!(
            field_names(&json),
            expect(&["signed_in", "user_name", "tenant_id"])
        );
    }

    #[test]
    fn auth_state_signed_out_round_trip() {
        let state = AuthState {
            signed_in: false,
            user_name: None,
            tenant_id: None,
        };
        let json = serde_json::to_string(&state).unwrap();
        let back: AuthState = serde_json::from_str(&json).unwrap();
        assert!(!back.signed_in);
        assert!(back.user_name.is_none());
        assert!(back.tenant_id.is_none());
    }

    #[test]
    fn auth_state_never_carries_a_token_field() {
        let json = serde_json::to_string(&AuthState {
            signed_in: true,
            user_name: None,
            tenant_id: Some("t".to_string()),
        })
        .unwrap();
        for forbidden in ["token", "accessToken", "access_token", "secret", "password"] {
            assert!(
                !json.contains(forbidden),
                "AuthState must not expose {forbidden}: {json}"
            );
        }
    }

    #[test]
    fn tenant_uses_snake_case_on_the_wire() {
        let json = serde_json::to_value(Tenant {
            id: "i".to_string(),
            tenant_id: "t".to_string(),
            display_name: None,
        })
        .unwrap();
        assert_eq!(
            field_names(&json),
            expect(&["id", "tenant_id", "display_name"])
        );
    }

    #[test]
    fn camel_case_models_expose_exactly_the_expected_fields() {
        let cases: Vec<(serde_json::Value, Vec<&str>)> = vec![
            (
                serde_json::to_value(Subscription {
                    subscription_id: "s".to_string(),
                    display_name: "d".to_string(),
                    state: "Enabled".to_string(),
                    tenant_id: "t".to_string(),
                })
                .unwrap(),
                vec!["subscriptionId", "displayName", "state", "tenantId"],
            ),
            (
                serde_json::to_value(KeyVaultInfo {
                    id: "i".to_string(),
                    name: "n".to_string(),
                    location: "l".to_string(),
                    resource_group: "rg".to_string(),
                    vault_uri: "https://n.vault.azure.net".to_string(),
                    tags: None,
                    soft_delete_enabled: Some(true),
                })
                .unwrap(),
                vec![
                    "id",
                    "name",
                    "location",
                    "resourceGroup",
                    "vaultUri",
                    "tags",
                    "softDeleteEnabled",
                ],
            ),
            (
                serde_json::to_value(SecretValue {
                    value: "v".to_string(),
                    id: "i".to_string(),
                    name: "n".to_string(),
                })
                .unwrap(),
                vec!["value", "id", "name"],
            ),
            (
                serde_json::to_value(AuditEntry {
                    timestamp: "t".to_string(),
                    vault_name: "v".to_string(),
                    action: "a".to_string(),
                    item_type: "secret".to_string(),
                    item_name: "i".to_string(),
                    result: "success".to_string(),
                    details: None,
                })
                .unwrap(),
                vec![
                    "timestamp",
                    "vaultName",
                    "action",
                    "itemType",
                    "itemName",
                    "result",
                    "details",
                ],
            ),
        ];

        for (json, expected) in cases {
            assert_eq!(field_names(&json), expect(&expected), "payload={json}");
        }
    }

    #[test]
    fn secret_item_field_names_are_stable() {
        let json = serde_json::to_value(SecretItem {
            id: "i".to_string(),
            name: "n".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            content_type: None,
            tags: None,
            managed: None,
        })
        .unwrap();
        assert_eq!(
            field_names(&json),
            expect(&[
                "id",
                "name",
                "enabled",
                "created",
                "updated",
                "expires",
                "notBefore",
                "contentType",
                "tags",
                "managed"
            ])
        );
        assert!(
            !json.as_object().unwrap().contains_key("value"),
            "SecretItem is metadata-only and must never carry a value"
        );
    }

    #[test]
    fn key_and_certificate_field_names_are_stable() {
        let key = serde_json::to_value(KeyItem {
            id: "i".to_string(),
            name: "n".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            key_type: None,
            key_ops: None,
            tags: None,
            managed: None,
        })
        .unwrap();
        assert_eq!(
            field_names(&key),
            expect(&[
                "id",
                "name",
                "enabled",
                "created",
                "updated",
                "expires",
                "notBefore",
                "keyType",
                "keyOps",
                "tags",
                "managed"
            ])
        );

        let cert = serde_json::to_value(CertificateItem {
            id: "i".to_string(),
            name: "n".to_string(),
            enabled: false,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            subject: None,
            thumbprint: None,
            tags: None,
        })
        .unwrap();
        assert_eq!(
            field_names(&cert),
            expect(&[
                "id",
                "name",
                "enabled",
                "created",
                "updated",
                "expires",
                "notBefore",
                "subject",
                "thumbprint",
                "tags"
            ])
        );
    }

    #[test]
    fn optional_fields_serialize_as_null_not_omitted() {
        // The UI relies on the keys always being present.
        let json = serde_json::to_value(SecretItem {
            id: "i".to_string(),
            name: "n".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            content_type: None,
            tags: None,
            managed: None,
        })
        .unwrap();
        assert!(json["created"].is_null());
        assert!(json["tags"].is_null());
    }

    #[test]
    fn create_secret_request_deserializes_from_camel_case_ipc_payload() {
        let payload = r#"{
            "name": "db-conn",
            "value": "s3cret",
            "contentType": "text/plain",
            "tags": {"env": "prod"},
            "enabled": true,
            "expires": "2026-01-01T00:00:00Z",
            "notBefore": null
        }"#;
        let req: CreateSecretRequest = serde_json::from_str(payload).unwrap();
        assert_eq!(req.name, "db-conn");
        assert_eq!(req.value, "s3cret");
        assert_eq!(req.content_type.as_deref(), Some("text/plain"));
        assert_eq!(req.enabled, Some(true));
        assert_eq!(req.expires.as_deref(), Some("2026-01-01T00:00:00Z"));
        assert!(req.not_before.is_none());
        assert_eq!(req.tags.unwrap().get("env").unwrap(), "prod");
    }

    #[test]
    fn create_secret_request_accepts_minimal_payload() {
        let req: CreateSecretRequest = serde_json::from_str(r#"{"name":"n","value":"v"}"#).unwrap();
        assert!(req.content_type.is_none());
        assert!(req.tags.is_none());
        assert!(req.enabled.is_none());
    }

    #[test]
    fn create_secret_request_rejects_payload_missing_required_fields() {
        assert!(serde_json::from_str::<CreateSecretRequest>(r#"{"name":"n"}"#).is_err());
        assert!(serde_json::from_str::<CreateSecretRequest>(r#"{"value":"v"}"#).is_err());
        assert!(serde_json::from_str::<CreateSecretRequest>(r#"{"name":1,"value":"v"}"#).is_err());
    }

    #[test]
    fn create_secret_request_debug_output_redacts_the_value() {
        let req = CreateSecretRequest {
            name: "n".to_string(),
            value: "TOPSECRET".to_string(),
            content_type: Some("text/plain".to_string()),
            tags: Some(HashMap::from([("env".to_string(), "prod".to_string())])),
            enabled: Some(true),
            expires: None,
            not_before: None,
        };

        let rendered = format!("{req:?}");
        assert!(!rendered.contains("TOPSECRET"), "{rendered}");
        assert!(rendered.contains("[redacted]"), "{rendered}");
        // every other field is still useful for diagnostics
        assert!(rendered.contains("\"n\""));
        assert!(rendered.contains("text/plain"));
        assert!(rendered.contains("prod"));
        assert!(rendered.contains("enabled: Some(true)"));

        // the alternate (`{:#?}`) form goes through the same builder
        assert!(!format!("{req:#?}").contains("TOPSECRET"));
    }

    #[test]
    fn create_secret_request_still_serialises_the_value_for_ipc() {
        // Redaction is a Debug-only concern: the real value has to reach the
        // Key Vault payload.
        let req: CreateSecretRequest =
            serde_json::from_str(r#"{"name":"n","value":"TOPSECRET"}"#).unwrap();
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains("TOPSECRET"));
        assert!(!json.contains("[redacted]"));
    }

    #[test]
    fn models_round_trip_through_json() {
        let cert = CertificateItem {
            id: "https://v.vault.azure.net/certificates/c/1".to_string(),
            name: "c".to_string(),
            enabled: true,
            created: Some("2024-01-01T00:00:00+00:00".to_string()),
            updated: None,
            expires: Some("2026-01-01T00:00:00+00:00".to_string()),
            not_before: None,
            subject: Some("CN=example.com".to_string()),
            thumbprint: Some("ABC".to_string()),
            tags: Some(HashMap::from([("env".to_string(), "prod".to_string())])),
        };
        let back: CertificateItem =
            serde_json::from_str(&serde_json::to_string(&cert).unwrap()).unwrap();
        assert_eq!(back.name, cert.name);
        assert_eq!(back.subject, cert.subject);
        assert_eq!(back.thumbprint, cert.thumbprint);
        assert_eq!(back.tags, cert.tags);

        let vault = KeyVaultInfo {
            id: "id".to_string(),
            name: "kv".to_string(),
            location: "westeurope".to_string(),
            resource_group: "rg".to_string(),
            vault_uri: "https://kv.vault.azure.net".to_string(),
            tags: None,
            soft_delete_enabled: None,
        };
        let back: KeyVaultInfo =
            serde_json::from_str(&serde_json::to_string(&vault).unwrap()).unwrap();
        assert_eq!(back.vault_uri, vault.vault_uri);
        assert!(back.soft_delete_enabled.is_none());
    }

    #[test]
    fn models_tolerate_unknown_fields_from_newer_api_versions() {
        let json = r#"{
            "id": "i", "name": "n", "enabled": true,
            "created": null, "updated": null, "expires": null, "notBefore": null,
            "contentType": null, "tags": null, "managed": null,
            "brandNewAzureField": "surprise"
        }"#;
        let item: SecretItem = serde_json::from_str(json).expect("unknown fields are ignored");
        assert_eq!(item.name, "n");
    }
}
