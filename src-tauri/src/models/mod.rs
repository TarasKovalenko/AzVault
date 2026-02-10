use serde::{Deserialize, Serialize};

// ── Auth ──

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_subscription_in_camel_case() {
        let sub = Subscription {
            subscription_id: "sub".to_string(),
            display_name: "Display".to_string(),
            state: "Enabled".to_string(),
            tenant_id: "tenant".to_string(),
        };

        let json = serde_json::to_string(&sub).expect("should serialize");
        assert!(json.contains("subscriptionId"));
        assert!(json.contains("displayName"));
    }

    #[test]
    fn serializes_secret_item_in_camel_case() {
        let secret = SecretItem {
            id: "id".to_string(),
            name: "name".to_string(),
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
}
