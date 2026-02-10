//! Authentication module – Azure CLI delegation.
//!
//! Security design:
//! - AzVault **never** owns or persists credentials.
//! - Tokens are obtained from the Azure CLI (`az account get-access-token`)
//!   on every request and held only in memory.
//! - Token requests are restricted to an allow-list of Azure resource scopes.
//! - Tenant preference is app-local and only influences the `--tenant` flag.
//!
//! This module intentionally avoids MSAL/browser-based flows to keep the
//! attack surface minimal for a desktop developer tool.

use serde_json::Value;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Default tenant value used by Azure CLI when no explicit tenant is specified.
const TENANT_DEFAULT: &str = "organizations";

/// Manages Azure CLI-based authentication for the app.
pub struct AuthManager {
    /// The currently preferred tenant ID (set by the user in the sidebar).
    tenant_id: Arc<RwLock<String>>,
}

impl AuthManager {
    /// Creates a new CLI-backed auth manager with the default tenant.
    pub fn new() -> Self {
        Self {
            tenant_id: Arc::new(RwLock::new(TENANT_DEFAULT.to_string())),
        }
    }

    /// Sets the tenant preference for subsequent token requests.
    pub async fn set_tenant(&self, tenant_id: &str) {
        let sanitized = Self::sanitize_tenant_id(tenant_id);
        let mut tid = self.tenant_id.write().await;
        *tid = sanitized;
    }

    /// Returns the currently preferred tenant ID.
    pub async fn get_tenant(&self) -> String {
        self.tenant_id.read().await.clone()
    }

    /// Requests an ARM management-plane token from Azure CLI.
    pub async fn get_management_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.get_az_cli_token("https://management.azure.com/", Some(&tenant))
    }

    /// Requests a Key Vault data-plane token from Azure CLI.
    pub async fn get_vault_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.get_az_cli_token("https://vault.azure.net", Some(&tenant))
    }

    /// Resets the tenant preference (app-level sign-out).
    /// The actual Azure CLI session is external and not invalidated here.
    pub async fn sign_out(&self) {
        let mut tid = self.tenant_id.write().await;
        *tid = TENANT_DEFAULT.to_string();
    }

    /// Returns `true` if Azure CLI can produce a valid management token.
    pub async fn is_signed_in(&self) -> bool {
        self.get_management_token().await.is_ok()
    }

    /// Calls `az account get-access-token` for an allow-listed resource scope.
    ///
    /// # Security
    /// - Only resources in `is_allowed_cli_resource` can be requested.
    /// - The tenant ID is sanitised to prevent command injection.
    fn get_az_cli_token(&self, resource: &str, tenant: Option<&str>) -> Result<String, String> {
        if !Self::is_allowed_cli_resource(resource) {
            return Err("Unsupported Azure CLI resource scope.".to_string());
        }

        let mut args = vec![
            "account",
            "get-access-token",
            "--resource",
            resource,
            "--output",
            "json",
        ];

        if let Some(tid) = tenant {
            if !tid.is_empty() && tid != TENANT_DEFAULT {
                args.push("--tenant");
                args.push(tid);
            }
        }

        let output = Command::new("az")
            .args(args)
            .output()
            .map_err(|e| format!("Azure CLI not available: {}", e))?;

        if !output.status.success() {
            return Err(
                "Azure CLI token acquisition failed. Run 'az login' and retry.".to_string(),
            );
        }

        Self::parse_cli_access_token(&output.stdout)
    }

    /// Allow-list of token resource scopes that AzVault is permitted to request.
    fn is_allowed_cli_resource(resource: &str) -> bool {
        matches!(
            resource,
            "https://management.azure.com/" | "https://vault.azure.net"
        )
    }

    /// Parses the JSON output of `az account get-access-token` and extracts
    /// the `accessToken` field.
    fn parse_cli_access_token(payload: &[u8]) -> Result<String, String> {
        let body: Value = serde_json::from_slice(payload)
            .map_err(|e| format!("Failed to parse Azure CLI token response: {}", e))?;

        body.get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Azure CLI token response did not contain accessToken.".to_string())
    }

    /// Sanitise a tenant ID to prevent shell injection.
    /// Only allow UUID-like characters (hex digits and hyphens) or the default value.
    fn sanitize_tenant_id(tenant_id: &str) -> String {
        if tenant_id == TENANT_DEFAULT {
            return TENANT_DEFAULT.to_string();
        }
        // Strip anything that isn't a hex digit or dash
        let sanitized: String = tenant_id
            .chars()
            .filter(|c| c.is_ascii_hexdigit() || *c == '-')
            .collect();
        if sanitized.is_empty() {
            TENANT_DEFAULT.to_string()
        } else {
            sanitized
        }
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cli_resource_scope_is_restricted() {
        assert!(AuthManager::is_allowed_cli_resource(
            "https://management.azure.com/"
        ));
        assert!(AuthManager::is_allowed_cli_resource(
            "https://vault.azure.net"
        ));
        // Graph and arbitrary URLs must be rejected
        assert!(!AuthManager::is_allowed_cli_resource(
            "https://graph.microsoft.com"
        ));
        assert!(!AuthManager::is_allowed_cli_resource(
            "https://evil.example.com"
        ));
    }

    #[test]
    fn parses_cli_access_token_payload() {
        let payload = br#"{"accessToken":"eyJ0eXAi...","expiresOn":"2024-01-01"}"#;
        let token = AuthManager::parse_cli_access_token(payload).expect("should parse");
        assert_eq!(token, "eyJ0eXAi...");
    }

    #[test]
    fn fails_when_cli_payload_missing_token() {
        let payload = br#"{"expiresOn":"soon"}"#;
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn fails_on_invalid_json_payload() {
        let payload = b"not json at all";
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn fails_on_empty_payload() {
        let payload = b"";
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }

    #[test]
    fn sanitizes_tenant_id_removes_injection_chars() {
        // Normal UUID-style tenant ID passes through
        assert_eq!(
            AuthManager::sanitize_tenant_id("12345678-abcd-ef01-2345-6789abcdef01"),
            "12345678-abcd-ef01-2345-6789abcdef01"
        );

        // Injection attempt is stripped (only hex digits a-f and dashes survive)
        assert_eq!(
            AuthManager::sanitize_tenant_id("tenant; rm -rf /"),
            "ea-f"
        );

        // Default value passes through unchanged
        assert_eq!(
            AuthManager::sanitize_tenant_id("organizations"),
            "organizations"
        );

        // Empty string falls back to default
        assert_eq!(
            AuthManager::sanitize_tenant_id(""),
            "organizations"
        );

        // All-special-chars falls back to default
        assert_eq!(
            AuthManager::sanitize_tenant_id("!!@@##"),
            "organizations"
        );
    }

    #[tokio::test]
    async fn set_and_get_tenant() {
        let auth = AuthManager::new();
        assert_eq!(auth.get_tenant().await, "organizations");

        auth.set_tenant("12345678-abcd-ef01-2345-6789abcdef01").await;
        assert_eq!(
            auth.get_tenant().await,
            "12345678-abcd-ef01-2345-6789abcdef01"
        );
    }

    #[tokio::test]
    async fn sign_out_resets_tenant() {
        let auth = AuthManager::new();
        auth.set_tenant("custom-tenant").await;
        assert_ne!(auth.get_tenant().await, "organizations");

        auth.sign_out().await;
        assert_eq!(auth.get_tenant().await, "organizations");
    }

    #[test]
    fn rejects_non_azure_resource_scopes() {
        let unsafe_scopes = [
            "http://management.azure.com/",  // HTTP not HTTPS
            "https://storage.azure.com",
            "https://database.windows.net",
            "",
            "not-a-url",
        ];
        for scope in &unsafe_scopes {
            assert!(
                !AuthManager::is_allowed_cli_resource(scope),
                "Should reject: {}",
                scope
            );
        }
    }
}
