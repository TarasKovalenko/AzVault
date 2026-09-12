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
use futures::stream::{self, StreamExt};
use reqwest::{Client, Method};
use serde_json::Value;
use std::collections::HashSet;
use std::future::Future;
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

/// Upper bound (seconds) on any single retry sleep.
///
/// The exponential schedule is capped at 8s by `MAX_RETRIES`, so in practice
/// this bound only ever bites on a server-supplied `Retry-After` header, which
/// a hostile or broken endpoint could otherwise set arbitrarily high.
const MAX_BACKOFF_SECS: u64 = 30;

/// Upper bound on pages followed through `nextLink` for a single list call.
///
/// Together with the visited-URL set this makes pagination terminate even when
/// the endpoint hands back a cycle (`A -> B -> A -> ...`).
const MAX_PAGES: usize = 100;

/// Maximum jitter (milliseconds) added to every retry sleep so that clients
/// throttled at the same moment do not all come back in lockstep.
const MAX_JITTER_MILLIS: u64 = 1_000;

/// How many per-vault ARM detail calls may be in flight at once.
///
/// High enough that listing a large subscription is bounded by the slowest
/// batch rather than by the vault count, low enough to stay well clear of ARM
/// per-subscription read throttling.
const VAULT_DETAIL_CONCURRENCY: usize = 8;

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
        let url = Self::tenants_url();
        let body = self.request_json(Method::GET, &url, token, None).await?;
        Ok(Self::parse_tenants(&body))
    }

    /// Lists all subscriptions accessible to the authenticated identity.
    pub async fn list_subscriptions(&self, token: &str) -> Result<Vec<Subscription>, String> {
        let url = Self::subscriptions_url();
        let body = self.request_json(Method::GET, &url, token, None).await?;
        Ok(Self::parse_subscriptions(&body))
    }

    /// Lists Key Vault resources within a subscription using ARM resource query.
    ///
    /// Soft-delete state lives on a different ARM endpoint, so each vault costs
    /// a second round-trip. Issuing those serially made a 40-vault subscription
    /// 41 sequential HTTPS calls; they are now run
    /// `VAULT_DETAIL_CONCURRENCY`-at-a-time, which keeps the wall clock close
    /// to the list call itself without opening one connection per vault against
    /// ARM's throttling limits. Results keep the order ARM returned them in.
    pub async fn list_keyvaults(
        &self,
        token: &str,
        subscription_id: &str,
    ) -> Result<Vec<KeyVaultInfo>, String> {
        let url = Self::keyvaults_url(subscription_id);

        let body = self.request_json(Method::GET, &url, token, None).await?;
        let raw_vaults = body["value"].as_array().cloned().unwrap_or_default();

        let vaults = map_bounded(raw_vaults, VAULT_DETAIL_CONCURRENCY, |v| async move {
            let id = v["id"].as_str().unwrap_or_default();
            let soft_delete_enabled = self
                .get_vault_soft_delete_state(token, id)
                .await
                .unwrap_or(None);

            Self::parse_keyvault_entry(&v, soft_delete_enabled)
        })
        .await;

        Ok(vaults)
    }

    // ── Key Vault data-plane: Secrets ──

    /// Lists all secrets in a vault (follows pagination via `nextLink`).
    pub async fn list_secrets(
        &self,
        token: &str,
        vault_uri: &str,
    ) -> Result<Vec<SecretItem>, String> {
        self.list_paginated(token, Self::secrets_url(vault_uri), Self::parse_secret_item)
            .await
    }

    /// Fetches the latest version's metadata for a specific secret.
    pub async fn get_secret_metadata(
        &self,
        token: &str,
        vault_uri: &str,
        name: &str,
    ) -> Result<SecretItem, String> {
        let url = Self::secret_versions_url(vault_uri, name);

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
        let url = Self::secret_url(vault_uri, name);

        let body = self.request_json(Method::GET, &url, token, None).await?;

        Ok(Self::parse_secret_value(&body, name))
    }

    /// Creates or updates a secret (creates a new version if name exists).
    pub async fn set_secret(
        &self,
        token: &str,
        vault_uri: &str,
        req: &CreateSecretRequest,
    ) -> Result<SecretItem, String> {
        let url = Self::secret_url(vault_uri, &req.name);
        let payload = Self::build_set_secret_payload(req);

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
        let url = Self::secret_url(vault_uri, name);
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
        let url = Self::recover_secret_url(vault_uri, name);
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
        let url = Self::deleted_secret_url(vault_uri, name);
        self.request_json(Method::DELETE, &url, token, None).await?;
        Ok(())
    }

    // ── Key Vault data-plane: Keys ──

    /// Lists all cryptographic keys in a vault (paginated).
    pub async fn list_keys(&self, token: &str, vault_uri: &str) -> Result<Vec<KeyItem>, String> {
        self.list_paginated(token, Self::keys_url(vault_uri), Self::parse_key_item)
            .await
    }

    // ── Key Vault data-plane: Certificates ──

    /// Lists all X.509 certificates in a vault (paginated).
    pub async fn list_certificates(
        &self,
        token: &str,
        vault_uri: &str,
    ) -> Result<Vec<CertificateItem>, String> {
        self.list_paginated(
            token,
            Self::certificates_url(vault_uri),
            Self::parse_certificate_item,
        )
        .await
    }

    // ── Internal helpers ──

    /// Follows a paginated list endpoint, parsing every page with `parse`.
    ///
    /// # Security
    /// The origin (scheme + host + port) of the first request is captured up
    /// front and every `nextLink` must match it exactly. Without that check a
    /// vault could hand back a `nextLink` pointing at *another* Key Vault —
    /// any `*.vault.azure.net` name passes the host allowlist, and anyone can
    /// create a vault with a free name — and the caller's bearer token would
    /// be replayed to it.
    ///
    /// Termination is guaranteed by `MAX_PAGES` plus a visited-URL set, so a
    /// cyclic `nextLink` chain cannot spin or grow memory without bound.
    async fn list_paginated<T>(
        &self,
        token: &str,
        first_url: String,
        parse: impl Fn(&Value) -> T,
    ) -> Result<Vec<T>, String> {
        let Some(origin) = Self::origin_of(&first_url) else {
            return Err("Blocked outbound request to non-Azure endpoint.".to_string());
        };

        let mut items = Vec::new();
        let mut visited: HashSet<String> = HashSet::new();
        let mut next_url = Some(first_url);

        while let Some(current_url) = next_url {
            if !Self::accept_page(&mut visited, &current_url) {
                break;
            }

            let body = self
                .request_json(Method::GET, &current_url, token, None)
                .await?;

            if let Some(values) = body["value"].as_array() {
                items.extend(values.iter().map(&parse));
            }

            next_url = Self::next_link(&body, &current_url, &origin);
        }

        Ok(items)
    }

    /// Loop guard for `list_paginated`: returns `false` once the page budget
    /// is spent or the URL has already been fetched in this run, which is what
    /// terminates a cyclic `nextLink` chain such as `A -> B -> A`.
    fn accept_page(visited: &mut HashSet<String>, url: &str) -> bool {
        visited.len() < MAX_PAGES && visited.insert(url.to_string())
    }

    /// Fetches vault-level properties to determine soft-delete state.
    async fn get_vault_soft_delete_state(
        &self,
        token: &str,
        vault_id: &str,
    ) -> Result<Option<bool>, String> {
        let url = Self::vault_properties_url(vault_id);
        let body = self.request_json(Method::GET, &url, token, None).await?;
        Ok(Self::parse_soft_delete_state(&body))
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

                    // Retry on 429 (rate limit) or 5xx (server errors), but
                    // only where replaying the request is safe (see
                    // `should_retry_request`).
                    if Self::should_retry_request(status.as_u16(), &method, retry_after.is_some())
                        && attempt < MAX_RETRIES
                    {
                        tokio::time::sleep(Self::backoff_delay(attempt, retry_after)).await;
                        attempt += 1;
                        continue;
                    }

                    return Err(Self::parse_error(&body, status.as_u16()));
                }
                Err(err) => {
                    // A transport failure is ambiguous: the request may well
                    // have been applied. Key Vault mints a NEW VERSION on every
                    // PUT, so replaying a non-idempotent verb here would
                    // silently duplicate data.
                    if Self::is_retry_safe_method(&method) && attempt < MAX_RETRIES {
                        tokio::time::sleep(Self::backoff_delay(attempt, None)).await;
                        attempt += 1;
                        continue;
                    }
                    return Err(format!("Network error: {}", err));
                }
            }
        }
    }

    // ── URL builders (pure) ──

    /// Normalises a vault URI by removing trailing slashes so path
    /// concatenation never produces a double slash.
    fn normalize_vault_uri(vault_uri: &str) -> &str {
        vault_uri.trim_end_matches('/')
    }

    /// ARM tenants list URL.
    fn tenants_url() -> String {
        format!("{}/tenants?api-version={}", ARM_BASE, API_VERSION_TENANTS)
    }

    /// ARM subscriptions list URL.
    fn subscriptions_url() -> String {
        format!(
            "{}/subscriptions?api-version={}",
            ARM_BASE, API_VERSION_SUBSCRIPTIONS
        )
    }

    /// ARM resource query URL filtered to Key Vault vaults.
    fn keyvaults_url(subscription_id: &str) -> String {
        format!(
            "{}/subscriptions/{}/resources?$filter=resourceType eq 'Microsoft.KeyVault/vaults'&api-version={}",
            ARM_BASE, subscription_id, API_VERSION_RESOURCES
        )
    }

    /// ARM URL for a single vault resource (used for soft-delete state).
    fn vault_properties_url(vault_id: &str) -> String {
        format!(
            "{}{}?api-version={}",
            ARM_BASE, vault_id, API_VERSION_KEYVAULT_MGMT
        )
    }

    /// Data-plane URL listing all secrets in a vault.
    fn secrets_url(vault_uri: &str) -> String {
        format!(
            "{}/secrets?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL for a single secret (latest version).
    fn secret_url(vault_uri: &str, name: &str) -> String {
        format!(
            "{}/secrets/{}?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            name,
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL for the newest version of a secret's metadata.
    fn secret_versions_url(vault_uri: &str, name: &str) -> String {
        format!(
            "{}/secrets/{}/versions?api-version={}&maxresults=1",
            Self::normalize_vault_uri(vault_uri),
            name,
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL for a soft-deleted secret.
    fn deleted_secret_url(vault_uri: &str, name: &str) -> String {
        format!(
            "{}/deletedsecrets/{}?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            name,
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL that recovers a soft-deleted secret.
    fn recover_secret_url(vault_uri: &str, name: &str) -> String {
        format!(
            "{}/deletedsecrets/{}/recover?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            name,
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL listing all keys in a vault.
    fn keys_url(vault_uri: &str) -> String {
        format!(
            "{}/keys?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            API_VERSION_KEYVAULT_DATA
        )
    }

    /// Data-plane URL listing all certificates in a vault.
    fn certificates_url(vault_uri: &str) -> String {
        format!(
            "{}/certificates?api-version={}",
            Self::normalize_vault_uri(vault_uri),
            API_VERSION_KEYVAULT_DATA
        )
    }

    // ── Response parsing (pure) ──

    /// Reads the pagination cursor from a list response.
    ///
    /// Two cursors are dropped: one identical to the page just fetched (a
    /// trivial self-loop) and any whose origin differs from `origin`, which is
    /// the origin of the first request in the pagination run. The latter stops
    /// a vault from redirecting the caller's bearer token to another host.
    ///
    /// This is only a partial loop guard — longer cycles are broken by the
    /// visited-URL set in `list_paginated`.
    fn next_link(body: &Value, current_url: &str, origin: &str) -> Option<String> {
        body.get("nextLink")
            .and_then(|v| v.as_str())
            .filter(|link| !link.is_empty() && *link != current_url)
            .filter(|link| Self::origin_of(link).is_some_and(|o| o == origin))
            .map(|s| s.to_string())
    }

    /// Returns the origin (`scheme://host[:port]`) of a URL.
    ///
    /// `Url` normalises away a scheme's default port, so `https://h` and
    /// `https://h:443` produce the same origin.
    fn origin_of(url: &str) -> Option<String> {
        let parsed = Url::parse(url).ok()?;
        let host = parsed.host_str()?;
        Some(match parsed.port() {
            Some(port) => format!("{}://{}:{}", parsed.scheme(), host, port),
            None => format!("{}://{}", parsed.scheme(), host),
        })
    }

    /// Parses the ARM `/tenants` response.
    fn parse_tenants(body: &Value) -> Vec<Tenant> {
        body["value"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
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
            .collect()
    }

    /// Parses the ARM `/subscriptions` response.
    fn parse_subscriptions(body: &Value) -> Vec<Subscription> {
        body["value"]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
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
            .collect()
    }

    /// Extracts the resource group name from an ARM resource ID.
    fn extract_resource_group(id: &str) -> String {
        id.split("/resourceGroups/")
            .nth(1)
            .and_then(|s| s.split('/').next())
            .unwrap_or_default()
            .to_string()
    }

    /// Parses one ARM resource entry into `KeyVaultInfo`.
    fn parse_keyvault_entry(v: &Value, soft_delete_enabled: Option<bool>) -> KeyVaultInfo {
        let id = v["id"].as_str().unwrap_or_default();
        let name = v["name"].as_str().unwrap_or_default();
        let location = v["location"].as_str().unwrap_or_default();

        KeyVaultInfo {
            id: id.to_string(),
            name: name.to_string(),
            location: location.to_string(),
            resource_group: Self::extract_resource_group(id),
            vault_uri: format!("https://{}.vault.azure.net", name),
            tags: v
                .get("tags")
                .and_then(|t| serde_json::from_value(t.clone()).ok()),
            soft_delete_enabled,
        }
    }

    /// Reads `properties.enableSoftDelete` from a vault resource body.
    fn parse_soft_delete_state(body: &Value) -> Option<bool> {
        body.get("properties")
            .and_then(|p| p.get("enableSoftDelete"))
            .and_then(|v| v.as_bool())
    }

    /// Parses a Key Vault key JSON object into a `KeyItem`.
    fn parse_key_item(v: &Value) -> KeyItem {
        let id = v["kid"].as_str().unwrap_or_default().to_string();
        let name = Self::extract_name_from_id(&id, "keys");
        let attrs = &v["attributes"];

        KeyItem {
            id,
            name,
            enabled: attrs["enabled"].as_bool().unwrap_or(true),
            created: Self::epoch_to_rfc3339(attrs.get("created").and_then(|v| v.as_u64())),
            updated: Self::epoch_to_rfc3339(attrs.get("updated").and_then(|v| v.as_u64())),
            expires: Self::epoch_to_rfc3339(attrs.get("exp").and_then(|v| v.as_u64())),
            not_before: Self::epoch_to_rfc3339(attrs.get("nbf").and_then(|v| v.as_u64())),
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
        }
    }

    /// Parses a Key Vault certificate JSON object into a `CertificateItem`.
    fn parse_certificate_item(v: &Value) -> CertificateItem {
        let id = v["id"].as_str().unwrap_or_default().to_string();
        let name = Self::extract_name_from_id(&id, "certificates");
        let attrs = &v["attributes"];

        CertificateItem {
            id,
            name,
            enabled: attrs["enabled"].as_bool().unwrap_or(true),
            created: Self::epoch_to_rfc3339(attrs.get("created").and_then(|v| v.as_u64())),
            updated: Self::epoch_to_rfc3339(attrs.get("updated").and_then(|v| v.as_u64())),
            expires: Self::epoch_to_rfc3339(attrs.get("exp").and_then(|v| v.as_u64())),
            not_before: Self::epoch_to_rfc3339(attrs.get("nbf").and_then(|v| v.as_u64())),
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
        }
    }

    /// Parses a data-plane secret response into a `SecretValue`.
    fn parse_secret_value(body: &Value, name: &str) -> SecretValue {
        SecretValue {
            value: body["value"].as_str().unwrap_or_default().to_string(),
            id: body["id"].as_str().unwrap_or_default().to_string(),
            name: name.to_string(),
        }
    }

    /// Builds the request body for a `PUT /secrets/{name}` call.
    fn build_set_secret_payload(req: &CreateSecretRequest) -> Value {
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

        payload
    }

    // ── Retry policy (pure) ──

    /// Transient failures worth retrying: rate limiting and server errors.
    fn should_retry(status: u16) -> bool {
        status == 429 || (500..600).contains(&status)
    }

    /// Methods that may be replayed after an ambiguous failure without
    /// changing server state a second time.
    ///
    /// `PUT` is deliberately excluded: Key Vault's `PUT /secrets/{name}`
    /// creates a new secret *version* on every call, so it is not idempotent
    /// despite the verb.
    fn is_retry_safe_method(method: &Method) -> bool {
        matches!(
            *method,
            Method::GET | Method::HEAD | Method::OPTIONS | Method::DELETE
        )
    }

    /// Whether a failed response should be retried.
    ///
    /// Retry-safe verbs follow the plain transient-status rule. Anything else
    /// is only retried when the server explicitly signalled that it refused
    /// the request and asked us back later (429/503 with `Retry-After`), which
    /// means the request was not applied.
    fn should_retry_request(status: u16, method: &Method, has_retry_after: bool) -> bool {
        if !Self::should_retry(status) {
            return false;
        }
        if Self::is_retry_safe_method(method) {
            return true;
        }
        has_retry_after && matches!(status, 429 | 503)
    }

    /// Sleep duration before the next attempt, including random jitter.
    fn backoff_delay(attempt: usize, retry_after: Option<u64>) -> Duration {
        Duration::from_secs(Self::backoff_secs(attempt, retry_after))
            + Duration::from_millis(Self::jitter_millis())
    }

    /// Random jitter of up to `MAX_JITTER_MILLIS`, so a fleet of clients
    /// throttled by the same 429 does not retry in lockstep.
    fn jitter_millis() -> u64 {
        u64::from(uuid::Uuid::new_v4().as_bytes()[0]) * MAX_JITTER_MILLIS / 256
    }

    /// Base sleep duration (seconds) before the next attempt.
    ///
    /// A server-supplied `Retry-After` wins over exponential backoff. Both are
    /// clamped to `MAX_BACKOFF_SECS`; the exponential schedule tops out at 8s
    /// on its own, so the clamp exists for a hostile `Retry-After`.
    fn backoff_secs(attempt: usize, retry_after: Option<u64>) -> u64 {
        let exponential = 1_u64 << attempt.min(3);
        retry_after.unwrap_or(exponential).min(MAX_BACKOFF_SECS)
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
    ///
    /// Timestamps that do not fit in an `i64` are rejected rather than
    /// wrapped, so a malformed value cannot surface as a plausible-looking
    /// pre-1970 date.
    fn epoch_to_rfc3339(epoch: Option<u64>) -> Option<String> {
        epoch
            .and_then(|ts| i64::try_from(ts).ok())
            .and_then(|ts| chrono::DateTime::from_timestamp(ts, 0).map(|dt| dt.to_rfc3339()))
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

        // Only the default HTTPS port. `Url` normalises `:443` away, so any
        // explicit port left here is a non-standard one.
        if parsed.port().is_some() {
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

/// Runs `f` over `items` with at most `limit` futures in flight, returning the
/// results in the original order.
///
/// Order matters: the vault list the user sees must match the order ARM
/// returned, not the order the network happened to answer in.
async fn map_bounded<T, U, F, Fut>(items: Vec<T>, limit: usize, f: F) -> Vec<U>
where
    F: Fn(T) -> Fut,
    Fut: Future<Output = U>,
{
    stream::iter(items)
        .map(f)
        .buffered(limit.max(1))
        .collect()
        .await
}

#[cfg(test)]
mod bounded_concurrency_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[tokio::test]
    async fn preserves_input_order_regardless_of_completion_order() {
        // Later items finish first; the output must still follow the input.
        let out = map_bounded(vec![5u64, 3, 1], 8, |n| async move {
            tokio::time::sleep(Duration::from_millis(n * 10)).await;
            n
        })
        .await;

        assert_eq!(out, vec![5, 3, 1]);
    }

    #[tokio::test]
    async fn never_exceeds_the_concurrency_limit() {
        let in_flight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        let items: Vec<usize> = (0..40).collect();
        let out = map_bounded(items, 8, |n| {
            let in_flight = Arc::clone(&in_flight);
            let peak = Arc::clone(&peak);
            async move {
                let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(5)).await;
                in_flight.fetch_sub(1, Ordering::SeqCst);
                n
            }
        })
        .await;

        assert_eq!(out.len(), 40);
        assert_eq!(out, (0..40).collect::<Vec<_>>());
        let peak = peak.load(Ordering::SeqCst);
        assert!(peak <= 8, "concurrency limit exceeded: {peak}");
        assert!(
            peak > 1,
            "calls ran serially -- the N+1 round-trip fix is not in effect"
        );
    }

    #[tokio::test]
    async fn handles_an_empty_list_and_a_zero_limit() {
        let empty: Vec<u8> = map_bounded(Vec::<u8>::new(), 8, |n| async move { n }).await;
        assert!(empty.is_empty());

        // A zero limit would deadlock `buffered`; it is clamped to one.
        let out = map_bounded(vec![1u8, 2], 0, |n| async move { n }).await;
        assert_eq!(out, vec![1, 2]);
    }

    #[tokio::test]
    async fn the_vault_detail_limit_actually_overlaps_calls() {
        // Guards the constant against being nudged back to 1, which would
        // silently restore the N+1 serial round-trips.
        let in_flight = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));

        map_bounded(
            (0..20).collect::<Vec<usize>>(),
            VAULT_DETAIL_CONCURRENCY,
            |n| {
                let in_flight = Arc::clone(&in_flight);
                let peak = Arc::clone(&peak);
                async move {
                    let now = in_flight.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(now, Ordering::SeqCst);
                    tokio::time::sleep(Duration::from_millis(5)).await;
                    in_flight.fetch_sub(1, Ordering::SeqCst);
                    n
                }
            },
        )
        .await;

        assert!(
            peak.load(Ordering::SeqCst) > 1,
            "vault detail calls ran serially"
        );
    }
}

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

#[cfg(test)]
mod url_builder_tests {
    use super::*;

    const VAULT: &str = "https://demo.vault.azure.net";

    #[test]
    fn tenants_url_targets_arm_with_api_version() {
        let url = AzureClient::tenants_url();
        assert_eq!(
            url,
            format!("https://management.azure.com/tenants?api-version={API_VERSION_TENANTS}")
        );
        assert!(AzureClient::is_allowed_azure_url(&url));
    }

    #[test]
    fn subscriptions_url_targets_arm_with_api_version() {
        let url = AzureClient::subscriptions_url();
        assert!(url.starts_with("https://management.azure.com/subscriptions?api-version="));
        assert!(AzureClient::is_allowed_azure_url(&url));
    }

    #[test]
    fn keyvaults_url_filters_on_vault_resource_type() {
        let url = AzureClient::keyvaults_url("sub-123");
        assert!(url.contains("/subscriptions/sub-123/resources"));
        assert!(url.contains("Microsoft.KeyVault/vaults"));
        assert!(url.contains(API_VERSION_RESOURCES));
        assert!(AzureClient::is_allowed_azure_url(&url));
    }

    #[test]
    fn vault_properties_url_joins_arm_base_with_resource_id() {
        let url = AzureClient::vault_properties_url(
            "/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/v",
        );
        assert_eq!(
            url,
            format!("https://management.azure.com/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/v?api-version={API_VERSION_KEYVAULT_MGMT}")
        );
        assert!(AzureClient::is_allowed_azure_url(&url));
    }

    #[test]
    fn data_plane_urls_are_well_formed() {
        let cases: Vec<(String, &str)> = vec![
            (AzureClient::secrets_url(VAULT), "/secrets?"),
            (
                AzureClient::secret_url(VAULT, "db-conn"),
                "/secrets/db-conn?",
            ),
            (
                AzureClient::secret_versions_url(VAULT, "db-conn"),
                "/secrets/db-conn/versions?",
            ),
            (
                AzureClient::deleted_secret_url(VAULT, "db-conn"),
                "/deletedsecrets/db-conn?",
            ),
            (
                AzureClient::recover_secret_url(VAULT, "db-conn"),
                "/deletedsecrets/db-conn/recover?",
            ),
            (AzureClient::keys_url(VAULT), "/keys?"),
            (AzureClient::certificates_url(VAULT), "/certificates?"),
        ];

        for (url, expected_path) in cases {
            assert!(
                url.contains(expected_path),
                "{url} should contain {expected_path}"
            );
            assert!(
                url.contains(&format!("api-version={API_VERSION_KEYVAULT_DATA}")),
                "{url} should carry the data-plane api-version"
            );
            assert!(
                AzureClient::is_allowed_azure_url(&url),
                "{url} should pass the outbound allowlist"
            );
            assert!(!url.contains("//secrets"), "{url} must not double-slash");
        }
    }

    #[test]
    fn secret_versions_url_requests_only_latest_version() {
        let url = AzureClient::secret_versions_url(VAULT, "db-conn");
        assert!(url.contains("maxresults=1"));
    }

    #[test]
    fn vault_uri_trailing_slashes_are_normalised() {
        assert_eq!(
            AzureClient::secrets_url("https://demo.vault.azure.net/"),
            AzureClient::secrets_url(VAULT)
        );
        assert_eq!(
            AzureClient::secret_url("https://demo.vault.azure.net///", "s"),
            AzureClient::secret_url(VAULT, "s")
        );
        assert_eq!(
            AzureClient::normalize_vault_uri("https://demo.vault.azure.net//"),
            VAULT
        );
    }

    #[test]
    fn gov_and_china_vault_urls_stay_allowlisted() {
        for base in [
            "https://demo.vault.usgovcloudapi.net",
            "https://demo.vault.azure.cn",
        ] {
            assert!(AzureClient::is_allowed_azure_url(
                &AzureClient::secrets_url(base)
            ));
            assert!(AzureClient::is_allowed_azure_url(&AzureClient::keys_url(
                base
            )));
        }
    }
}

#[cfg(test)]
mod parsing_tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    // ── nextLink / pagination ──

    const ORIGIN: &str = "https://demo.vault.azure.net";

    #[test]
    fn next_link_returns_following_page() {
        let body = json!({"nextLink": "https://demo.vault.azure.net/secrets?skip=2"});
        assert_eq!(
            AzureClient::next_link(&body, "https://demo.vault.azure.net/secrets", ORIGIN),
            Some("https://demo.vault.azure.net/secrets?skip=2".to_string())
        );
    }

    #[test]
    fn next_link_absent_or_null_ends_pagination() {
        let current = "https://demo.vault.azure.net/secrets";
        assert_eq!(AzureClient::next_link(&json!({}), current, ORIGIN), None);
        assert_eq!(
            AzureClient::next_link(&json!({"nextLink": null}), current, ORIGIN),
            None
        );
        assert_eq!(
            AzureClient::next_link(&json!({"nextLink": 42}), current, ORIGIN),
            None
        );
        assert_eq!(
            AzureClient::next_link(&json!({"nextLink": ""}), current, ORIGIN),
            None
        );
    }

    #[test]
    fn next_link_identical_to_current_page_is_ignored() {
        // Breaks the trivial self-loop only; longer cycles are broken by the
        // visited-URL set in `list_paginated`.
        let url = "https://demo.vault.azure.net/secrets?api-version=7.5";
        let body = json!({ "nextLink": url });
        assert_eq!(AzureClient::next_link(&body, url, ORIGIN), None);
    }

    #[test]
    fn next_link_alternating_between_two_pages_is_not_broken_by_next_link_alone() {
        // A -> B -> A: neither hop equals the page it came from, so the
        // self-loop filter lets both through. `list_paginated`'s visited set
        // is what actually terminates this.
        let a = "https://demo.vault.azure.net/secrets?page=a";
        let b = "https://demo.vault.azure.net/secrets?page=b";
        assert_eq!(
            AzureClient::next_link(&json!({ "nextLink": b }), a, ORIGIN),
            Some(b.to_string())
        );
        assert_eq!(
            AzureClient::next_link(&json!({ "nextLink": a }), b, ORIGIN),
            Some(a.to_string())
        );
    }

    #[test]
    fn next_link_pointing_at_another_origin_is_rejected() {
        // Anyone can register a free `*.vault.azure.net` name, so the host
        // allowlist alone would happily replay the bearer token to it.
        let current = "https://demo.vault.azure.net/secrets";
        for hostile in [
            "https://attacker.vault.azure.net/secrets",
            "https://management.azure.com/secrets",
            "https://demo.vault.azure.net:8443/secrets",
            "http://demo.vault.azure.net/secrets",
            "https://evil.example.com/secrets",
            "/secrets?skip=2",
            "not a url",
        ] {
            assert_eq!(
                AzureClient::next_link(&json!({ "nextLink": hostile }), current, ORIGIN),
                None,
                "{hostile} must not be followed"
            );
        }
    }

    #[test]
    fn origin_of_normalises_the_default_https_port() {
        assert_eq!(
            AzureClient::origin_of("https://demo.vault.azure.net:443/secrets?a=1"),
            Some("https://demo.vault.azure.net".to_string())
        );
        assert_eq!(
            AzureClient::origin_of("https://demo.vault.azure.net:8443/secrets"),
            Some("https://demo.vault.azure.net:8443".to_string())
        );
        assert_eq!(AzureClient::origin_of("not a url"), None);
        assert_eq!(AzureClient::origin_of("data:text/plain,hi"), None);
    }

    #[test]
    fn pagination_stops_on_a_repeated_page() {
        // A -> B -> A: the third hop is refused, so the walk terminates.
        let mut visited = HashSet::new();
        assert!(AzureClient::accept_page(&mut visited, "a"));
        assert!(AzureClient::accept_page(&mut visited, "b"));
        assert!(!AzureClient::accept_page(&mut visited, "a"));
        assert_eq!(visited.len(), 2, "memory stays bounded by distinct pages");
    }

    // ── The pagination walk, end to end ──
    //
    // `list_paginated` fetches its pages over HTTP and has no seam for a fake
    // page source, so the walk is driven here through a page map while calling
    // the *real* guards (`origin_of`, `accept_page`, `next_link`) in the order
    // and with the arguments `list_paginated` uses. What this catches is the
    // composition -- a cursor accepted mid-chain, a cycle that never ends, a
    // budget that is never spent -- which none of the per-helper tests above do.

    /// Result of a walk: the pages actually fetched, in order.
    fn walk_pages(first_url: &str, pages: &HashMap<String, Value>) -> Result<Vec<String>, String> {
        let Some(origin) = AzureClient::origin_of(first_url) else {
            return Err("Blocked outbound request to non-Azure endpoint.".to_string());
        };

        let mut fetched = Vec::new();
        let mut visited: HashSet<String> = HashSet::new();
        let mut next_url = Some(first_url.to_string());

        while let Some(current_url) = next_url {
            if !AzureClient::accept_page(&mut visited, &current_url) {
                break;
            }
            let body = pages
                .get(&current_url)
                .cloned()
                .unwrap_or_else(|| json!({ "value": [] }));
            fetched.push(current_url.clone());
            next_url = AzureClient::next_link(&body, &current_url, &origin);
        }

        Ok(fetched)
    }

    fn page_map(pages: &[(&str, Value)]) -> HashMap<String, Value> {
        pages
            .iter()
            .map(|(url, body)| ((*url).to_string(), body.clone()))
            .collect()
    }

    #[test]
    fn a_same_origin_cursor_chain_is_followed_to_the_end() {
        let p1 = "https://demo.vault.azure.net/secrets?api-version=7.5";
        let p2 = "https://demo.vault.azure.net/secrets?skip=1";
        let p3 = "https://demo.vault.azure.net/secrets?skip=2";
        let pages = page_map(&[
            (p1, json!({ "value": [{"id": "a"}], "nextLink": p2 })),
            (p2, json!({ "value": [{"id": "b"}], "nextLink": p3 })),
            (p3, json!({ "value": [{"id": "c"}] })),
        ]);

        assert_eq!(walk_pages(p1, &pages).unwrap(), vec![p1, p2, p3]);
    }

    #[test]
    fn a_cross_origin_cursor_is_refused_even_when_it_appears_on_a_later_page() {
        // The dangerous shape: two innocent pages, then a cursor pointing at a
        // vault someone else owns. The origin is pinned by the *first* URL, so
        // page 3 never happens and the bearer token is not replayed.
        let p1 = "https://demo.vault.azure.net/secrets?api-version=7.5";
        let p2 = "https://demo.vault.azure.net/secrets?skip=1";
        let hostile = "https://attacker.vault.azure.net/secrets?skip=2";
        let pages = page_map(&[
            (p1, json!({ "value": [{"id": "a"}], "nextLink": p2 })),
            (p2, json!({ "value": [{"id": "b"}], "nextLink": hostile })),
            (hostile, json!({ "value": [{"id": "stolen"}] })),
        ]);

        let fetched = walk_pages(p1, &pages).unwrap();
        assert_eq!(fetched, vec![p1, p2]);
        assert!(
            !fetched.iter().any(|url| url == hostile),
            "the token must never reach another vault"
        );
    }

    #[test]
    fn a_cyclic_cursor_chain_terminates_instead_of_spinning() {
        let a = "https://demo.vault.azure.net/secrets?page=a";
        let b = "https://demo.vault.azure.net/secrets?page=b";
        let pages = page_map(&[
            (a, json!({ "value": [{"id": "1"}], "nextLink": b })),
            (b, json!({ "value": [{"id": "2"}], "nextLink": a })),
        ]);

        // A -> B -> A: the repeat is refused, so each page is fetched once.
        assert_eq!(walk_pages(a, &pages).unwrap(), vec![a, b]);
    }

    #[test]
    fn an_endless_chain_of_fresh_pages_stops_at_the_page_budget() {
        let url = |index: usize| format!("https://demo.vault.azure.net/secrets?skip={index}");
        let pages: HashMap<String, Value> = (0..MAX_PAGES + 50)
            .map(|index| {
                (
                    url(index),
                    json!({ "value": [{"id": index}], "nextLink": url(index + 1) }),
                )
            })
            .collect();

        let fetched = walk_pages(&url(0), &pages).unwrap();
        assert_eq!(
            fetched.len(),
            MAX_PAGES,
            "a server that never stops paginating must not keep the app fetching"
        );
    }

    #[tokio::test]
    async fn list_paginated_refuses_a_first_url_with_no_usable_origin() {
        // Straight through the real function: no origin means no request is
        // ever made, so the token cannot leak to an unparsable target.
        let client = AzureClient::new();
        let err = client
            .list_paginated("fake-token", "not a url".to_string(), |_| ())
            .await
            .unwrap_err();
        assert_eq!(err, "Blocked outbound request to non-Azure endpoint.");
    }

    #[tokio::test]
    async fn list_paginated_blocks_a_non_azure_first_url_before_any_io() {
        let client = AzureClient::new();
        let err = client
            .list_paginated(
                "fake-token",
                "https://evil.example.com/secrets".to_string(),
                |_| (),
            )
            .await
            .unwrap_err();
        assert_eq!(err, "Blocked outbound request to non-Azure endpoint.");
    }

    #[test]
    fn pagination_stops_at_the_page_budget() {
        let mut visited = HashSet::new();
        for page in 0..MAX_PAGES {
            assert!(
                AzureClient::accept_page(&mut visited, &format!("page-{page}")),
                "page {page} is within budget"
            );
        }
        assert!(
            !AzureClient::accept_page(&mut visited, "page-one-too-many"),
            "an endless chain of fresh URLs must still terminate"
        );
        assert_eq!(visited.len(), MAX_PAGES);
    }

    // ── Tenants ──

    #[test]
    fn parses_tenants_response() {
        let body = json!({
            "value": [
                {"id": "/tenants/t1", "tenantId": "t1", "displayName": "Contoso"},
                {"id": "/tenants/t2", "tenantId": "t2", "defaultDomain": "fabrikam.onmicrosoft.com"},
                {"id": "/tenants/t3", "tenantId": "t3"}
            ]
        });
        let tenants = AzureClient::parse_tenants(&body);
        assert_eq!(tenants.len(), 3);
        assert_eq!(tenants[0].display_name.as_deref(), Some("Contoso"));
        // falls back to defaultDomain
        assert_eq!(
            tenants[1].display_name.as_deref(),
            Some("fabrikam.onmicrosoft.com")
        );
        assert!(tenants[2].display_name.is_none());
    }

    #[test]
    fn parses_tenants_from_malformed_payloads() {
        assert!(AzureClient::parse_tenants(&json!({})).is_empty());
        assert!(AzureClient::parse_tenants(&json!({"value": null})).is_empty());
        assert!(AzureClient::parse_tenants(&json!({"value": "oops"})).is_empty());
        assert!(AzureClient::parse_tenants(&json!([])).is_empty());

        // Entries with wrong value types degrade to empty strings, not panics.
        let body = json!({"value": [{"id": 7, "tenantId": ["x"], "displayName": {}}]});
        let tenants = AzureClient::parse_tenants(&body);
        assert_eq!(tenants.len(), 1);
        assert_eq!(tenants[0].id, "");
        assert_eq!(tenants[0].tenant_id, "");
        assert!(tenants[0].display_name.is_none());
    }

    // ── Subscriptions ──

    #[test]
    fn parses_subscriptions_response() {
        let body = json!({
            "value": [{
                "subscriptionId": "sub-1",
                "displayName": "Production",
                "state": "Enabled",
                "tenantId": "tid-1"
            }]
        });
        let subs = AzureClient::parse_subscriptions(&body);
        assert_eq!(subs.len(), 1);
        assert_eq!(subs[0].subscription_id, "sub-1");
        assert_eq!(subs[0].display_name, "Production");
        assert_eq!(subs[0].state, "Enabled");
        assert_eq!(subs[0].tenant_id, "tid-1");
    }

    #[test]
    fn subscription_falls_back_to_home_tenant_id() {
        let body = json!({
            "value": [{
                "subscriptionId": "sub-2",
                "displayName": "Dev",
                "state": "Enabled",
                "homeTenantId": "home-tid"
            }]
        });
        let subs = AzureClient::parse_subscriptions(&body);
        assert_eq!(subs[0].tenant_id, "home-tid");
    }

    #[test]
    fn subscription_without_any_tenant_id_is_empty_not_panicking() {
        let body =
            json!({"value": [{"subscriptionId": "s", "displayName": "d", "state": "Enabled"}]});
        assert_eq!(AzureClient::parse_subscriptions(&body)[0].tenant_id, "");
        assert!(AzureClient::parse_subscriptions(&json!({})).is_empty());
    }

    // ── Key Vault resources ──

    #[test]
    fn extracts_resource_group_from_arm_id() {
        assert_eq!(
            AzureClient::extract_resource_group(
                "/subscriptions/s/resourceGroups/my-rg/providers/Microsoft.KeyVault/vaults/v"
            ),
            "my-rg"
        );
    }

    #[test]
    fn extract_resource_group_handles_missing_segment() {
        assert_eq!(AzureClient::extract_resource_group(""), "");
        assert_eq!(AzureClient::extract_resource_group("/subscriptions/s"), "");
        // case-sensitive ARM segment: lowercase variant is not matched
        assert_eq!(
            AzureClient::extract_resource_group("/subscriptions/s/resourcegroups/rg/x"),
            ""
        );
    }

    #[test]
    fn parses_keyvault_entry_and_derives_vault_uri() {
        let v = json!({
            "id": "/subscriptions/s/resourceGroups/rg/providers/Microsoft.KeyVault/vaults/kv1",
            "name": "kv1",
            "location": "westeurope",
            "tags": {"env": "prod"}
        });
        let info = AzureClient::parse_keyvault_entry(&v, Some(true));
        assert_eq!(info.name, "kv1");
        assert_eq!(info.location, "westeurope");
        assert_eq!(info.resource_group, "rg");
        assert_eq!(info.vault_uri, "https://kv1.vault.azure.net");
        assert_eq!(info.soft_delete_enabled, Some(true));
        assert_eq!(info.tags.unwrap().get("env").unwrap(), "prod");
        // the derived URI must itself survive the outbound allowlist
        assert!(AzureClient::is_allowed_azure_url(
            &AzureClient::secrets_url(&info.vault_uri)
        ));
    }

    #[test]
    fn parses_keyvault_entry_with_unusable_tags() {
        let v = json!({"id": "", "name": "kv", "location": "eastus", "tags": "not-a-map"});
        let info = AzureClient::parse_keyvault_entry(&v, None);
        assert!(info.tags.is_none());
        assert!(info.soft_delete_enabled.is_none());
        assert_eq!(info.resource_group, "");
    }

    #[test]
    fn parses_soft_delete_state() {
        assert_eq!(
            AzureClient::parse_soft_delete_state(
                &json!({"properties": {"enableSoftDelete": true}})
            ),
            Some(true)
        );
        assert_eq!(
            AzureClient::parse_soft_delete_state(
                &json!({"properties": {"enableSoftDelete": false}})
            ),
            Some(false)
        );
        assert_eq!(AzureClient::parse_soft_delete_state(&json!({})), None);
        assert_eq!(
            AzureClient::parse_soft_delete_state(&json!({"properties": {}})),
            None
        );
        assert_eq!(
            AzureClient::parse_soft_delete_state(
                &json!({"properties": {"enableSoftDelete": "yes"}})
            ),
            None
        );
    }

    // ── Keys ──

    #[test]
    fn parses_key_item_full_payload() {
        let v = json!({
            "kid": "https://demo.vault.azure.net/keys/rsa-key/v1",
            "kty": "RSA",
            "key_ops": ["sign", "verify", 42],
            "attributes": {"enabled": false, "created": 1704067200, "exp": 1735689600},
            "tags": {"team": "sec"},
            "managed": true
        });
        let key = AzureClient::parse_key_item(&v);
        assert_eq!(key.name, "rsa-key");
        assert_eq!(key.id, "https://demo.vault.azure.net/keys/rsa-key/v1");
        assert!(!key.enabled);
        assert_eq!(key.key_type.as_deref(), Some("RSA"));
        // non-string key_ops entries are dropped rather than stringified
        assert_eq!(
            key.key_ops.unwrap(),
            vec!["sign".to_string(), "verify".to_string()]
        );
        assert!(key.created.unwrap().starts_with("2024-01-01"));
        assert!(key.expires.is_some());
        assert!(key.updated.is_none());
        assert_eq!(key.managed, Some(true));
        assert_eq!(key.tags.unwrap().get("team").unwrap(), "sec");
    }

    #[test]
    fn parses_key_item_minimal_payload_defaults_to_enabled() {
        let key = AzureClient::parse_key_item(&json!({}));
        assert_eq!(key.id, "");
        assert_eq!(key.name, "");
        assert!(key.enabled, "missing attributes.enabled defaults to true");
        assert!(key.key_type.is_none());
        assert!(key.key_ops.is_none());
        assert!(key.tags.is_none());
        assert!(key.managed.is_none());
    }

    // ── Certificates ──

    #[test]
    fn parses_certificate_item_full_payload() {
        let v = json!({
            "id": "https://demo.vault.azure.net/certificates/tls-cert/v9",
            "x5t": "THUMB123",
            "attributes": {"enabled": true, "updated": 1704067200, "nbf": 1704067200},
            "policy": {"x509_props": {"subject": "CN=example.com"}},
            "tags": {"env": "prod"}
        });
        let cert = AzureClient::parse_certificate_item(&v);
        assert_eq!(cert.name, "tls-cert");
        assert!(cert.enabled);
        assert_eq!(cert.thumbprint.as_deref(), Some("THUMB123"));
        assert_eq!(cert.subject.as_deref(), Some("CN=example.com"));
        assert!(cert.updated.is_some());
        assert!(cert.not_before.is_some());
        assert!(cert.created.is_none());
    }

    #[test]
    fn parses_certificate_item_without_policy() {
        let v = json!({
            "id": "https://demo.vault.azure.net/certificates/bare",
            "attributes": {}
        });
        let cert = AzureClient::parse_certificate_item(&v);
        assert_eq!(cert.name, "bare");
        assert!(cert.subject.is_none());
        assert!(cert.thumbprint.is_none());
        assert!(cert.enabled);
    }

    #[test]
    fn parses_certificate_item_with_partial_policy() {
        let v = json!({"id": "x/certificates/c", "policy": {"x509_props": {}}, "attributes": {}});
        assert!(AzureClient::parse_certificate_item(&v).subject.is_none());
        let v = json!({"id": "x/certificates/c", "policy": {}, "attributes": {}});
        assert!(AzureClient::parse_certificate_item(&v).subject.is_none());
    }

    // ── Secret value ──

    #[test]
    fn parses_secret_value_response() {
        let body = json!({
            "value": "super-secret",
            "id": "https://demo.vault.azure.net/secrets/db-conn/v1"
        });
        let sv = AzureClient::parse_secret_value(&body, "db-conn");
        assert_eq!(sv.value, "super-secret");
        assert_eq!(sv.name, "db-conn");
        assert_eq!(sv.id, "https://demo.vault.azure.net/secrets/db-conn/v1");
    }

    #[test]
    fn parses_secret_value_from_empty_body() {
        let sv = AzureClient::parse_secret_value(&json!({}), "missing");
        assert_eq!(sv.value, "");
        assert_eq!(sv.id, "");
        assert_eq!(sv.name, "missing", "name always comes from the request");
    }

    // ── set_secret payload ──

    fn base_request() -> CreateSecretRequest {
        CreateSecretRequest {
            name: "s".to_string(),
            value: "v".to_string(),
            content_type: None,
            tags: None,
            enabled: None,
            expires: None,
            not_before: None,
        }
    }

    #[test]
    fn set_secret_payload_defaults_to_enabled() {
        let payload = AzureClient::build_set_secret_payload(&base_request());
        assert_eq!(payload["value"], json!("v"));
        assert_eq!(payload["attributes"]["enabled"], json!(true));
        assert!(payload.get("contentType").is_none());
        assert!(payload.get("tags").is_none());
        assert!(payload["attributes"].get("exp").is_none());
        assert!(payload["attributes"].get("nbf").is_none());
    }

    #[test]
    fn set_secret_payload_honours_disabled_flag() {
        let mut req = base_request();
        req.enabled = Some(false);
        let payload = AzureClient::build_set_secret_payload(&req);
        assert_eq!(payload["attributes"]["enabled"], json!(false));
    }

    #[test]
    fn set_secret_payload_converts_rfc3339_dates_to_epoch() {
        let mut req = base_request();
        req.expires = Some("2024-01-01T00:00:00Z".to_string());
        req.not_before = Some("2023-01-01T00:00:00+00:00".to_string());
        let payload = AzureClient::build_set_secret_payload(&req);
        assert_eq!(payload["attributes"]["exp"], json!(1704067200));
        assert_eq!(payload["attributes"]["nbf"], json!(1672531200));
    }

    #[test]
    fn set_secret_payload_silently_drops_unparsable_dates() {
        let mut req = base_request();
        req.expires = Some("not-a-date".to_string());
        req.not_before = Some("2024/01/01".to_string());
        let payload = AzureClient::build_set_secret_payload(&req);
        assert!(payload["attributes"].get("exp").is_none());
        assert!(payload["attributes"].get("nbf").is_none());
    }

    #[test]
    fn set_secret_payload_includes_content_type_and_tags() {
        let mut req = base_request();
        req.content_type = Some("application/json".to_string());
        req.tags = Some(std::collections::HashMap::from([(
            "env".to_string(),
            "prod".to_string(),
        )]));
        let payload = AzureClient::build_set_secret_payload(&req);
        assert_eq!(payload["contentType"], json!("application/json"));
        assert_eq!(payload["tags"]["env"], json!("prod"));
    }

    // ── Epoch / name extraction edge cases ──

    #[test]
    fn epoch_to_rfc3339_table() {
        let cases: [(Option<u64>, Option<&str>); 4] = [
            (None, None),
            (Some(0), Some("1970-01-01")),
            (Some(1704067200), Some("2024-01-01")),
            (Some(2_000_000_000), Some("2033-05-18")),
        ];
        for (input, expected_prefix) in cases {
            let got = AzureClient::epoch_to_rfc3339(input);
            match expected_prefix {
                None => assert!(got.is_none(), "{input:?} should not convert"),
                Some(prefix) => assert!(
                    got.as_deref().unwrap().starts_with(prefix),
                    "{input:?} -> {got:?}, expected prefix {prefix}"
                ),
            }
        }
    }

    #[test]
    fn epoch_to_rfc3339_rejects_out_of_range_timestamp() {
        assert!(AzureClient::epoch_to_rfc3339(Some(u64::MAX)).is_none());
    }

    #[test]
    fn extract_name_from_id_table() {
        let cases = [
            ("https://v.vault.azure.net/secrets/a/b", "secrets", "a"),
            ("https://v.vault.azure.net/keys/k", "keys", "k"),
            (
                "https://v.vault.azure.net/certificates/c/1",
                "certificates",
                "c",
            ),
            // entity segment is last -> empty name
            ("https://v.vault.azure.net/secrets", "secrets", ""),
            // entity not present -> last path segment
            ("https://v.vault.azure.net/keys/k", "secrets", "k"),
            ("", "secrets", ""),
            ("plain-name", "secrets", "plain-name"),
        ];
        for (id, entity, expected) in cases {
            assert_eq!(
                AzureClient::extract_name_from_id(id, entity),
                expected,
                "id={id} entity={entity}"
            );
        }
    }

    #[test]
    fn extract_name_from_id_uses_first_matching_entity_segment() {
        let id = "https://v.vault.azure.net/secrets/outer/secrets/inner";
        assert_eq!(AzureClient::extract_name_from_id(id, "secrets"), "outer");
    }

    #[test]
    fn parse_secret_item_never_exposes_a_value_field() {
        // Defense in depth: SecretItem is metadata-only, even if the payload
        // happens to carry a value (e.g. a GET /secrets/{name} response).
        let v = json!({
            "id": "https://demo.vault.azure.net/secrets/db-conn/v1",
            "value": "TOP-SECRET",
            "attributes": {"enabled": true}
        });
        let item = AzureClient::parse_secret_item(&v);
        let encoded = serde_json::to_string(&item).expect("serialize");
        assert!(
            !encoded.contains("TOP-SECRET"),
            "secret values must never reach SecretItem: {encoded}"
        );
    }

    #[test]
    fn parse_secret_item_disabled_and_tag_edge_cases() {
        let v = json!({
            "id": "https://demo.vault.azure.net/secrets/x/1",
            "attributes": {"enabled": false, "nbf": 1704067200, "updated": 1704067200},
            "tags": ["not", "a", "map"],
            "contentType": 5
        });
        let item = AzureClient::parse_secret_item(&v);
        assert!(!item.enabled);
        assert!(item.tags.is_none(), "non-object tags must not deserialize");
        assert!(
            item.content_type.is_none(),
            "non-string contentType is ignored"
        );
        assert!(item.not_before.is_some());
        assert!(item.updated.is_some());
    }
}

#[cfg(test)]
mod error_and_retry_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parse_error_table_covers_all_hinted_statuses() {
        let body = json!({"error": {"code": "C", "message": "M"}});
        let cases = [
            (401, true, "signing in again"),
            (403, true, "permission"),
            (404, true, "not found"),
            (429, true, "Too many requests"),
        ];
        for (status, has_hint, needle) in cases {
            let out = AzureClient::parse_error(&body, status);
            assert!(out.starts_with(&format!("[{status}] C: M")), "{out}");
            assert_eq!(out.contains("Hint"), has_hint, "{out}");
            assert!(out.contains(needle), "{out} should mention {needle}");
        }
    }

    #[test]
    fn parse_error_without_hint_for_unmapped_statuses() {
        let body = json!({"error": {"code": "C", "message": "M"}});
        for status in [400, 409, 500, 502, 503] {
            let out = AzureClient::parse_error(&body, status);
            assert!(!out.contains("Hint"), "{out}");
        }
    }

    #[test]
    fn parse_error_defaults_for_empty_or_malformed_body() {
        let out = AzureClient::parse_error(&json!({}), 500);
        assert!(out.contains("UnknownError"));
        assert!(out.contains("An unknown error occurred"));

        // `error` present but not an object
        let out = AzureClient::parse_error(&json!({"error": "boom"}), 500);
        assert!(out.contains("UnknownError"));

        // non-string code/message
        let out = AzureClient::parse_error(&json!({"error": {"code": 1, "message": []}}), 500);
        assert!(out.contains("UnknownError"));
    }

    #[test]
    fn parse_error_prefers_error_message_over_error_description() {
        let body = json!({
            "error": {"code": "C", "message": "primary"},
            "error_description": "secondary"
        });
        let out = AzureClient::parse_error(&body, 400);
        assert!(out.contains("primary"));
        assert!(!out.contains("secondary"));
    }

    #[test]
    fn parse_error_reports_a_401_without_inventing_credentials_context() {
        // `parse_error` only ever sees the response body, so the guarantee
        // worth pinning is that it renders exactly what the server said plus a
        // fixed hint -- it has no access to the token in the first place.
        let body = json!({"error": {"code": "Unauthorized", "message": "denied"}});
        let out = AzureClient::parse_error(&body, 401);
        assert_eq!(
            out,
            "[401] Unauthorized: denied | Hint: Your session may have expired. Try signing in again."
        );
    }

    #[test]
    fn parse_error_passes_a_hostile_server_message_through_verbatim_only() {
        // A server-controlled message is echoed, so it must not be able to
        // gain anything beyond its own text: no formatting, no interpolation.
        let body = json!({"error": {"code": "{code}", "message": "{status} {hint}"}});
        let out = AzureClient::parse_error(&body, 400);
        assert_eq!(out, "[400] {code}: {status} {hint}");
    }

    #[test]
    fn should_retry_only_on_429_and_5xx() {
        for status in [429, 500, 502, 503, 504, 599] {
            assert!(AzureClient::should_retry(status), "{status} is transient");
        }
        for status in [200, 201, 204, 301, 400, 401, 403, 404, 409, 422, 600] {
            assert!(!AzureClient::should_retry(status), "{status} is terminal");
        }
    }

    #[test]
    fn only_idempotent_methods_are_retry_safe() {
        for method in [Method::GET, Method::HEAD, Method::OPTIONS, Method::DELETE] {
            assert!(AzureClient::is_retry_safe_method(&method), "{method}");
        }
        // Key Vault mints a new secret version on every PUT.
        for method in [Method::PUT, Method::POST, Method::PATCH] {
            assert!(!AzureClient::is_retry_safe_method(&method), "{method}");
        }
    }

    #[test]
    fn non_idempotent_requests_are_only_retried_on_an_explicit_backpressure_signal() {
        // GET: plain transient-status rule.
        assert!(AzureClient::should_retry_request(500, &Method::GET, false));
        assert!(AzureClient::should_retry_request(429, &Method::GET, false));

        // PUT: a 5xx without Retry-After is ambiguous -- the write may already
        // have created a version, so it must not be replayed.
        assert!(!AzureClient::should_retry_request(500, &Method::PUT, false));
        assert!(!AzureClient::should_retry_request(500, &Method::PUT, true));
        assert!(!AzureClient::should_retry_request(429, &Method::PUT, false));
        assert!(!AzureClient::should_retry_request(
            504,
            &Method::POST,
            false
        ));

        // 429/503 with Retry-After means the server refused it outright.
        assert!(AzureClient::should_retry_request(429, &Method::PUT, true));
        assert!(AzureClient::should_retry_request(503, &Method::POST, true));

        // Terminal statuses are never retried, whatever the method.
        assert!(!AzureClient::should_retry_request(404, &Method::GET, true));
        assert!(!AzureClient::should_retry_request(409, &Method::PUT, true));
    }

    #[test]
    fn backoff_delay_adds_bounded_jitter() {
        for attempt in 0..4 {
            let base = Duration::from_secs(AzureClient::backoff_secs(attempt, None));
            for _ in 0..64 {
                let delay = AzureClient::backoff_delay(attempt, None);
                assert!(delay >= base, "jitter must never shorten the wait");
                assert!(
                    delay < base + Duration::from_millis(MAX_JITTER_MILLIS),
                    "jitter must stay bounded"
                );
            }
        }
    }

    #[test]
    fn backoff_jitter_is_not_constant() {
        let samples: std::collections::HashSet<u64> =
            (0..256).map(|_| AzureClient::jitter_millis()).collect();
        assert!(
            samples.len() > 1,
            "clients must not retry in lockstep: {samples:?}"
        );
        assert!(samples.iter().all(|&ms| ms < MAX_JITTER_MILLIS));
    }

    #[test]
    fn backoff_grows_exponentially_and_is_capped() {
        assert_eq!(AzureClient::backoff_secs(0, None), 1);
        assert_eq!(AzureClient::backoff_secs(1, None), 2);
        assert_eq!(AzureClient::backoff_secs(2, None), 4);
        assert_eq!(AzureClient::backoff_secs(3, None), 8);
        // must never shift past the cap, even for an out-of-range attempt
        assert_eq!(AzureClient::backoff_secs(64, None), 8);
    }

    #[test]
    fn backoff_honours_retry_after_header() {
        assert_eq!(AzureClient::backoff_secs(0, Some(5)), 5);
        assert_eq!(AzureClient::backoff_secs(3, Some(0)), 0);
    }

    #[test]
    fn backoff_clamps_hostile_retry_after_header() {
        // A server-controlled Retry-After must not be able to hang the app.
        assert_eq!(AzureClient::backoff_secs(0, Some(86_400)), MAX_BACKOFF_SECS);
        assert_eq!(
            AzureClient::backoff_secs(2, Some(u64::MAX)),
            MAX_BACKOFF_SECS
        );
    }

    // ── Outbound allowlist ──

    #[test]
    fn allowlist_table() {
        let allowed = [
            "https://management.azure.com/subscriptions",
            "https://management.azure.com",
            "https://a.vault.azure.net/secrets",
            "https://a.b.vault.azure.net/secrets",
            "https://a.vault.usgovcloudapi.net/keys",
            "https://a.vault.azure.cn/certificates",
        ];
        for url in allowed {
            assert!(
                AzureClient::is_allowed_azure_url(url),
                "{url} should be allowed"
            );
        }

        let blocked = [
            "http://management.azure.com",
            "https://evil.com",
            "https://management.azure.com.evil.com",
            "https://vault.azure.net.evil.com/secrets",
            "https://notmanagement.azure.com",
            "https://vault.azure.net",
            "https://azure.net",
            "ftp://a.vault.azure.net",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/plain,hi",
            "",
            "not a url",
            "//a.vault.azure.net/secrets",
            "/relative/path",
            // a non-default port is not the real Key Vault endpoint
            "https://demo.vault.azure.net:8443/secrets",
            "https://management.azure.com:8080/subscriptions",
        ];
        for url in blocked {
            assert!(
                !AzureClient::is_allowed_azure_url(url),
                "{url} should be blocked"
            );
        }
    }

    #[test]
    fn allowlist_ignores_userinfo_spoofing() {
        // The authority before '@' must not be mistaken for the host.
        assert!(!AzureClient::is_allowed_azure_url(
            "https://management.azure.com@evil.com/data"
        ));
        assert!(!AzureClient::is_allowed_azure_url(
            "https://a.vault.azure.net@evil.com/secrets"
        ));
    }

    #[test]
    fn allowlist_accepts_the_explicit_default_https_port() {
        // `Url` normalises `:443` away, so this is the same endpoint.
        assert!(AzureClient::is_allowed_azure_url(
            "https://demo.vault.azure.net:443/secrets"
        ));
    }

    #[test]
    fn allowlist_is_case_insensitive_on_host() {
        assert!(AzureClient::is_allowed_azure_url(
            "https://MANAGEMENT.AZURE.COM/subscriptions"
        ));
        assert!(AzureClient::is_allowed_azure_url(
            "https://Demo.Vault.Azure.Net/secrets"
        ));
    }

    // ── request_json guard (no network reached) ──

    #[tokio::test]
    async fn request_json_blocks_non_azure_hosts_before_any_io() {
        let client = AzureClient::new();
        for url in [
            "http://localhost:8080/steal",
            "https://evil.example.com/exfiltrate",
            "not a url",
        ] {
            let err = client
                .request_json(Method::GET, url, "fake-token", None)
                .await
                .expect_err("must be blocked");
            assert_eq!(err, "Blocked outbound request to non-Azure endpoint.");
        }
    }

    #[tokio::test]
    async fn request_json_blocks_non_default_ports_on_allowed_hosts() {
        let client = AzureClient::new();
        let err = client
            .request_json(
                Method::GET,
                "https://demo.vault.azure.net:8443/secrets",
                "fake-token",
                None,
            )
            .await
            .expect_err("must be blocked");
        assert_eq!(err, "Blocked outbound request to non-Azure endpoint.");
    }

    #[tokio::test]
    async fn data_plane_calls_reject_non_azure_vault_uris() {
        let client = AzureClient::new();
        let blocked = "https://evil.example.com";

        // `is_err()` alone is worthless here: with the allowlist removed every
        // one of these still fails -- on DNS or TLS, *after* the bearer token
        // has already gone out to evil.example.com. Only the exact blocked
        // message proves nothing was sent.
        const BLOCKED: &str = "Blocked outbound request to non-Azure endpoint.";

        assert_eq!(
            client.list_secrets("t", blocked).await.unwrap_err(),
            BLOCKED
        );
        assert_eq!(client.list_keys("t", blocked).await.unwrap_err(), BLOCKED);
        assert_eq!(
            client.list_certificates("t", blocked).await.unwrap_err(),
            BLOCKED
        );
        assert_eq!(
            client
                .get_secret_value("t", blocked, "s")
                .await
                .unwrap_err(),
            BLOCKED
        );
        assert_eq!(
            client
                .get_secret_metadata("t", blocked, "s")
                .await
                .unwrap_err(),
            BLOCKED
        );
        assert_eq!(
            client.delete_secret("t", blocked, "s").await.unwrap_err(),
            BLOCKED
        );
        assert_eq!(
            client.recover_secret("t", blocked, "s").await.unwrap_err(),
            BLOCKED
        );
        assert_eq!(
            client.purge_secret("t", blocked, "s").await.unwrap_err(),
            BLOCKED
        );

        let req = CreateSecretRequest {
            name: "s".to_string(),
            value: "v".to_string(),
            content_type: None,
            tags: None,
            enabled: None,
            expires: None,
            not_before: None,
        };
        let err = client.set_secret("t", blocked, &req).await.unwrap_err();
        assert_eq!(err, BLOCKED);
    }
}
