//! Tauri command handlers – the backend boundary consumed by the React UI.
//!
//! Architecture:
//! - Each `#[tauri::command]` function validates input, calls the appropriate
//!   service (auth/azure/audit), records an audit entry, and returns typed data.
//! - Vault URIs are validated against an HTTPS allowlist before any network call.
//! - Secret names are restricted to alphanumeric + dashes (Azure KV constraint).
//! - Export payloads are size-bounded to prevent DoS via oversized input.
//! - Audit fields are truncated to prevent log bloat from malicious input.

use crate::audit::AuditLogger;
use crate::auth::AuthManager;
use crate::azure::AzureClient;
use crate::models::*;
use tauri::State;
use url::Url;

/// Shared application state managed by Tauri.
pub struct AppState {
    pub auth: AuthManager,
    pub azure: AzureClient,
    pub audit: AuditLogger,
}

// ── Safety limits ──

/// Maximum size (bytes) of raw JSON input accepted by `export_items`.
const MAX_EXPORT_INPUT_BYTES: usize = 2_000_000;

/// Maximum number of rows in a single export request.
const MAX_EXPORT_ITEMS: usize = 20_000;

/// Maximum character length for audit log fields before truncation.
const MAX_AUDIT_FIELD_LEN: usize = 512;

// ─────────────────────────────────────────────
// Auth Commands
// ─────────────────────────────────────────────

/// Returns the current authentication state (signed-in, tenant ID).
#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<AuthState, String> {
    let signed_in = state.auth.is_signed_in().await;
    Ok(AuthState {
        signed_in,
        user_name: None, // Could decode JWT claims for display name
        tenant_id: if signed_in {
            Some(state.auth.get_tenant().await)
        } else {
            None
        },
    })
}

/// Signs out by resetting the tenant preference and logging the action.
#[tauri::command]
pub async fn auth_sign_out(state: State<'_, AppState>) -> Result<(), String> {
    state.auth.sign_out().await;
    state
        .audit
        .log_action("system", "sign_out", "auth", "user", "success", None)
        .await;
    Ok(())
}

/// Sets the preferred tenant ID for subsequent API calls.
#[tauri::command]
pub async fn set_tenant(state: State<'_, AppState>, tenant_id: String) -> Result<(), String> {
    state.auth.set_tenant(&tenant_id).await;
    Ok(())
}

// ─────────────────────────────────────────────
// Resource Discovery Commands
// ─────────────────────────────────────────────

/// Lists Azure AD tenants accessible to the current identity.
#[tauri::command]
pub async fn list_tenants(state: State<'_, AppState>) -> Result<Vec<Tenant>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_tenants(&token).await
}

/// Lists Azure subscriptions accessible to the current identity.
#[tauri::command]
pub async fn list_subscriptions(state: State<'_, AppState>) -> Result<Vec<Subscription>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_subscriptions(&token).await
}

/// Lists Key Vault resources within a subscription.
#[tauri::command]
pub async fn list_keyvaults(
    state: State<'_, AppState>,
    subscription_id: String,
) -> Result<Vec<KeyVaultInfo>, String> {
    let token = state.auth.get_management_token().await?;
    let result = state.azure.list_keyvaults(&token, &subscription_id).await;

    // Audit: log vault discovery results
    match &result {
        Ok(vaults) => {
            state
                .audit
                .log_action(
                    "system",
                    "list_keyvaults",
                    "vault",
                    &subscription_id,
                    &format!("found {} vaults", vaults.len()),
                    None,
                )
                .await;
        }
        Err(e) => {
            state
                .audit
                .log_action(
                    "system",
                    "list_keyvaults",
                    "vault",
                    &subscription_id,
                    "error",
                    Some(e),
                )
                .await;
        }
    }

    result
}

// ─────────────────────────────────────────────
// Vault Item Commands
// ─────────────────────────────────────────────

/// Lists all secrets in the specified vault.
#[tauri::command]
pub async fn list_secrets(
    state: State<'_, AppState>,
    vault_uri: String,
) -> Result<Vec<SecretItem>, String> {
    validate_vault_uri(&vault_uri)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);
    let result = state.azure.list_secrets(&token, &vault_uri).await;

    state
        .audit
        .log_action(
            &vault_name,
            "list_secrets",
            "secret",
            "*",
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Lists all cryptographic keys in the specified vault.
#[tauri::command]
pub async fn list_keys(
    state: State<'_, AppState>,
    vault_uri: String,
) -> Result<Vec<KeyItem>, String> {
    validate_vault_uri(&vault_uri)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);
    let result = state.azure.list_keys(&token, &vault_uri).await;

    state
        .audit
        .log_action(
            &vault_name,
            "list_keys",
            "key",
            "*",
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Lists all certificates in the specified vault.
#[tauri::command]
pub async fn list_certificates(
    state: State<'_, AppState>,
    vault_uri: String,
) -> Result<Vec<CertificateItem>, String> {
    validate_vault_uri(&vault_uri)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);
    let result = state.azure.list_certificates(&token, &vault_uri).await;

    state
        .audit
        .log_action(
            &vault_name,
            "list_certificates",
            "certificate",
            "*",
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Fetches a secret's value from the data plane (sensitive – always audited).
#[tauri::command]
pub async fn get_secret_value(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<SecretValue, String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state
        .azure
        .get_secret_value(&token, &vault_uri, &name)
        .await;

    // Always redact value details in audit
    state
        .audit
        .log_action(
            &vault_name,
            "get_secret_value",
            "secret",
            &name,
            result_status(&result),
            Some("[value retrieved - REDACTED]"),
        )
        .await;

    result
}

/// Fetches secret metadata (without the value).
#[tauri::command]
pub async fn get_secret_metadata(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<SecretItem, String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state
        .azure
        .get_secret_metadata(&token, &vault_uri, &name)
        .await;

    state
        .audit
        .log_action(
            &vault_name,
            "get_secret_metadata",
            "secret",
            &name,
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Creates or versions a secret.
#[tauri::command]
pub async fn set_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    request: CreateSecretRequest,
) -> Result<SecretItem, String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&request.name)?;

    // Enforce value size limits (Azure KV limit is 25KB)
    if request.value.is_empty() || request.value.len() > 25_000 {
        return Err("Secret value must be between 1 and 25,000 characters.".to_string());
    }

    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);
    let secret_name = request.name.clone();

    let result = state.azure.set_secret(&token, &vault_uri, &request).await;

    state
        .audit
        .log_action(
            &vault_name,
            "set_secret",
            "secret",
            &secret_name,
            result_status(&result),
            Some("[value set - REDACTED]"),
        )
        .await;

    result
}

/// Soft-deletes a secret.
#[tauri::command]
pub async fn delete_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state.azure.delete_secret(&token, &vault_uri, &name).await;

    state
        .audit
        .log_action(
            &vault_name,
            "delete_secret",
            "secret",
            &name,
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Recovers a soft-deleted secret.
#[tauri::command]
pub async fn recover_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state.azure.recover_secret(&token, &vault_uri, &name).await;

    state
        .audit
        .log_action(
            &vault_name,
            "recover_secret",
            "secret",
            &name,
            result_status(&result),
            None,
        )
        .await;

    result
}

/// Permanently purges a deleted secret (irreversible).
#[tauri::command]
pub async fn purge_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state.azure.purge_secret(&token, &vault_uri, &name).await;

    state
        .audit
        .log_action(
            &vault_name,
            "purge_secret",
            "secret",
            &name,
            result_status(&result),
            None,
        )
        .await;

    result
}

// ─────────────────────────────────────────────
// Audit Commands
// ─────────────────────────────────────────────

/// Returns the most recent audit log entries.
#[tauri::command]
pub async fn get_audit_log(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    Ok(state.audit.get_entries(limit).await)
}

/// Alias for `get_audit_log` (backwards compatibility).
#[tauri::command]
pub async fn read_audit_log(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    get_audit_log(state, limit).await
}

/// Writes a custom audit log entry (all fields are truncated for safety).
#[tauri::command]
pub async fn write_audit_log(
    state: State<'_, AppState>,
    vault_name: String,
    action: String,
    item_type: String,
    item_name: String,
    result: String,
    details: Option<String>,
) -> Result<(), String> {
    let vault_name = truncate_for_audit(vault_name);
    let action = truncate_for_audit(action);
    let item_type = truncate_for_audit(item_type);
    let item_name = truncate_for_audit(item_name);
    let result = truncate_for_audit(result);
    let details = details.map(truncate_for_audit);

    state
        .audit
        .log_action(
            &vault_name,
            &action,
            &item_type,
            &item_name,
            &result,
            details.as_deref(),
        )
        .await;
    Ok(())
}

/// Returns the full audit log as sanitised JSON (suitable for export/clipboard).
#[tauri::command]
pub async fn export_audit_log(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.audit.get_sanitized_export().await)
}

/// Clears all audit log entries from memory and disk.
#[tauri::command]
pub async fn clear_audit_log(state: State<'_, AppState>) -> Result<(), String> {
    state.audit.clear().await;
    Ok(())
}

// ─────────────────────────────────────────────
// Export Commands
// ─────────────────────────────────────────────

/// Exports vault item metadata as JSON or CSV.
///
/// # Security
/// - Input size is bounded to `MAX_EXPORT_INPUT_BYTES`.
/// - Row count is bounded to `MAX_EXPORT_ITEMS`.
/// - Only metadata is exported; secret values are never included.
#[tauri::command]
pub async fn export_items(items_json: String, format: String) -> Result<String, String> {
    if items_json.len() > MAX_EXPORT_INPUT_BYTES {
        return Err(format!(
            "Export payload too large (max {} bytes).",
            MAX_EXPORT_INPUT_BYTES
        ));
    }

    let items: Vec<serde_json::Value> =
        serde_json::from_str(&items_json).map_err(|e| format!("Invalid JSON: {}", e))?;
    if items.len() > MAX_EXPORT_ITEMS {
        return Err(format!(
            "Too many items to export (max {}).",
            MAX_EXPORT_ITEMS
        ));
    }

    match format.as_str() {
        "json" => serde_json::to_string_pretty(&items).map_err(|e| format!("Export error: {}", e)),
        "csv" => {
            if items.is_empty() {
                return Ok(String::new());
            }

            let mut csv = String::new();

            // Use the first item's keys as CSV headers
            if let Some(first) = items.first() {
                if let Some(obj) = first.as_object() {
                    let headers: Vec<&String> = obj.keys().collect();
                    csv.push_str(
                        &headers
                            .iter()
                            .map(|h| h.as_str())
                            .collect::<Vec<_>>()
                            .join(","),
                    );
                    csv.push('\n');

                    for item in &items {
                        if let Some(obj) = item.as_object() {
                            let row: Vec<String> = headers
                                .iter()
                                .map(|h| {
                                    let val =
                                        obj.get(*h).cloned().unwrap_or(serde_json::Value::Null);
                                    match val {
                                        serde_json::Value::String(s) => {
                                            // Escape double quotes in CSV values
                                            format!("\"{}\"", s.replace('"', "\"\""))
                                        }
                                        serde_json::Value::Null => String::new(),
                                        other => other.to_string(),
                                    }
                                })
                                .collect();
                            csv.push_str(&row.join(","));
                            csv.push('\n');
                        }
                    }
                }
            }

            Ok(csv)
        }
        _ => Err(format!(
            "Unsupported export format: '{}'. Use 'json' or 'csv'.",
            format
        )),
    }
}

// ─────────────────────────────────────────────
// Validation Helpers
// ─────────────────────────────────────────────

/// Extracts the vault name from its URI (e.g., `https://my-vault.vault.azure.net` -> `my-vault`).
fn extract_vault_name(vault_uri: &str) -> String {
    vault_uri
        .trim_start_matches("https://")
        .split('.')
        .next()
        .unwrap_or("unknown")
        .to_string()
}

/// Returns `"success"` or `"error"` based on the result variant.
fn result_status<T>(result: &Result<T, String>) -> &'static str {
    if result.is_ok() {
        "success"
    } else {
        "error"
    }
}

/// Validates that a vault URI uses HTTPS and targets an Azure Key Vault endpoint.
fn validate_vault_uri(vault_uri: &str) -> Result<(), String> {
    let parsed = Url::parse(vault_uri).map_err(|_| "Invalid vault URI.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Vault URI must use HTTPS.".to_string());
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| "Vault URI must include a host.".to_string())?;
    let allowed = host.ends_with(".vault.azure.net")
        || host.ends_with(".vault.usgovcloudapi.net")
        || host.ends_with(".vault.azure.cn");
    if !allowed {
        return Err("Vault URI must target an Azure Key Vault endpoint.".to_string());
    }

    Ok(())
}

/// Validates an item name (secret/key/certificate):
/// - Must be 1–127 characters
/// - Only alphanumeric characters and hyphens
fn validate_item_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 127 {
        return Err("Item name must be between 1 and 127 characters.".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Item name may only contain letters, numbers, and hyphens.".to_string());
    }
    Ok(())
}

/// Truncates a string to the audit field length limit.
fn truncate_for_audit(value: String) -> String {
    value.chars().take(MAX_AUDIT_FIELD_LEN).collect()
}

// ── Tests ──

#[cfg(test)]
mod tests {
    use super::*;

    // ── Vault URI validation ──

    #[test]
    fn accepts_valid_azure_public_vault_uri() {
        assert!(validate_vault_uri("https://demo.vault.azure.net").is_ok());
    }

    #[test]
    fn accepts_valid_us_gov_vault_uri() {
        assert!(validate_vault_uri("https://demo.vault.usgovcloudapi.net").is_ok());
    }

    #[test]
    fn accepts_valid_china_vault_uri() {
        assert!(validate_vault_uri("https://demo.vault.azure.cn").is_ok());
    }

    #[test]
    fn rejects_http_vault_uri() {
        assert!(validate_vault_uri("http://demo.vault.azure.net").is_err());
    }

    #[test]
    fn rejects_non_azure_vault_uri() {
        assert!(validate_vault_uri("https://evil.example.com").is_err());
    }

    #[test]
    fn rejects_empty_vault_uri() {
        assert!(validate_vault_uri("").is_err());
    }

    #[test]
    fn rejects_vault_uri_without_host() {
        assert!(validate_vault_uri("https://").is_err());
    }

    // ── Item name validation ──

    #[test]
    fn accepts_valid_item_name() {
        assert!(validate_item_name("valid-name-01").is_ok());
    }

    #[test]
    fn accepts_single_char_name() {
        assert!(validate_item_name("a").is_ok());
    }

    #[test]
    fn rejects_empty_item_name() {
        assert!(validate_item_name("").is_err());
    }

    #[test]
    fn rejects_item_name_with_underscores() {
        assert!(validate_item_name("bad_name").is_err());
    }

    #[test]
    fn rejects_item_name_with_spaces() {
        assert!(validate_item_name("bad name").is_err());
    }

    #[test]
    fn rejects_item_name_with_dots() {
        assert!(validate_item_name("bad.name").is_err());
    }

    #[test]
    fn rejects_overly_long_item_name() {
        let long_name = "a".repeat(128);
        assert!(validate_item_name(&long_name).is_err());
    }

    #[test]
    fn accepts_max_length_item_name() {
        let name = "a".repeat(127);
        assert!(validate_item_name(&name).is_ok());
    }

    // ── Audit truncation ──

    #[test]
    fn truncates_long_audit_field() {
        let long = "a".repeat(2048);
        let truncated = truncate_for_audit(long);
        assert_eq!(truncated.len(), MAX_AUDIT_FIELD_LEN);
    }

    #[test]
    fn preserves_short_audit_field() {
        let short = "hello".to_string();
        assert_eq!(truncate_for_audit(short.clone()), short);
    }

    // ── Vault name extraction ──

    #[test]
    fn extracts_vault_name_from_uri() {
        assert_eq!(
            extract_vault_name("https://my-vault.vault.azure.net"),
            "my-vault"
        );
    }

    #[test]
    fn extracts_vault_name_from_govcloud_uri() {
        assert_eq!(
            extract_vault_name("https://gov-vault.vault.usgovcloudapi.net"),
            "gov-vault"
        );
    }

    #[test]
    fn extracts_vault_name_handles_trailing_slash() {
        assert_eq!(
            extract_vault_name("https://my-vault.vault.azure.net/"),
            "my-vault"
        );
    }

    // ── Result status helper ──

    #[test]
    fn result_status_success() {
        let ok: Result<(), String> = Ok(());
        assert_eq!(result_status(&ok), "success");
    }

    #[test]
    fn result_status_error() {
        let err: Result<(), String> = Err("fail".to_string());
        assert_eq!(result_status(&err), "error");
    }

    // ── Export ──

    #[tokio::test]
    async fn exports_items_as_json() {
        let input = r#"[{"name":"secret-1"},{"name":"secret-2"}]"#.to_string();
        let out = export_items(input, "json".to_string())
            .await
            .expect("json export should succeed");
        assert!(out.contains("secret-1"));
        assert!(out.contains("secret-2"));
    }

    #[tokio::test]
    async fn exports_items_as_csv() {
        let input = r#"[{"name":"n1","enabled":true},{"name":"n2","enabled":false}]"#.to_string();
        let out = export_items(input, "csv".to_string())
            .await
            .expect("csv export should succeed");
        assert!(out.lines().count() >= 2, "should have header + data rows");
        assert!(out.contains("\"n1\""));
        assert!(out.contains("\"n2\""));
    }

    #[tokio::test]
    async fn exports_csv_escapes_quotes_and_nulls() {
        let input = r#"[{"name":"db\"prod","enabled":null,"count":3}]"#.to_string();
        let out = export_items(input, "csv".to_string())
            .await
            .expect("csv export should succeed");
        assert!(
            out.contains("\"db\"\"prod\""),
            "quoted values should be escaped"
        );
        assert!(
            out.contains(",,"),
            "null values should be exported as empty CSV cells"
        );
    }

    #[tokio::test]
    async fn exports_empty_csv() {
        let input = "[]".to_string();
        let out = export_items(input, "csv".to_string())
            .await
            .expect("empty csv should succeed");
        assert_eq!(out, "");
    }

    #[tokio::test]
    async fn rejects_oversized_export_payload() {
        let huge = "a".repeat(MAX_EXPORT_INPUT_BYTES + 10);
        let err = export_items(huge, "json".to_string())
            .await
            .expect_err("should reject oversized payload");
        assert!(err.contains("too large"));
    }

    #[tokio::test]
    async fn rejects_unsupported_export_format() {
        let input = r#"[{"name":"test"}]"#.to_string();
        let err = export_items(input, "xml".to_string())
            .await
            .expect_err("should reject xml format");
        assert!(err.contains("Unsupported"));
    }

    #[tokio::test]
    async fn rejects_invalid_json_export() {
        let err = export_items("not json".to_string(), "json".to_string())
            .await
            .expect_err("should reject invalid json");
        assert!(err.contains("Invalid JSON"));
    }
}
