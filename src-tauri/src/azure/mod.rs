//! Azure REST client for ARM and Key Vault data-plane operations.
//!
//! Design principles:
//! - Minimal surface area: only the APIs AzVault needs are implemented.
//! - Every outbound request is validated against an HTTPS-only host allowlist.
//! - Retry logic with exponential backoff + Retry-After header support.
//! - Pagination support for list endpoints (follows `nextLink`).
//!
//! This client does NOT cache tokens or store any credentials.

use crate::models::*;
use reqwest::{Client, Method};
use serde_json::Value;
use std::time::Duration;
use url::Url;

// ── API version constants ──

const ARM_BASE: &str = "https://management.azure.com";
const API_VERSION_TENANTS: &str = "2022-12-01";
const API_VERSION_SUBSCRIPTIONS: &str = "2022-12-01";
const API_VERSION_RESOURCES: &str = "2021-04-01";
const API_VERSION_KEYVAULT_MGMT: &str = "2023-07-01";
const API_VERSION_KEYVAULT_DATA: &str = "7.5";

/// Maximum number of retries for transient failures (429/5xx).
const MAX_RETRIES: usize = 3;

/// HTTP client wrapper for Azure REST APIs.
pub struct AzureClient {
    client: Client,
}

impl AzureClient {
    /// Creates a new client with conservative timeouts (10s connect, 30s total).
    pub fn new() -> Self {
        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self { client }
    }

    // ── ARM discovery endpoints ──

    /// Lists all Azure AD tenants accessible to the authenticated identity.
    pub async fn list_tenants(&self, token: &str) -> Result<Vec<Tenant>, String> {
        let url = format!("{}/tenants?api-version={}", ARM_BASE, API_VERSION_TENANTS);
        let body = self.request_json(Method::GET, &url, token, None).await?;

        let tenants = body["value"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|t| Tenant {
                id: t["id"].as_str().unwrap_or_default().to_string(),
                tenant_id: t["tenantId"].as_str().unwrap_or_default().to_string(),
                display_name: t
                    .get("displayName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .or_else(|| {
                        t.get("defaultDomain")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    }),
            })
            .collect();

        Ok(tenants)
    }

    /// Lists all subscriptions accessible to the authenticated identity.
    pub async fn list_subscriptions(&self, token: &str) -> Result<Vec<Subscription>, String> {
        let url = format!(
            "{}/subscriptions?api-version={}",
            ARM_BASE, API_VERSION_SUBSCRIPTIONS
        );
        let body = self.request_json(Method::GET, &url, token, None).await?;

        let subs = body["value"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|s| Subscription {
                subscription_id: s["subscriptionId"].as_str().unwrap_or_default().to_string(),
                display_name: s["displayName"].as_str().unwrap_or_default().to_string(),
                state: s["state"].as_str().unwrap_or_default().to_string(),
                tenant_id: s
                    .get("tenantId")
                    .and_then(|v| v.as_str())
                    .or_else(|| s.get("homeTenantId").and_then(|v| v.as_str()))
                    .unwrap_or_default()
                    .to_string(),
            })
            .collect();

        Ok(subs)
    }

    /// Lists Key Vault resources within a subscription using ARM resource query.
    /// Also fetches soft-delete state for each vault (separate API call).
    pub async fn list_keyvaults(
        &self,
        token: &str,
        subscription_id: &str,
    ) -> Result<Vec<KeyVaultInfo>, String> {
        let url = format!(
            "{}/subscriptions/{}/resources?$filter=resourceType eq 'Microsoft.KeyVault/vaults'&api-version={}",
            ARM_BASE, subscription_id, API_VERSION_RESOURCES
        );

        let body = self.request_json(Method::GET, &url, token, None).await?;

        let mut vaults: Vec<KeyVaultInfo> = Vec::new();
        for v in body["value"].as_array().cloned().unwrap_or_default() {
            let id = v["id"].as_str().unwrap_or_default();
            let name = v["name"].as_str().unwrap_or_default();
            let location = v["location"].as_str().unwrap_or_default();

            // Extract resource group from the ARM resource ID
            let rg = id
                .split("/resourceGroups/")
                .nth(1)
                .and_then(|s| s.split('/').next())
                .unwrap_or_default();

            let soft_delete_enabled = self
                .get_vault_soft_delete_state(token, id)
                .await
                .unwrap_or(None);

            vaults.push(KeyVaultInfo {
                id: id.to_string(),
                name: name.to_string(),
                location: location.to_string(),
                resource_group: rg.to_string(),
                vault_uri: format!("https://{}.vault.azure.net", name),
                tags: v
                    .get("tags")
                    .and_then(|t| serde_json::from_value(t.clone()).ok()),
                soft_delete_enabled,
            });
        }

        Ok(vaults)
    }

    // ── Key Vault data-plane: Secrets ──

    /// Lists all secrets in a vault (follows pagination via `nextLink`).
    pub async fn list_secrets(
        &self,
        token: &str,
        vault_uri: &str,
    ) -> Result<Vec<SecretItem>, String> {
        let url = format!(
            "{}/secrets?api-version={}",
            vault_uri, API_VERSION_KEYVAULT_DATA
        );

        let mut next_url = Some(url);
        let mut items = Vec::new();

        while let Some(current_url) = next_url {
            let body = self
                .request_json(Method::GET, &current_url, token, None)
                .await?;
            if let Some(values) = body["value"].as_array() {
                for value in values {
                    items.push(Self::parse_secret_item(value));
                }
            }
            next_url = body
                .get("nextLink")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }

        Ok(items)
    }

    /// Fetches the latest version's metadata for a specific secret.
    pub async fn get_secret_metadata(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<SecretItem, String> {
        let url = format!(
            "{}/secrets/{}/versions?api-version={}&maxresults=1",
            vault_uri, name, API_VERSION_KEYVAULT_DATA
        );

        let body = self.request_json(Method::GET, &url, token, None).await?;
        let maybe_item = body["value"]
            .as_array()
            .and_then(|arr| arr.first())
            .map(Self::parse_secret_item);

        maybe_item.ok_or_else(|| format!("Secret metadata not found for '{}'", name))
    }

    /// Fetches the actual secret value (sensitive – should be audited).
    pub async fn get_secret_value(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<SecretValue, String> {
        let url = format!(
            "{}/secrets/{}?api-version={}",
            vault_uri, name, API_VERSION_KEYVAULT_DATA
        );

        let body = self.request_json(Method::GET, &url, token, None).await?;

        Ok(SecretValue {
            value: body["value"].as_str().unwrap_or_default().to_string(),
            id: body["id"].as_str().unwrap_or_default().to_string(),
            name: name.to_string(),
        })
    }

    /// Creates or updates a secret (creates a new version if name exists).
    pub async fn set_secret(
        &self,
        token: &str,
        vault_uri: &str,
        req: &CreateSecretRequest,
    ) -> Result<SecretItem, String> {
        let url = format!(
            "{}/secrets/{}?api-version={}",
            vault_uri, req.name, API_VERSION_KEYVAULT_DATA
        );

        let mut payload = serde_json::json!({
            "value": req.value,
            "attributes": {
                "enabled": req.enabled.unwrap_or(true)
            }
        });

        if let Some(ct) = &req.content_type {
            payload["contentType"] = serde_json::json!(ct);
        }
        if let Some(tags) = &req.tags {
            payload["tags"] = serde_json::json!(tags);
        }
        if let Some(exp) = &req.expires {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(exp) {
                payload["attributes"]["exp"] = serde_json::json!(dt.timestamp());
            }
        }
        if let Some(nbf) = &req.not_before {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(nbf) {
                payload["attributes"]["nbf"] = serde_json::json!(dt.timestamp());
            }
        }

        let body = self
            .request_json(Method::PUT, &url, token, Some(payload))
            .await?;

        Ok(Self::parse_secret_item(&body))
    }

    /// Soft-deletes a secret (recoverable if soft-delete is enabled).
    pub async fn delete_secret(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<(), String> {
        let url = format!(
            "{}/secrets/{}?api-version={}",
            vault_uri, name, API_VERSION_KEYVAULT_DATA
        );
        self.request_json(Method::DELETE, &url, token, None).await?;
        Ok(())
    }

    /// Recovers a soft-deleted secret.
    pub async fn recover_secret(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<(), String> {
        let url = format!(
            "{}/deletedsecrets/{}/recover?api-version={}",
            vault_uri, name, API_VERSION_KEYVAULT_DATA
        );
        self.request_json(Method::POST, &url, token, None).await?;
        Ok(())
    }

    /// Permanently purges a deleted secret (irreversible).
    pub async fn purge_secret(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<(), String> {
        let url = format!(
            "{}/deletedsecrets/{}?api-version={}",
            vault_uri, name, API_VERSION_KEYVAULT_DATA
        );
        self.request_json(Method::DELETE, &url, token, None).await?;
        Ok(())
    }

    // ── Key Vault data-plane: Keys ──

    /// Lists all cryptographic keys in a vault (paginated).
    pub async fn list_keys(&self, token: &str, vault_uri: &str) -> Result<Vec<KeyItem>, String> {
        let url = format!(
            "{}/keys?api-version={}",
            vault_uri, API_VERSION_KEYVAULT_DATA
        );

        let mut items = Vec::new();
        let mut next_url = Some(url);

        while let Some(current_url) = next_url {
            let body = self
                .request_json(Method::GET, &current_url, token, None)
                .await?;

            if let Some(values) = body["value"].as_array() {
                for v in values {
                    let id = v["kid"].as_str().unwrap_or_default().to_string();
                    let name = Self::extract_name_from_id(&id, "keys");
                    let attrs = &v["attributes"];

                    items.push(KeyItem {
                        id,
                        name,
                        enabled: attrs["enabled"].as_bool().unwrap_or(true),
                        created: Self::epoch_to_rfc3339(
                            attrs.get("created").and_then(|v| v.as_u64()),
                        ),
                        updated: Self::epoch_to_rfc3339(
                            attrs.get("updated").and_then(|v| v.as_u64()),
                        ),
                        expires: Self::epoch_to_rfc3339(attrs.get("exp").and_then(|v| v.as_u64())),
                        not_before: Self::epoch_to_rfc3339(
                            attrs.get("nbf").and_then(|v| v.as_u64()),
                        ),
                        key_type: v.get("kty").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        key_ops: v.get("key_ops").and_then(|v| v.as_array()).map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        }),
                        tags: v
                            .get("tags")
                            .and_then(|t| serde_json::from_value(t.clone()).ok()),
                        managed: v.get("managed").and_then(|v| v.as_bool()),
                    });
                }
            }

            next_url = body
                .get("nextLink")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }

        Ok(items)
    }

    // ── Key Vault data-plane: Certificates ──

    /// Lists all X.509 certificates in a vault (paginated).
    pub async fn list_certificates(
        &self,
        token: &str,
        vault_uri: &str,
    ) -> Result<Vec<CertificateItem>, String> {
        let url = format!(
            "{}/certificates?api-version={}",
            vault_uri, API_VERSION_KEYVAULT_DATA
        );

        let mut items = Vec::new();
        let mut next_url = Some(url);

        while let Some(current_url) = next_url {
            let body = self
                .request_json(Method::GET, &current_url, token, None)
                .await?;

            if let Some(values) = body["value"].as_array() {
                for v in values {
                    let id = v["id"].as_str().unwrap_or_default().to_string();
                    let name = Self::extract_name_from_id(&id, "certificates");
                    let attrs = &v["attributes"];

                    items.push(CertificateItem {
                        id,
                        name,
                        enabled: attrs["enabled"].as_bool().unwrap_or(true),
                        created: Self::epoch_to_rfc3339(
                            attrs.get("created").and_then(|v| v.as_u64()),
                        ),
                        updated: Self::epoch_to_rfc3339(
                            attrs.get("updated").and_then(|v| v.as_u64()),
                        ),
                        expires: Self::epoch_to_rfc3339(attrs.get("exp").and_then(|v| v.as_u64())),
                        not_before: Self::epoch_to_rfc3339(
                            attrs.get("nbf").and_then(|v| v.as_u64()),
                        ),
                        subject: v
                            .get("policy")
                            .and_then(|p| p.get("x509_props"))
                            .and_then(|x| x.get("subject"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        thumbprint: v.get("x5t").and_then(|v| v.as_str()).map(|s| s.to_string()),
                        tags: v
                            .get("tags")
                            .and_then(|t| serde_json::from_value(t.clone()).ok()),
                    });
                }
            }

            next_url = body
                .get("nextLink")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
        }

        Ok(items)
    }

    // ── Internal helpers ──

    /// Fetches vault-level properties to determine soft-delete state.
    async fn get_vault_soft_delete_state(
        &self,
        token: &str,
        vault_id: &str,
    ) -> Result<Option<bool>, String> {
        let url = format!(
            "{}{}?api-version={}",
            ARM_BASE, vault_id, API_VERSION_KEYVAULT_MGMT
        );
        let body = self.request_json(Method::GET, &url, token, None).await?;
        Ok(body
            .get("properties")
            .and_then(|p| p.get("enableSoftDelete"))
            .and_then(|v| v.as_bool()))
    }

    /// Core HTTP request handler with URL allowlist, retry, and backoff.
    ///
    /// # Security
    /// Every outbound URL is validated against `is_allowed_azure_url`
    /// before any network I/O occurs (defense-in-depth).
    async fn request_json(
        &self,
        method: Method,
        url: &str,
        token: &str,
        payload: Option<Value>,
    ) -> Result<Value, String> {
        if !Self::is_allowed_azure_url(url) {
            return Err("Blocked outbound request to non-Azure endpoint.".to_string());
        }

        let mut attempt = 0usize;
        loop {
            let mut req = self.client.request(method.clone(), url).bearer_auth(token);
            if let Some(p) = &payload {
                req = req.json(p);
            }

            let response = req.send().await;

            match response {
                Ok(resp) => {
                    let status = resp.status();
                    let retry_after = resp
                        .headers()
                        .get(reqwest::header::RETRY_AFTER)
                        .and_then(|h| h.to_str().ok())
                        .and_then(|s| s.parse::<u64>().ok());
                    let body: Value = resp.json().await.unwrap_or_else(|_| serde_json::json!({}));

                    if status.is_success() {
                        return Ok(body);
                    }

                    // Retry on 429 (rate limit) or 5xx (server errors)
                    let should_retry = status.as_u16() == 429 || status.is_server_error();
                    if should_retry && attempt < MAX_RETRIES {
                        let backoff_secs = retry_after.unwrap_or((1_u64 << attempt).min(8));
                        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                        attempt += 1;
                        continue;
                    }

                    return Err(Self::parse_error(&body, status.as_u16()));
                }
                Err(err) => {
                    if attempt < MAX_RETRIES {
                        let backoff_secs = (1_u64 << attempt).min(8);
                        tokio::time::sleep(Duration::from_secs(backoff_secs)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(format!("Network error: {}", err));
                }
            }
        }
    }

    /// Parses a Key Vault secret JSON object into a `SecretItem`.
    fn parse_secret_item(v: &Value) -> SecretItem {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        let name = Self::extract_name_from_id(&id, "secrets");
        let attrs = &v["attributes"];

        SecretItem {
            id,
            name,
            enabled: attrs["enabled"].as_bool().unwrap_or(true),
            created: Self::epoch_to_rfc3339(attrs.get("created").and_then(|v| v.as_u64())),
            updated: Self::epoch_to_rfc3339(attrs.get("updated").and_then(|v| v.as_u64())),
            expires: Self::epoch_to_rfc3339(attrs.get("exp").and_then(|v| v.as_u64())),
            not_before: Self::epoch_to_rfc3339(attrs.get("nbf").and_then(|v| v.as_u64())),
            content_type: v
                .get("contentType")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            tags: v
                .get("tags")
                .and_then(|t| serde_json::from_value(t.clone()).ok()),
            managed: v.get("managed").and_then(|v| v.as_bool()),
        }
    }

    /// Extracts the entity name from a Key Vault ID URL.
    /// e.g., `https://vault.azure.net/secrets/my-secret/v1` -> `my-secret`
    fn extract_name_from_id(id: &str, entity: &str) -> String {
        let parts: Vec<&str> = id.split('/').collect();
        for i in 0..parts.len() {
            if parts[i] == entity {
                return parts.get(i + 1).unwrap_or(&"").to_string();
            }
        }
        parts.last().unwrap_or(&"").to_string()
    }

    /// Converts a Unix epoch timestamp to RFC 3339 string.
    fn epoch_to_rfc3339(epoch: Option<u64>) -> Option<String> {
        epoch
            .and_then(|ts| chrono::DateTime::from_timestamp(ts as i64, 0).map(|dt| dt.to_rfc3339()))
    }

    /// Formats an Azure REST API error response into a user-friendly message
    /// with contextual hints for common HTTP status codes.
    fn parse_error(body: &Value, status: u16) -> String {
        let code = body["error"]["code"].as_str().unwrap_or("UnknownError");
        let message = body["error"]["message"]
            .as_str()
            .or_else(|| body["error_description"].as_str())
            .unwrap_or("An unknown error occurred");

        let hint = match status {
            401 => Some("Your session may have expired. Try signing in again."),
            403 => Some("You don't have permission. Check your Azure RBAC role or access policy."),
            404 => Some("The resource was not found. It may have been deleted."),
            429 => Some("Too many requests. The app applied retry with backoff."),
            _ => None,
        };

        let mut result = format!("[{}] {}: {}", status, code, message);
        if let Some(h) = hint {
            result.push_str(&format!(" | Hint: {}", h));
        }
        result
    }

    /// Validates that a URL targets an allowed Azure endpoint.
    /// Only HTTPS connections to known Azure hosts are permitted.
    fn is_allowed_azure_url(url: &str) -> bool {
        let parsed = match Url::parse(url) {
            Ok(v) => v,
            Err(_) => return false,
        };

        // Only HTTPS is allowed
        if parsed.scheme() != "https" {
            return false;
        }

        let Some(host) = parsed.host_str() else {
            return false;
        };

        // Allow ARM management plane and Key Vault data-plane endpoints
        host == "management.azure.com"
            || host.ends_with(".vault.azure.net")
            || host.ends_with(".vault.usgovcloudapi.net")
            || host.ends_with(".vault.azure.cn")
    }
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn extracts_name_from_secret_id() {
        let name = AzureClient::extract_name_from_id(
            "https://demo.vault.azure.net/secrets/my-secret/version-1",
            "secrets",
        );
        assert_eq!(name, "my-secret");
    }

    #[test]
    fn extracts_name_from_key_id() {
        let name = AzureClient::extract_name_from_id(
            "https://demo.vault.azure.net/keys/rsa-key/v2",
            "keys",
        );
        assert_eq!(name, "rsa-key");
    }

    #[test]
    fn extracts_name_from_certificate_id() {
        let name = AzureClient::extract_name_from_id(
            "https://demo.vault.azure.net/certificates/tls-cert/v1",
            "certificates",
        );
        assert_eq!(name, "tls-cert");
    }

    #[test]
    fn extract_name_falls_back_to_last_segment() {
        let name = AzureClient::extract_name_from_id(
            "https://demo.vault.azure.net/unknown-path",
            "secrets",
        );
        assert_eq!(name, "unknown-path");
    }

    #[test]
    fn extract_name_handles_empty_string() {
        let name = AzureClient::extract_name_from_id("", "secrets");
        assert_eq!(name, "");
    }

    #[test]
    fn epoch_to_rfc3339_converts_known_timestamp() {
        // 2024-01-01T00:00:00Z = 1704067200
        let result = AzureClient::epoch_to_rfc3339(Some(1704067200));
        assert!(result.is_some());
        assert!(result.unwrap().starts_with("2024-01-01"));
    }

    #[test]
    fn epoch_to_rfc3339_handles_none() {
        assert!(AzureClient::epoch_to_rfc3339(None).is_none());
    }

    #[test]
    fn epoch_to_rfc3339_handles_zero() {
        let result = AzureClient::epoch_to_rfc3339(Some(0));
        assert!(result.is_some());
        assert!(result.unwrap().contains("1970"));
    }

    #[test]
    fn parses_error_with_hint_403() {
        let body = json!({
            "error": {
                "code": "Forbidden",
                "message": "No access to vault"
            }
        });
        let result = AzureClient::parse_error(&body, 403);
        assert!(result.contains("Hint"));
        assert!(result.contains("permission"));
    }

    #[test]
    fn parses_error_with_hint_401() {
        let body = json!({
            "error": {
                "code": "Unauthorized",
                "message": "Token expired"
            }
        });
        let result = AzureClient::parse_error(&body, 401);
        assert!(result.contains("expired"));
    }

    #[test]
    fn parses_error_without_hint_for_500() {
        let body = json!({
            "error": {
                "code": "InternalServerError",
                "message": "Something went wrong"
            }
        });
        let result = AzureClient::parse_error(&body, 500);
        assert!(result.contains("InternalServerError"));
        assert!(!result.contains("Hint"));
    }

    #[test]
    fn parses_error_with_fallback_description() {
        let body = json!({
            "error_description": "OAuth token invalid"
        });
        let result = AzureClient::parse_error(&body, 401);
        assert!(result.contains("OAuth token invalid"));
    }

    #[test]
    fn allows_azure_public_management_url() {
        assert!(AzureClient::is_allowed_azure_url(
            "https://management.azure.com/subscriptions"
        ));
    }

    #[test]
    fn allows_vault_data_plane_url() {
        assert!(AzureClient::is_allowed_azure_url(
            "https://my-vault.vault.azure.net/secrets/test"
        ));
    }

    #[test]
    fn allows_us_gov_vault_url() {
        assert!(AzureClient::is_allowed_azure_url(
            "https://my-vault.vault.usgovcloudapi.net/keys"
        ));
    }

    #[test]
    fn allows_china_vault_url() {
        assert!(AzureClient::is_allowed_azure_url(
            "https://my-vault.vault.azure.cn/certificates"
        ));
    }

    #[test]
    fn rejects_non_azure_url() {
        assert!(!AzureClient::is_allowed_azure_url(
            "https://evil.example.com/data"
        ));
    }

    #[test]
    fn rejects_http_url() {
        assert!(!AzureClient::is_allowed_azure_url(
            "http://management.azure.com/subscriptions"
        ));
    }

    #[test]
    fn rejects_invalid_url() {
        assert!(!AzureClient::is_allowed_azure_url("not a url"));
    }

    #[test]
    fn rejects_empty_url() {
        assert!(!AzureClient::is_allowed_azure_url(""));
    }

    #[test]
    fn rejects_url_with_azure_in_subdomain_but_wrong_host() {
        // Prevent subdomain spoofing
        assert!(!AzureClient::is_allowed_azure_url(
            "https://vault.azure.net.evil.com/secrets"
        ));
    }

    #[test]
    fn parse_secret_item_from_kv_response() {
        let kv_json = json!({
            "id": "https://myvault.vault.azure.net/secrets/db-conn/abc123",
            "attributes": {
                "enabled": true,
                "created": 1704067200,
                "updated": 1704153600,
                "exp": 1735689600
            },
            "contentType": "text/plain",
            "tags": {"env": "prod"},
            "managed": false
        });

        let item = AzureClient::parse_secret_item(&kv_json);
        assert_eq!(item.name, "db-conn");
        assert!(item.enabled);
        assert!(item.created.is_some());
        assert_eq!(item.content_type.as_deref(), Some("text/plain"));
        assert_eq!(item.tags.unwrap().get("env").unwrap(), "prod");
    }

    #[test]
    fn parse_secret_item_handles_minimal_response() {
        let kv_json = json!({
            "id": "https://myvault.vault.azure.net/secrets/minimal",
            "attributes": {}
        });

        let item = AzureClient::parse_secret_item(&kv_json);
        assert_eq!(item.name, "minimal");
        assert!(item.enabled); // defaults to true
        assert!(item.created.is_none());
        assert!(item.content_type.is_none());
        assert!(item.tags.is_none());
    }
}
