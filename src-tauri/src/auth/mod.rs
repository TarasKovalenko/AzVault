//! Authentication module (Azure CLI only).
//!
//! Design notes:
//! - AzVault does not own credentials and does not persist tokens.
//! - We delegate authentication to `az login` and request short-lived access tokens on demand.
//! - Tenant preference is app-local and only influences `az account get-access-token --tenant`.

use serde_json::Value;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;

const TENANT_DEFAULT: &str = "organizations";

pub struct AuthManager {
    tenant_id: Arc<RwLock<String>>,
}

impl AuthManager {
    /// Creates a CLI-backed auth manager.
    pub fn new() -> Self {
        Self {
            tenant_id: Arc::new(RwLock::new(TENANT_DEFAULT.to_string())),
        }
    }

    /// Persists tenant preference for subsequent Azure CLI token calls.
    pub async fn set_tenant(&self, tenant_id: &str) {
        let mut tid = self.tenant_id.write().await;
        *tid = tenant_id.to_string();
    }

    /// Returns the tenant currently preferred by this app instance.
    pub async fn get_tenant(&self) -> String {
        self.tenant_id.read().await.clone()
    }

    /// Requests an ARM token from Azure CLI.
    pub async fn get_management_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.get_az_cli_token("https://management.azure.com/", Some(&tenant))
    }

    /// Requests a Key Vault data-plane token from Azure CLI.
    pub async fn get_vault_token(&self) -> Result<String, String> {
        let tenant = self.get_tenant().await;
        self.get_az_cli_token("https://vault.azure.net", Some(&tenant))
    }

    pub async fn sign_out(&self) {
        // CLI auth is external; app-level sign-out just resets tenant preference.
        let mut tid = self.tenant_id.write().await;
        *tid = TENANT_DEFAULT.to_string();
    }

    /// A session is considered signed in when Azure CLI can return a management token.
    pub async fn is_signed_in(&self) -> bool {
        self.get_management_token().await.is_ok()
    }

    /// Calls `az account get-access-token` for an allow-listed resource scope.
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

    /// Restricts token acquisition to scopes used by AzVault.
    fn is_allowed_cli_resource(resource: &str) -> bool {
        matches!(
            resource,
            "https://management.azure.com/" | "https://vault.azure.net"
        )
    }

    /// Parses Azure CLI JSON output and extracts `accessToken`.
    fn parse_cli_access_token(payload: &[u8]) -> Result<String, String> {
        let body: Value = serde_json::from_slice(payload)
            .map_err(|e| format!("Failed to parse Azure CLI token response: {}", e))?;

        body.get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Azure CLI token response did not contain accessToken".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::AuthManager;

    #[test]
    fn cli_resource_scope_is_restricted() {
        assert!(AuthManager::is_allowed_cli_resource(
            "https://management.azure.com/"
        ));
        assert!(AuthManager::is_allowed_cli_resource(
            "https://vault.azure.net"
        ));
        assert!(!AuthManager::is_allowed_cli_resource(
            "https://graph.microsoft.com"
        ));
    }

    #[test]
    fn parses_cli_access_token_payload() {
        let payload = br#"{"accessToken":"abc"}"#;
        let token = AuthManager::parse_cli_access_token(payload).expect("token should parse");
        assert_eq!(token, "abc");
    }

    #[test]
    fn fails_when_cli_payload_missing_token() {
        let payload = br#"{"expiresOn":"soon"}"#;
        assert!(AuthManager::parse_cli_access_token(payload).is_err());
    }
}
