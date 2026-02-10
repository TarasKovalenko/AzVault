use crate::models::{DeviceCodeResponse, TokenResponse};
use keyring::Entry;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;
use std::sync::Arc;
use tokio::sync::RwLock;

const AZURE_CLIENT_ID: &str = "04b07795-a71b-4346-935f-02f9a1efa4ce";
const AUTHORITY: &str = "https://login.microsoftonline.com";
const MANAGEMENT_SCOPE: &str = "https://management.azure.com/.default";
const VAULT_SCOPE: &str = "https://vault.azure.net/.default";
const KEYRING_SERVICE: &str = "azvault";
const KEYRING_ACCOUNT: &str = "auth_session";

#[derive(Debug, Clone)]
pub struct TokenCache {
    pub management_token: Option<TokenResponse>,
    pub vault_token: Option<TokenResponse>,
    pub management_expires_at: Option<u64>,
    pub vault_expires_at: Option<u64>,
}

impl TokenCache {
    pub fn new() -> Self {
        Self {
            management_token: None,
            vault_token: None,
            management_expires_at: None,
            vault_expires_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedSession {
    tenant_id: String,
    refresh_token: String,
}

pub struct AuthManager {
    client: Client,
    pub token_cache: Arc<RwLock<TokenCache>>,
    tenant_id: Arc<RwLock<String>>,
}

impl AuthManager {
    pub fn new() -> Self {
        let persisted = Self::load_session();
        let initial_tenant = persisted
            .as_ref()
            .map(|p| p.tenant_id.clone())
            .unwrap_or_else(|| "organizations".to_string());

        let mut cache = TokenCache::new();
        if let Some(p) = &persisted {
            cache.management_token = Some(TokenResponse {
                access_token: String::new(),
                refresh_token: Some(p.refresh_token.clone()),
                expires_in: 0,
                token_type: "Bearer".to_string(),
            });
            cache.management_expires_at = Some(0);
        }

        Self {
            client: Client::new(),
            token_cache: Arc::new(RwLock::new(cache)),
            tenant_id: Arc::new(RwLock::new(initial_tenant)),
        }
    }

    pub async fn set_tenant(&self, tenant_id: &str) {
        let mut tid = self.tenant_id.write().await;
        *tid = tenant_id.to_string();

        let mut cache = self.token_cache.write().await;
        let refresh = cache
            .management_token
            .as_ref()
            .and_then(|t| t.refresh_token.clone());
        *cache = TokenCache::new();

        if let Some(refresh_token) = refresh {
            Self::save_session(tenant_id, &refresh_token);
            cache.management_token = Some(TokenResponse {
                access_token: String::new(),
                refresh_token: Some(refresh_token),
                expires_in: 0,
                token_type: "Bearer".to_string(),
            });
        } else {
            Self::clear_session();
        }
    }

    pub async fn get_tenant(&self) -> String {
        self.tenant_id.read().await.clone()
    }

    pub async fn start_device_code_flow(&self) -> Result<DeviceCodeResponse, String> {
        let tenant = self.tenant_id.read().await.clone();
        let url = format!("{}/{}/oauth2/v2.0/devicecode", AUTHORITY, tenant);

        let resp = self
            .client
            .post(&url)
            .form(&[
                ("client_id", AZURE_CLIENT_ID),
                ("scope", &format!("{} offline_access", MANAGEMENT_SCOPE)),
            ])
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

        if let Some(error) = body.get("error") {
            return Err(format!(
                "Auth error: {} - {}",
                error.as_str().unwrap_or("unknown"),
                body.get("error_description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
            ));
        }

        Ok(DeviceCodeResponse {
            device_code: body["device_code"].as_str().unwrap_or_default().to_string(),
            user_code: body["user_code"].as_str().unwrap_or_default().to_string(),
            verification_uri: body["verification_uri"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            expires_in: body["expires_in"].as_u64().unwrap_or(900),
            interval: body["interval"].as_u64().unwrap_or(5),
            message: body["message"].as_str().unwrap_or_default().to_string(),
        })
    }

    pub async fn poll_device_code(&self, device_code: &str) -> Result<TokenResponse, String> {
        let tenant = self.tenant_id.read().await.clone();
        let url = format!("{}/{}/oauth2/v2.0/token", AUTHORITY, tenant);

        let resp = self
            .client
            .post(&url)
            .form(&[
                ("client_id", AZURE_CLIENT_ID),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ("device_code", device_code),
            ])
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

        if let Some(error) = body.get("error") {
            let error_str = error.as_str().unwrap_or("unknown");
            if error_str == "authorization_pending" {
                return Err("authorization_pending".to_string());
            }
            if error_str == "slow_down" {
                return Err("slow_down".to_string());
            }
            return Err(format!(
                "Auth error: {} - {}",
                error_str,
                body.get("error_description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
            ));
        }

        let token = TokenResponse {
            access_token: body["access_token"].as_str().unwrap_or_default().to_string(),
            refresh_token: body
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            expires_in: body["expires_in"].as_u64().unwrap_or(3600),
            token_type: body["token_type"].as_str().unwrap_or("Bearer").to_string(),
        };

        let now = Self::epoch_now();
        let tenant = self.tenant_id.read().await.clone();

        let mut cache = self.token_cache.write().await;
        cache.management_expires_at = Some(now + token.expires_in);
        cache.management_token = Some(token.clone());

        if let Some(refresh_token) = &token.refresh_token {
            Self::save_session(&tenant, refresh_token);
        }

        Ok(token)
    }

    pub async fn get_management_token(&self) -> Result<String, String> {
        let now = Self::epoch_now();

        {
            let cache = self.token_cache.read().await;
            if let (Some(token), Some(expires)) = (&cache.management_token, cache.management_expires_at) {
                if !token.access_token.is_empty() && now < expires.saturating_sub(60) {
                    return Ok(token.access_token.clone());
                }
            }
        }

        {
            let cache = self.token_cache.read().await;
            if let Some(refresh) = cache
                .management_token
                .as_ref()
                .and_then(|t| t.refresh_token.clone())
            {
                drop(cache);
                if let Ok(token) = self.refresh_token(&refresh, MANAGEMENT_SCOPE, true).await {
                    return Ok(token);
                }
            }
        }

        if let Ok(token) = self.get_az_cli_token("https://management.azure.com/") {
            return Ok(token);
        }

        Err("Not authenticated. Please sign in (or run az login).".to_string())
    }

    pub async fn get_vault_token(&self) -> Result<String, String> {
        let now = Self::epoch_now();

        {
            let cache = self.token_cache.read().await;
            if let (Some(token), Some(expires)) = (&cache.vault_token, cache.vault_expires_at) {
                if !token.access_token.is_empty() && now < expires.saturating_sub(60) {
                    return Ok(token.access_token.clone());
                }
            }
        }

        {
            let cache = self.token_cache.read().await;
            if let Some(refresh) = cache
                .management_token
                .as_ref()
                .and_then(|t| t.refresh_token.clone())
            {
                drop(cache);
                if let Ok(token) = self.refresh_token(&refresh, VAULT_SCOPE, false).await {
                    return Ok(token);
                }
            }
        }

        if let Ok(token) = self.get_az_cli_token("https://vault.azure.net") {
            return Ok(token);
        }

        Err("Not authenticated. Please sign in (or run az login).".to_string())
    }

    async fn refresh_token(
        &self,
        refresh_token: &str,
        scope: &str,
        is_management: bool,
    ) -> Result<String, String> {
        let tenant = self.tenant_id.read().await.clone();
        let url = format!("{}/{}/oauth2/v2.0/token", AUTHORITY, tenant);

        let resp = self
            .client
            .post(&url)
            .form(&[
                ("client_id", AZURE_CLIENT_ID),
                ("grant_type", "refresh_token"),
                ("refresh_token", refresh_token),
                ("scope", &format!("{} offline_access", scope)),
            ])
            .send()
            .await
            .map_err(|e| format!("Network error: {}", e))?;

        let body: Value = resp.json().await.map_err(|e| format!("Parse error: {}", e))?;

        if body.get("error").is_some() {
            return Err(format!(
                "Token refresh failed: {}",
                body.get("error_description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
            ));
        }

        let token = TokenResponse {
            access_token: body["access_token"].as_str().unwrap_or_default().to_string(),
            refresh_token: body
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            expires_in: body["expires_in"].as_u64().unwrap_or(3600),
            token_type: body["token_type"].as_str().unwrap_or("Bearer").to_string(),
        };

        let now = Self::epoch_now();
        let tenant = self.tenant_id.read().await.clone();
        let mut cache = self.token_cache.write().await;

        if is_management {
            cache.management_expires_at = Some(now + token.expires_in);
            cache.management_token = Some(token.clone());
            if let Some(refresh) = &token.refresh_token {
                Self::save_session(&tenant, refresh);
            }
        } else {
            cache.vault_expires_at = Some(now + token.expires_in);
            cache.vault_token = Some(token.clone());
        }

        Ok(token.access_token)
    }

    pub async fn sign_out(&self) {
        let mut cache = self.token_cache.write().await;
        *cache = TokenCache::new();
        Self::clear_session();
    }

    pub async fn is_signed_in(&self) -> bool {
        if self.get_management_token().await.is_ok() {
            return true;
        }
        Self::load_session().is_some()
    }

    fn get_az_cli_token(&self, resource: &str) -> Result<String, String> {
        let output = Command::new("az")
            .args([
                "account",
                "get-access-token",
                "--resource",
                resource,
                "--output",
                "json",
            ])
            .output()
            .map_err(|e| format!("Azure CLI not available: {}", e))?;

        if !output.status.success() {
            return Err(String::from_utf8_lossy(&output.stderr).to_string());
        }

        let body: Value = serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Failed to parse Azure CLI token response: {}", e))?;

        body.get("accessToken")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| "Azure CLI token response did not contain accessToken".to_string())
    }

    fn epoch_now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    fn load_session() -> Option<PersistedSession> {
        let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).ok()?;
        let raw = entry.get_password().ok()?;
        serde_json::from_str::<PersistedSession>(&raw).ok()
    }

    fn save_session(tenant_id: &str, refresh_token: &str) {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            let payload = PersistedSession {
                tenant_id: tenant_id.to_string(),
                refresh_token: refresh_token.to_string(),
            };
            if let Ok(json) = serde_json::to_string(&payload) {
                let _ = entry.set_password(&json);
            }
        }
    }

    fn clear_session() {
        if let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            let _ = entry.delete_credential();
        }
    }
}
