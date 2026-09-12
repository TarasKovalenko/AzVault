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
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
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

/// Maximum size (bytes) of a rendered export written to disk.
const MAX_EXPORT_OUTPUT_BYTES: usize = 8_000_000;

/// Maximum number of rows in a single export request.
const MAX_EXPORT_ITEMS: usize = 20_000;

// ─────────────────────────────────────────────
// Auth Commands
// ─────────────────────────────────────────────

/// Returns the current authentication state (signed-in, tenant ID).
#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<AuthState, String> {
    auth_status_impl(&state).await
}

/// Tauri-independent implementation of [`auth_status`].
pub(crate) async fn auth_status_impl(state: &AppState) -> Result<AuthState, String> {
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
    auth_sign_out_impl(&state).await
}

/// Tauri-independent implementation of [`auth_sign_out`].
pub(crate) async fn auth_sign_out_impl(state: &AppState) -> Result<(), String> {
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
    set_tenant_impl(&state, tenant_id).await
}

/// Tauri-independent implementation of [`set_tenant`].
pub(crate) async fn set_tenant_impl(state: &AppState, tenant_id: String) -> Result<(), String> {
    state.auth.set_tenant(&tenant_id).await;
    Ok(())
}

// ─────────────────────────────────────────────
// Resource Discovery Commands
// ─────────────────────────────────────────────

/// Lists Azure AD tenants accessible to the current identity.
#[tauri::command]
pub async fn list_tenants(state: State<'_, AppState>) -> Result<Vec<Tenant>, String> {
    list_tenants_impl(&state).await
}

/// Tauri-independent implementation of [`list_tenants`].
pub(crate) async fn list_tenants_impl(state: &AppState) -> Result<Vec<Tenant>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_tenants(&token).await
}

/// Lists Azure subscriptions accessible to the current identity.
#[tauri::command]
pub async fn list_subscriptions(state: State<'_, AppState>) -> Result<Vec<Subscription>, String> {
    list_subscriptions_impl(&state).await
}

/// Tauri-independent implementation of [`list_subscriptions`].
pub(crate) async fn list_subscriptions_impl(state: &AppState) -> Result<Vec<Subscription>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_subscriptions(&token).await
}

/// Lists Key Vault resources within a subscription.
#[tauri::command]
pub async fn list_keyvaults(
    state: State<'_, AppState>,
    subscription_id: String,
) -> Result<Vec<KeyVaultInfo>, String> {
    list_keyvaults_impl(&state, subscription_id).await
}

/// Tauri-independent implementation of [`list_keyvaults`].
pub(crate) async fn list_keyvaults_impl(
    state: &AppState,
    subscription_id: String,
) -> Result<Vec<KeyVaultInfo>, String> {
    validate_subscription_id(&subscription_id)?;

    let token = state.auth.get_management_token().await?;
    let result = state.azure.list_keyvaults(&token, &subscription_id).await;

    // Audit: log vault discovery results.
    let details = discovery_details(&result);
    state
        .audit
        .log_action(
            "system",
            "list_keyvaults",
            "vault",
            &subscription_id,
            result_status(&result),
            Some(&details),
        )
        .await;

    result
}

/// Builds the audit `details` for a vault-discovery call.
///
/// The count lives here rather than in `result`: the Activity tab filters the
/// result column by exact match against "success"/"error", so a "found N
/// vaults" result silently hid every discovery entry from the view.
fn discovery_details<T>(result: &Result<Vec<T>, String>) -> String {
    match result {
        Ok(vaults) => format!("found {} vaults", vaults.len()),
        Err(e) => e.clone(),
    }
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
    list_secrets_impl(&state, vault_uri).await
}

/// Tauri-independent implementation of [`list_secrets`].
pub(crate) async fn list_secrets_impl(
    state: &AppState,
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
    list_keys_impl(&state, vault_uri).await
}

/// Tauri-independent implementation of [`list_keys`].
pub(crate) async fn list_keys_impl(
    state: &AppState,
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
    list_certificates_impl(&state, vault_uri).await
}

/// Tauri-independent implementation of [`list_certificates`].
pub(crate) async fn list_certificates_impl(
    state: &AppState,
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
    get_secret_value_impl(&state, vault_uri, name).await
}

/// Tauri-independent implementation of [`get_secret_value`].
pub(crate) async fn get_secret_value_impl(
    state: &AppState,
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
    get_secret_metadata_impl(&state, vault_uri, name).await
}

/// Tauri-independent implementation of [`get_secret_metadata`].
pub(crate) async fn get_secret_metadata_impl(
    state: &AppState,
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
    set_secret_impl(&state, vault_uri, request).await
}

/// Tauri-independent implementation of [`set_secret`].
pub(crate) async fn set_secret_impl(
    state: &AppState,
    vault_uri: String,
    request: CreateSecretRequest,
) -> Result<SecretItem, String> {
    validate_vault_uri(&vault_uri)?;
    validate_item_name(&request.name)?;

    validate_secret_value(&request.value)?;

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
    delete_secret_impl(&state, vault_uri, name).await
}

/// Tauri-independent implementation of [`delete_secret`].
pub(crate) async fn delete_secret_impl(
    state: &AppState,
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
    recover_secret_impl(&state, vault_uri, name).await
}

/// Tauri-independent implementation of [`recover_secret`].
pub(crate) async fn recover_secret_impl(
    state: &AppState,
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
    purge_secret_impl(&state, vault_uri, name).await
}

/// Tauri-independent implementation of [`purge_secret`].
pub(crate) async fn purge_secret_impl(
    state: &AppState,
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
    vault_name: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    get_audit_log_impl(&state, limit, vault_name).await
}

/// Tauri-independent implementation of [`get_audit_log`].
pub(crate) async fn get_audit_log_impl(
    state: &AppState,
    limit: Option<usize>,
    vault_name: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    Ok(state.audit.get_entries(limit, vault_name.as_deref()).await)
}

/// Returns the full audit log as sanitised JSON (suitable for export/clipboard).
#[tauri::command]
pub async fn export_audit_log(
    state: State<'_, AppState>,
    vault_name: Option<String>,
) -> Result<String, String> {
    export_audit_log_impl(&state, vault_name).await
}

/// Tauri-independent implementation of [`export_audit_log`].
pub(crate) async fn export_audit_log_impl(
    state: &AppState,
    vault_name: Option<String>,
) -> Result<String, String> {
    Ok(state
        .audit
        .get_sanitized_export(vault_name.as_deref())
        .await)
}

/// Clears all audit log entries from memory and disk.
#[tauri::command]
pub async fn clear_audit_log(
    state: State<'_, AppState>,
    vault_name: Option<String>,
) -> Result<(), String> {
    clear_audit_log_impl(&state, vault_name).await
}

/// Tauri-independent implementation of [`clear_audit_log`].
pub(crate) async fn clear_audit_log_impl(
    state: &AppState,
    vault_name: Option<String>,
) -> Result<(), String> {
    state.audit.clear(vault_name.as_deref()).await;
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
    let items = parse_export_payload(&items_json)?;
    render_export(&items, &format)
}

/// Writes an export next to the user's other downloads and returns the path it
/// landed on.
///
/// The webview's `<a download>` path cannot be trusted on the desktop build:
/// WKWebView has no download handling, so the UI would report success while no
/// file was ever written. Going through the backend means the toast can name a
/// real path.
#[tauri::command]
pub async fn save_export(
    app: tauri::AppHandle,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    let name = validate_export_file_name(&file_name)?;
    if contents.len() > MAX_EXPORT_OUTPUT_BYTES {
        return Err("Export is too large to save.".to_string());
    }
    let dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|_| "Could not locate a directory to save into.".to_string())?;
    write_export_file(&dir, &name, &contents)
}

/// Rejects anything that is not a plain `name.json` / `name.csv` leaf: an
/// export must not be able to choose where on disk it lands.
fn validate_export_file_name(file_name: &str) -> Result<String, String> {
    let name = file_name.trim();
    let valid_chars = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
    let has_allowed_extension = name.ends_with(".json") || name.ends_with(".csv");
    if name.is_empty()
        || name.len() > 128
        || !valid_chars
        || name.starts_with('.')
        || name.contains("..")
        || !has_allowed_extension
    {
        return Err("Invalid export file name.".to_string());
    }
    Ok(name.to_string())
}

/// Maximum numeric suffix tried before an export is refused.
const MAX_EXPORT_SUFFIX: u32 = 1000;

/// Writes `contents` into `dir`, adding a numeric suffix rather than
/// overwriting a file that is already there.
///
/// `create_new` rather than `create`: `unique_export_path` checks and then the
/// file is opened, and something else may create the file in between. The
/// kernel check is the only one that cannot be raced.
///
/// On Unix the file is created 0o600. An export is a list of the user's vault
/// item names landing in `~/Downloads`; at the default umask it would be world
/// readable on a shared machine.
fn write_export_file(dir: &Path, file_name: &str, contents: &str) -> Result<String, String> {
    std::fs::create_dir_all(dir)
        .map_err(|_| "Could not create the export directory.".to_string())?;
    let path = unique_export_path(dir, file_name)?;

    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options
        .open(&path)
        .map_err(|_| "Could not write the export.".to_string())?;
    file.write_all(contents.as_bytes())
        .map_err(|_| "Could not write the export.".to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Finds a free path for `file_name` in `dir`.
///
/// Errors rather than falling back to the original candidate: returning a path
/// that already exists made the caller overwrite the user's file, which is the
/// exact opposite of what this function is for.
fn unique_export_path(dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let candidate = dir.join(file_name);
    if !candidate.exists() {
        return Ok(candidate);
    }
    let (stem, extension) = match file_name.rsplit_once('.') {
        Some((stem, extension)) => (stem, extension),
        None => (file_name, ""),
    };
    for index in 1..MAX_EXPORT_SUFFIX {
        let next = dir.join(format!("{stem}-{index}.{extension}"));
        if !next.exists() {
            return Ok(next);
        }
    }
    Err(
        "Too many exports with this name already exist. Rename or remove some and try again."
            .to_string(),
    )
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

/// Validates and decodes the raw export payload sent by the UI.
///
/// # Security
/// Both the byte size and the row count are bounded before any allocation
/// proportional to the input is performed.
fn parse_export_payload(items_json: &str) -> Result<Vec<serde_json::Value>, String> {
    if items_json.len() > MAX_EXPORT_INPUT_BYTES {
        return Err(format!(
            "Export payload too large (max {} bytes).",
            MAX_EXPORT_INPUT_BYTES
        ));
    }

    let items: Vec<serde_json::Value> =
        serde_json::from_str(items_json).map_err(|e| format!("Invalid JSON: {}", e))?;
    if items.len() > MAX_EXPORT_ITEMS {
        return Err(format!(
            "Too many items to export (max {}).",
            MAX_EXPORT_ITEMS
        ));
    }

    Ok(items)
}

/// Renders already-validated rows in the requested export format.
fn render_export(items: &[serde_json::Value], format: &str) -> Result<String, String> {
    match format {
        "json" => serde_json::to_string_pretty(items).map_err(|e| format!("Export error: {}", e)),
        "csv" => Ok(render_csv(items)),
        _ => Err(format!(
            "Unsupported export format: '{}'. Use 'json' or 'csv'.",
            format
        )),
    }
}

/// Renders rows as CSV, using the first row's keys as the header set.
fn render_csv(items: &[serde_json::Value]) -> String {
    let Some(headers) = items
        .first()
        .and_then(|first| first.as_object())
        .map(|obj| obj.keys().cloned().collect::<Vec<String>>())
    else {
        return String::new();
    };

    let mut csv = String::new();
    let header_row: Vec<String> = headers
        .iter()
        .map(|h| csv_cell(&serde_json::Value::String(h.clone())))
        .collect();
    csv.push_str(&header_row.join(","));
    csv.push('\n');

    for item in items {
        if let Some(obj) = item.as_object() {
            let row: Vec<String> = headers
                .iter()
                .map(|h| csv_cell(obj.get(h).unwrap_or(&serde_json::Value::Null)))
                .collect();
            csv.push_str(&row.join(","));
            csv.push('\n');
        }
    }

    csv
}

/// Renders one CSV cell: nulls become empty cells, everything else is quoted
/// and escaped.
///
/// Non-string values go through the same path as strings. `export_items` takes
/// arbitrary caller-supplied JSON, and a nested object or array renders with
/// commas and quotes of its own (`{"env":"prod","team":"sec"}`) -- emitted raw
/// it would shred the row into extra columns.
///
/// Leading `=`, `+`, `-`, `@`, tab and CR make spreadsheet applications treat a
/// cell as a formula, so a tag or content type copied out of a vault could run
/// on the machine of whoever opens the export. Such cells are prefixed with an
/// apostrophe, the conventional "this is text" escape.
fn csv_cell(value: &serde_json::Value) -> String {
    let raw = match value {
        serde_json::Value::Null => return String::new(),
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    };

    let escaped = raw.replace('"', "\"\"");
    if starts_with_formula_trigger(&escaped) {
        format!("\"'{escaped}\"")
    } else {
        format!("\"{escaped}\"")
    }
}

fn starts_with_formula_trigger(value: &str) -> bool {
    matches!(
        value.chars().next(),
        Some('=') | Some('+') | Some('-') | Some('@') | Some('\t') | Some('\r')
    )
}

/// Validates an Azure subscription identifier before it is used as an audit
/// `item_name` or interpolated into an ARM URL.
///
/// Azure subscription IDs are GUIDs; anything else is rejected rather than
/// truncated, so a hostile caller cannot smuggle path or query syntax through.
fn validate_subscription_id(subscription_id: &str) -> Result<(), String> {
    let valid = subscription_id.len() == 36
        && subscription_id
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-')
        && subscription_id
            .split('-')
            .map(str::len)
            .eq([8, 4, 4, 4, 12]);

    if valid {
        Ok(())
    } else {
        Err("Subscription ID must be a GUID.".to_string())
    }
}

/// Enforces the Key Vault secret value size limits (1–25,000 characters).
fn validate_secret_value(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 25_000 {
        return Err("Secret value must be between 1 and 25,000 characters.".to_string());
    }
    Ok(())
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

    // ── Subscription IDs ──

    #[test]
    fn accepts_a_guid_subscription_id() {
        assert!(validate_subscription_id("00000000-0000-0000-0000-000000000000").is_ok());
        assert!(validate_subscription_id("A1B2C3D4-e5f6-7890-ABCD-1234567890ef").is_ok());
    }

    #[test]
    fn rejects_non_guid_subscription_ids() {
        for input in [
            "",
            "sub",
            "00000000-0000-0000-0000-00000000000", // too short
            "00000000-0000-0000-0000-0000000000000", // too long
            "00000000-0000-0000-0000-00000000000g", // non-hex
            "00000000-0000-0000-0000-000000000000/",
            "0000000000000-000-0000-0000-000000000", // right length, wrong shape
            "../../../etc/passwd",
            "00000000-0000-0000-0000-000000000000 ",
        ] {
            assert!(
                validate_subscription_id(input).is_err(),
                "{input:?} must be rejected"
            );
        }
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

#[cfg(test)]
mod validation_tests {
    use super::*;

    // ── Vault URI ──

    #[test]
    fn vault_uri_allowlist_table() {
        let accepted = [
            "https://demo.vault.azure.net",
            "https://demo.vault.azure.net/",
            "https://demo.vault.azure.net/secrets",
            "https://a-b-c.vault.azure.net",
            "https://demo.vault.usgovcloudapi.net",
            "https://demo.vault.azure.cn",
            "https://DEMO.VAULT.AZURE.NET",
        ];
        for uri in accepted {
            assert!(validate_vault_uri(uri).is_ok(), "{uri} should be accepted");
        }

        let rejected = [
            "http://demo.vault.azure.net",
            "ftp://demo.vault.azure.net",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>",
            "https://evil.example.com",
            "https://demo.vault.azure.net.evil.com",
            "https://vault.azure.net",
            "https://demo.vault.azure.net.",
            "https://management.azure.com",
            "",
            "   ",
            "demo.vault.azure.net",
            "//demo.vault.azure.net",
            "https://",
        ];
        for uri in rejected {
            assert!(validate_vault_uri(uri).is_err(), "{uri} should be rejected");
        }
    }

    #[test]
    fn vault_uri_errors_are_specific() {
        assert_eq!(
            validate_vault_uri("notaurl").unwrap_err(),
            "Invalid vault URI."
        );
        assert_eq!(
            validate_vault_uri("http://demo.vault.azure.net").unwrap_err(),
            "Vault URI must use HTTPS."
        );
        assert_eq!(
            validate_vault_uri("https://evil.com").unwrap_err(),
            "Vault URI must target an Azure Key Vault endpoint."
        );
    }

    #[test]
    fn vault_uri_ignores_userinfo_spoofing() {
        assert!(validate_vault_uri("https://demo.vault.azure.net@evil.com").is_err());
        assert!(validate_vault_uri("https://user:pw@evil.com/demo.vault.azure.net").is_err());
    }

    // ── Item name ──

    #[test]
    fn item_name_validation_table() {
        let accepted = ["a", "A", "0", "valid-name-01", "-", "---", &"a".repeat(127)];
        for name in accepted {
            assert!(
                validate_item_name(name).is_ok(),
                "{name} should be accepted"
            );
        }

        let rejected = [
            "",
            "bad_name",
            "bad name",
            "bad.name",
            "bad/name",
            "bad\\name",
            "bad:name",
            "bad;name",
            "../../etc/passwd",
            "name?api-version=7.5",
            "name#frag",
            "name%2F",
            "naïve",
            "名前",
            "tab\tname",
            "new\nline",
            "null\0byte",
            &"a".repeat(128),
        ];
        for name in rejected {
            assert!(
                validate_item_name(name).is_err(),
                "{name:?} should be rejected"
            );
        }
    }

    #[test]
    fn item_name_rejects_path_and_query_injection_into_urls() {
        // Anything that could escape the /secrets/{name} path segment must fail.
        for hostile in ["..", "a/../b", "a%2fb", "a?b", "a&b", "a=b"] {
            assert!(
                validate_item_name(hostile).is_err(),
                "{hostile} must not reach URL construction"
            );
        }
    }

    #[test]
    fn item_name_errors_are_specific() {
        assert!(validate_item_name("").unwrap_err().contains("1 and 127"));
        assert!(validate_item_name("a_b")
            .unwrap_err()
            .contains("letters, numbers, and hyphens"));
    }

    // ── Secret value ──

    #[test]
    fn secret_value_size_boundaries() {
        assert!(validate_secret_value("a").is_ok());
        assert!(validate_secret_value(&"a".repeat(25_000)).is_ok());
        assert!(validate_secret_value("").is_err());
        assert!(validate_secret_value(&"a".repeat(25_001)).is_err());
    }

    #[test]
    fn secret_value_limit_is_measured_in_bytes() {
        // 4-byte characters hit the limit sooner; the check must not panic.
        let value = "😀".repeat(6_251); // 25_004 bytes
        assert!(validate_secret_value(&value).is_err());
    }

    #[test]
    fn secret_value_error_message_never_echoes_the_value() {
        let err = validate_secret_value("").unwrap_err();
        assert_eq!(err, "Secret value must be between 1 and 25,000 characters.");
        let err = validate_secret_value(&"TOPSECRET".repeat(5000)).unwrap_err();
        assert!(!err.contains("TOPSECRET"), "{err}");
    }

    // ── Vault name extraction ──

    #[test]
    fn extract_vault_name_table() {
        let cases = [
            ("https://my-vault.vault.azure.net", "my-vault"),
            ("https://my-vault.vault.azure.net/", "my-vault"),
            ("https://my-vault.vault.azure.net/secrets/x", "my-vault"),
            ("https://gov.vault.usgovcloudapi.net", "gov"),
            ("https://cn.vault.azure.cn", "cn"),
            ("https://", ""),
            ("", ""),
        ];
        for (uri, expected) in cases {
            assert_eq!(extract_vault_name(uri), expected, "uri={uri}");
        }
    }

    #[test]
    fn extract_vault_name_is_only_used_for_audit_labelling() {
        // It is deliberately lenient; validate_vault_uri is the security gate.
        assert_eq!(extract_vault_name("not-a-uri"), "not-a-uri");
    }

    // ── Vault discovery auditing ──

    #[test]
    fn vault_discovery_puts_the_count_in_details_not_in_result() {
        // The Activity tab filters the result column by exact match, so a
        // "found N vaults" result would hide every discovery entry.
        let ok: Result<Vec<u8>, String> = Ok(vec![1, 2, 3]);
        assert_eq!(result_status(&ok), "success");
        assert_eq!(discovery_details(&ok), "found 3 vaults");

        let empty: Result<Vec<u8>, String> = Ok(Vec::new());
        assert_eq!(result_status(&empty), "success");
        assert_eq!(discovery_details(&empty), "found 0 vaults");

        let err: Result<Vec<u8>, String> = Err("[403] Forbidden".to_string());
        assert_eq!(result_status(&err), "error");
        assert_eq!(discovery_details(&err), "[403] Forbidden");
    }

    // ── Result status ──

    #[test]
    fn result_status_table() {
        assert_eq!(result_status::<()>(&Ok(())), "success");
        assert_eq!(result_status(&Ok(vec![1, 2, 3])), "success");
        assert_eq!(result_status::<()>(&Err("boom".to_string())), "error");
    }

    #[test]
    fn result_status_is_one_of_two_fixed_words() {
        // The Activity tab filters the `result` column by exact match, so the
        // vocabulary must stay closed -- no interpolated payloads, no counts.
        let outcomes = [
            result_status::<()>(&Ok(())),
            result_status::<()>(&Err("token=leaked".to_string())),
            result_status(&Ok(vec![1, 2, 3])),
        ];
        for status in outcomes {
            assert!(
                matches!(status, "success" | "error"),
                "unexpected result vocabulary: {status}"
            );
        }
    }
}

#[cfg(test)]
mod export_tests {
    use super::*;
    use serde_json::json;

    // ── Payload validation ──

    #[test]
    fn parse_export_payload_accepts_valid_array() {
        let items = parse_export_payload(r#"[{"a":1},{"a":2}]"#).expect("valid");
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn parse_export_payload_accepts_empty_array() {
        assert!(parse_export_payload("[]").unwrap().is_empty());
    }

    #[test]
    fn parse_export_payload_rejects_non_array_json() {
        for input in [r#"{"a":1}"#, "42", r#""str""#, "null", "true"] {
            assert!(
                parse_export_payload(input).is_err(),
                "{input} should be rejected"
            );
        }
    }

    #[test]
    fn parse_export_payload_rejects_oversized_input_before_parsing() {
        let huge = "a".repeat(MAX_EXPORT_INPUT_BYTES + 1);
        let err = parse_export_payload(&huge).unwrap_err();
        assert!(err.contains("too large"));
        // The size gate must fire before the (expensive) JSON parse.
        assert!(!err.contains("Invalid JSON"));
    }

    #[test]
    fn parse_export_payload_accepts_input_at_the_size_limit() {
        // A single row padded so the whole payload is exactly at the limit.
        let payload = format!("[\"{}\"]", "a".repeat(MAX_EXPORT_INPUT_BYTES - 4));
        assert_eq!(payload.len(), MAX_EXPORT_INPUT_BYTES);
        assert!(parse_export_payload(&payload).is_ok());

        // One byte more is rejected.
        let payload = format!("[\"{}\"]", "a".repeat(MAX_EXPORT_INPUT_BYTES - 3));
        assert!(parse_export_payload(&payload).is_err());
    }

    #[test]
    fn parse_export_payload_rejects_too_many_rows() {
        let payload = format!("[{}]", vec!["0"; MAX_EXPORT_ITEMS + 1].join(","));
        let err = parse_export_payload(&payload).unwrap_err();
        assert!(err.contains("Too many items"));
    }

    #[test]
    fn parse_export_payload_accepts_exactly_max_rows() {
        let payload = format!("[{}]", vec!["0"; MAX_EXPORT_ITEMS].join(","));
        assert_eq!(
            parse_export_payload(&payload).unwrap().len(),
            MAX_EXPORT_ITEMS
        );
    }

    // ── CSV cell rendering ──

    #[test]
    fn csv_cell_table() {
        let cases = [
            (json!("plain"), "\"plain\""),
            (json!("with \"quotes\""), "\"with \"\"quotes\"\"\""),
            (json!("comma, inside"), "\"comma, inside\""),
            (json!("line\nbreak"), "\"line\nbreak\""),
            (json!(""), "\"\""),
            (json!(null), ""),
            // non-string values are quoted and escaped like everything else:
            // a raw object carries commas and quotes of its own, which would
            // otherwise split the row into extra columns
            (json!(42), "\"42\""),
            (json!(1.5), "\"1.5\""),
            (json!(true), "\"true\""),
            (json!(false), "\"false\""),
            (json!([1, 2]), "\"[1,2]\""),
            (json!({"k": "v"}), "\"{\"\"k\"\":\"\"v\"\"}\""),
            (
                json!({"env": "prod", "team": "sec"}),
                "\"{\"\"env\"\":\"\"prod\"\",\"\"team\"\":\"\"sec\"\"}\"",
            ),
            // formula triggers are neutralised for spreadsheet apps
            (json!("=cmd|'/c calc'!A1"), "\"'=cmd|'/c calc'!A1\""),
            (json!("+1234"), "\"'+1234\""),
            (json!("-1234"), "\"'-1234\""),
            (json!("@SUM(A1)"), "\"'@SUM(A1)\""),
            (json!("\tlead-tab"), "\"'\tlead-tab\""),
            (json!("\rlead-cr"), "\"'\rlead-cr\""),
            // a negative number leads with '-', a formula trigger
            (json!(-42), "\"'-42\""),
        ];
        for (value, expected) in cases {
            assert_eq!(csv_cell(&value), expected, "value={value}");
        }
    }

    // ── CSV rendering ──

    #[test]
    fn render_csv_uses_first_row_keys_as_headers() {
        let items = vec![json!({"name": "a", "enabled": true})];
        let csv = render_csv(&items);
        let header = csv.lines().next().unwrap();
        // serde_json preserves insertion order only with the preserve_order
        // feature, so assert on membership rather than exact ordering.
        assert!(header.split(',').any(|h| h == "\"name\""));
        assert!(header.split(',').any(|h| h == "\"enabled\""));
        assert_eq!(csv.lines().count(), 2);
    }

    #[test]
    fn header_cells_are_escaped_like_any_other_cell() {
        // Keys come from caller-supplied JSON too, so a key containing a
        // comma, a quote or a formula trigger must not reshape the header row.
        let items = vec![json!({"a,b": 1, "=cmd": 2, "q\"uote": 3})];
        let header = render_csv(&items).lines().next().unwrap().to_string();
        assert!(header.contains("\"a,b\""), "{header}");
        assert!(header.contains("\"'=cmd\""), "{header}");
        assert!(header.contains("\"q\"\"uote\""), "{header}");
        // three quoted cells -> exactly two separating commas outside quotes
        assert_eq!(header.matches("\",\"").count(), 2, "{header}");
    }

    #[test]
    fn an_object_cell_cannot_inject_extra_columns() {
        let items = vec![json!({"name": "a", "tags": {"env": "prod", "team": "sec"}})];
        let csv = render_csv(&items);
        let row = csv.lines().nth(1).unwrap();
        // Both cells are quoted and the object's own quotes are doubled, so a
        // CSV reader sees exactly two fields rather than four.
        assert_eq!(row, r#""a","{""env"":""prod"",""team"":""sec""}""#);
    }

    #[test]
    fn render_csv_aligns_later_rows_to_the_first_rows_headers() {
        let items = vec![
            json!({"a": "1", "b": "2"}),
            json!({"b": "3", "a": "4"}),
            // missing key -> empty cell; extra key -> dropped
            json!({"a": "5", "c": "ignored"}),
        ];
        let csv = render_csv(&items);
        assert_eq!(csv.lines().count(), 4);
        assert!(!csv.contains("ignored"), "extra columns are not emitted");
        let last = csv.lines().last().unwrap();
        assert!(last.contains("\"5\""));
        assert!(
            last.contains(","),
            "the missing column becomes an empty cell"
        );
    }

    #[test]
    fn render_csv_skips_non_object_rows() {
        let items = vec![json!({"a": "1"}), json!("scalar"), json!([1, 2])];
        let csv = render_csv(&items);
        assert_eq!(csv.lines().count(), 2, "only the header and the object row");
    }

    #[test]
    fn render_csv_returns_empty_when_the_first_row_is_not_an_object() {
        assert_eq!(render_csv(&[]), "");
        assert_eq!(render_csv(&[json!("scalar"), json!({"a": 1})]), "");
        assert_eq!(render_csv(&[json!(null)]), "");
    }

    #[test]
    fn render_csv_handles_empty_objects() {
        let csv = render_csv(&[json!({})]);
        assert_eq!(csv, "\n\n", "no headers, one empty row");
    }

    // ── Format dispatch ──

    #[test]
    fn render_export_rejects_unknown_formats() {
        for format in ["xml", "JSON", "CSV", "", "yaml", "json "] {
            assert!(
                render_export(&[json!({"a": 1})], format).is_err(),
                "{format} should be rejected"
            );
        }
    }

    #[test]
    fn render_export_json_is_pretty_and_round_trips() {
        let items = vec![json!({"name": "a"}), json!({"name": "b"})];
        let out = render_export(&items, "json").unwrap();
        assert!(out.contains('\n'), "json export should be pretty-printed");
        let parsed: Vec<serde_json::Value> = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed, items);
    }

    #[test]
    fn render_export_json_of_empty_input() {
        assert_eq!(render_export(&[], "json").unwrap(), "[]");
    }

    // ── Command-level behaviour ──

    // ── Export file writing ──

    fn tempdir() -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("azvault-export-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn export_file_names_must_be_plain_leaf_names() {
        for good in [
            "azvault-secrets-1700000000.json",
            "azvault-secrets-1700000000.csv",
            "my_export.json",
        ] {
            assert_eq!(
                validate_export_file_name(good).unwrap(),
                good,
                "name={good}"
            );
        }

        for bad in [
            "",
            "   ",
            "../escape.json",
            "nested/dir.json",
            "/absolute.json",
            "..\\windows.json",
            ".hidden.json",
            "no-extension",
            "wrong.exe",
            "wrong.sh",
            "semi;colon.json",
            "space in name.json",
        ] {
            assert!(
                validate_export_file_name(bad).is_err(),
                "expected {bad:?} to be rejected"
            );
        }
    }

    #[test]
    fn export_file_name_length_is_bounded() {
        let long = format!("{}.json", "a".repeat(200));
        assert!(validate_export_file_name(&long).is_err());
    }

    #[test]
    fn writing_an_export_returns_the_path_it_actually_wrote() {
        let dir = tempdir();
        let path = write_export_file(&dir, "azvault-secrets.json", "[{\"name\":\"a\"}]").unwrap();
        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "[{\"name\":\"a\"}]"
        );
        assert!(path.ends_with("azvault-secrets.json"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_second_export_does_not_overwrite_the_first() {
        let dir = tempdir();
        let first = write_export_file(&dir, "export.csv", "one").unwrap();
        let second = write_export_file(&dir, "export.csv", "two").unwrap();

        assert_ne!(first, second);
        assert_eq!(std::fs::read_to_string(&first).unwrap(), "one");
        assert_eq!(std::fs::read_to_string(&second).unwrap(), "two");
        assert!(second.ends_with("export-1.csv"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_exhausted_suffix_range_errors_instead_of_overwriting() {
        let dir = tempdir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("export.csv"), "original").unwrap();
        for index in 1..MAX_EXPORT_SUFFIX {
            std::fs::write(dir.join(format!("export-{index}.csv")), "taken").unwrap();
        }

        let error = unique_export_path(&dir, "export.csv").unwrap_err();
        assert!(error.contains("Too many exports"), "{error}");

        // The pre-existing file must still be there, untouched.
        let error = write_export_file(&dir, "export.csv", "clobber").unwrap_err();
        assert!(!error.is_empty());
        assert_eq!(
            std::fs::read_to_string(dir.join("export.csv")).unwrap(),
            "original"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[cfg(unix)]
    #[test]
    fn exports_are_written_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempdir();
        let path = write_export_file(&dir, "export.json", "[]").unwrap();
        let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;

        assert_eq!(
            mode, 0o600,
            "an export in ~/Downloads must not be readable by other accounts"
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn export_items_end_to_end_json() {
        let out = export_items(r#"[{"name":"secret-1"}]"#.to_string(), "json".to_string())
            .await
            .unwrap();
        assert!(out.contains("secret-1"));
    }

    #[tokio::test]
    async fn export_items_end_to_end_csv() {
        let out = export_items(
            r#"[{"name":"n1","enabled":true},{"name":"n2","enabled":false}]"#.to_string(),
            "csv".to_string(),
        )
        .await
        .unwrap();
        assert_eq!(out.lines().count(), 3);
        assert!(out.contains("\"n1\""));
        assert!(out.contains("\"n2\""));
    }

    #[tokio::test]
    async fn export_items_error_paths() {
        let cases = [
            ("not json", "json", "Invalid JSON"),
            (r#"{"a":1}"#, "json", "Invalid JSON"),
            (r#"[{"a":1}]"#, "xml", "Unsupported"),
        ];
        for (payload, format, needle) in cases {
            let err = export_items(payload.to_string(), format.to_string())
                .await
                .unwrap_err();
            assert!(err.contains(needle), "payload={payload} err={err}");
        }
    }

    #[tokio::test]
    async fn export_items_rejects_oversized_payload() {
        let err = export_items("a".repeat(MAX_EXPORT_INPUT_BYTES + 10), "json".to_string())
            .await
            .unwrap_err();
        assert!(err.contains("too large"));
    }

    #[test]
    fn the_secret_metadata_model_has_no_value_field_to_export() {
        // This is a property of the *model*, not of the exporter: a
        // `SecretItem` cannot carry a value, so the list the UI holds has
        // nothing to leak. Named for what it proves.
        let items = vec![SecretItem {
            id: "https://v.vault.azure.net/secrets/db".to_string(),
            name: "db".to_string(),
            enabled: true,
            created: None,
            updated: None,
            expires: None,
            not_before: None,
            content_type: None,
            tags: None,
            managed: None,
        }];
        let serialised = serde_json::to_string(&items).unwrap();
        assert!(!serialised.contains("\"value\""), "{serialised}");
    }

    #[tokio::test]
    async fn export_items_is_a_passthrough_and_sanitises_nothing() {
        // KNOWN GAP, documented rather than wished away: `export_items` takes
        // untyped JSON and renders it verbatim, so a `value` field handed to it
        // is written straight into the export in both formats. Nothing in the
        // backend strips it -- the "only metadata is exported" guarantee rests
        // entirely on the caller passing metadata. Do not read this test as an
        // endorsement: it exists so the day the exporter starts filtering, this
        // test fails and gets replaced by one asserting the value is dropped.
        let payload = r#"[{"name":"a","value":"hunter2"}]"#.to_string();

        let json_out = export_items(payload.clone(), "json".to_string())
            .await
            .unwrap();
        assert!(
            json_out.contains("hunter2"),
            "unexpected sanitisation -- tighten this test to assert the value is dropped: {json_out}"
        );

        let csv_out = export_items(payload, "csv".to_string()).await.unwrap();
        assert!(csv_out.contains("hunter2"), "{csv_out}");
        assert!(csv_out.lines().next().unwrap().contains("value"));
    }

    // ── Output size cap and the on-disk write ──

    #[test]
    fn a_maximum_sized_export_still_fits_under_the_output_cap() {
        // The two limits have to be calibrated against each other: a full
        // vault's worth of rows that `export_items` happily renders must still
        // be saveable, or the user hits "Export is too large to save." on a
        // perfectly legitimate export.
        let items: Vec<serde_json::Value> = (0..MAX_EXPORT_ITEMS)
            .map(|index| {
                json!({
                    "id": format!("https://demo.vault.azure.net/secrets/item-{index}"),
                    "name": format!("item-{index}"),
                    "enabled": true,
                    "created": "2026-01-01T00:00:00Z",
                    "updated": "2026-01-01T00:00:00Z",
                })
            })
            .collect();

        let rendered = render_export(&items, "json").unwrap();
        assert!(
            rendered.len() <= MAX_EXPORT_OUTPUT_BYTES,
            "{MAX_EXPORT_ITEMS} rows render to {} bytes, over the {MAX_EXPORT_OUTPUT_BYTES} byte save cap",
            rendered.len()
        );
    }

    #[test]
    fn an_export_at_the_output_cap_lands_on_disk_intact() {
        // The cap is a policy decision in `save_export`, not an I/O limit:
        // everything up to it must actually be writable.
        let dir = tempdir();
        let contents = "a".repeat(MAX_EXPORT_OUTPUT_BYTES);
        let path = write_export_file(&dir, "big.json", &contents).unwrap();

        assert_eq!(
            std::fs::metadata(&path).unwrap().len() as usize,
            MAX_EXPORT_OUTPUT_BYTES
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn the_save_directory_is_created_when_it_does_not_exist_yet() {
        // `save_export` falls back from `download_dir()` to `home_dir()`, and
        // neither is guaranteed to exist (a fresh container has no ~/Downloads).
        let dir = std::env::temp_dir()
            .join(format!("azvault-export-missing-{}", uuid::Uuid::new_v4()))
            .join("Downloads");
        assert!(!dir.exists());

        let path = write_export_file(&dir, "export.json", "[]").unwrap();
        assert!(std::path::Path::new(&path).exists());

        let _ = std::fs::remove_dir_all(dir.parent().unwrap());
    }

    #[test]
    fn a_save_directory_that_cannot_be_created_is_reported_not_ignored() {
        // A regular file where the directory should be. Reporting success here
        // would tell the user their export was saved when nothing was written.
        let root = tempdir();
        let blocked = root.join("not-a-dir");
        std::fs::write(&blocked, b"x").unwrap();

        let error = write_export_file(&blocked, "export.json", "[]").unwrap_err();
        assert_eq!(error, "Could not create the export directory.");

        let _ = std::fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod command_tests {
    use super::*;

    /// A real `AppState` backed by a throwaway audit directory.
    ///
    /// No Tauri runtime is involved, so these tests exercise the actual
    /// command bodies: validation, audit side effects and error mapping.
    struct TestApp {
        state: AppState,
        dir: std::path::PathBuf,
    }

    impl TestApp {
        fn new() -> Self {
            let dir = std::env::temp_dir()
                .join(format!("azvault-commands-test-{}", uuid::Uuid::new_v4()));
            let state = AppState {
                auth: AuthManager::new(),
                azure: AzureClient::new(),
                audit: AuditLogger::new(dir.clone()),
            };
            Self { state, dir }
        }

        async fn audit(&self) -> Vec<AuditEntry> {
            self.state.audit.get_entries(Some(usize::MAX), None).await
        }
    }

    impl Drop for TestApp {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    /// A URI that is syntactically fine but not an Azure Key Vault host, so
    /// every command rejects it before any token or network access.
    const BLOCKED_URI: &str = "https://evil.example.com";

    // ── Validation short-circuits (no CLI, no network) ──

    #[tokio::test]
    async fn vault_commands_reject_non_azure_uris_without_auditing() {
        let app = TestApp::new();
        let s = &app.state;

        let expected = "Vault URI must target an Azure Key Vault endpoint.";
        assert_eq!(
            list_secrets_impl(s, BLOCKED_URI.to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            list_keys_impl(s, BLOCKED_URI.to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            list_certificates_impl(s, BLOCKED_URI.to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            get_secret_value_impl(s, BLOCKED_URI.to_string(), "n".to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            get_secret_metadata_impl(s, BLOCKED_URI.to_string(), "n".to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            delete_secret_impl(s, BLOCKED_URI.to_string(), "n".to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            recover_secret_impl(s, BLOCKED_URI.to_string(), "n".to_string())
                .await
                .unwrap_err(),
            expected
        );
        assert_eq!(
            purge_secret_impl(s, BLOCKED_URI.to_string(), "n".to_string())
                .await
                .unwrap_err(),
            expected
        );

        // A rejected request must not produce audit noise.
        assert!(app.audit().await.is_empty());
    }

    #[tokio::test]
    async fn http_vault_uri_is_rejected_by_every_vault_command() {
        let app = TestApp::new();
        let uri = "http://demo.vault.azure.net".to_string();
        assert_eq!(
            list_secrets_impl(&app.state, uri.clone())
                .await
                .unwrap_err(),
            "Vault URI must use HTTPS."
        );
        assert_eq!(
            delete_secret_impl(&app.state, uri, "n".to_string())
                .await
                .unwrap_err(),
            "Vault URI must use HTTPS."
        );
        assert!(app.audit().await.is_empty());
    }

    #[tokio::test]
    async fn item_name_is_validated_before_any_token_request() {
        let app = TestApp::new();
        let uri = "https://demo.vault.azure.net".to_string();

        for name in ["", "bad name", "bad_name", "../escape", &"a".repeat(128)] {
            let err = get_secret_value_impl(&app.state, uri.clone(), name.to_string())
                .await
                .unwrap_err();
            assert!(
                err.contains("Item name"),
                "name={name:?} produced {err} instead of a name validation error"
            );
        }
        assert!(app.audit().await.is_empty());
    }

    #[tokio::test]
    async fn set_secret_validates_uri_then_name_then_value() {
        let app = TestApp::new();

        fn request(name: &str, value: &str) -> CreateSecretRequest {
            CreateSecretRequest {
                name: name.to_string(),
                value: value.to_string(),
                content_type: None,
                tags: None,
                enabled: None,
                expires: None,
                not_before: None,
            }
        }

        // bad URI wins over a bad name
        let err = set_secret_impl(
            &app.state,
            BLOCKED_URI.to_string(),
            request("bad name", "v"),
        )
        .await
        .unwrap_err();
        assert!(err.contains("Vault URI"), "{err}");

        let uri = "https://demo.vault.azure.net".to_string();

        // bad name wins over a bad value
        let err = set_secret_impl(&app.state, uri.clone(), request("bad name", ""))
            .await
            .unwrap_err();
        assert!(err.contains("Item name"), "{err}");

        // empty and oversized values are rejected
        for value in ["".to_string(), "a".repeat(25_001)] {
            let err = set_secret_impl(&app.state, uri.clone(), request("ok-name", &value))
                .await
                .unwrap_err();
            assert_eq!(err, "Secret value must be between 1 and 25,000 characters.");
        }

        assert!(app.audit().await.is_empty(), "rejections are not audited");
    }

    #[tokio::test]
    async fn set_secret_rejection_never_echoes_the_secret_value() {
        let app = TestApp::new();
        // A value that is itself invalid, so the value validator -- the one
        // stage that does look at it -- is what produces the message.
        let req = CreateSecretRequest {
            name: "ok-name".to_string(),
            value: "SUPER-SECRET-VALUE".repeat(2_000),
            content_type: None,
            tags: None,
            enabled: None,
            expires: None,
            not_before: None,
        };
        let err = set_secret_impl(&app.state, "https://demo.vault.azure.net".to_string(), req)
            .await
            .unwrap_err();
        assert_eq!(err, "Secret value must be between 1 and 25,000 characters.");

        let export = export_audit_log_impl(&app.state, None).await.unwrap();
        assert!(!export.contains("SUPER-SECRET-VALUE"), "{export}");
    }

    // ── Auth commands ──

    #[tokio::test]
    async fn set_tenant_command_sanitises_input() {
        let app = TestApp::new();
        set_tenant_impl(&app.state, "abc; rm -rf /".to_string())
            .await
            .unwrap();
        // Hostile input is rejected rather than reshaped into another tenant.
        assert_eq!(app.state.auth.get_tenant().await, "organizations");
    }

    #[tokio::test]
    async fn sign_out_resets_tenant_and_writes_one_audit_entry() {
        let app = TestApp::new();
        set_tenant_impl(&app.state, "abcd-1234".to_string())
            .await
            .unwrap();

        auth_sign_out_impl(&app.state).await.unwrap();

        assert_eq!(app.state.auth.get_tenant().await, "organizations");
        let entries = app.audit().await;
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "sign_out");
        assert_eq!(entries[0].vault_name, "system");
        assert_eq!(entries[0].item_type, "auth");
        assert_eq!(entries[0].result, "success");
        assert!(entries[0].details.is_none());
    }

    #[tokio::test]
    async fn list_keyvaults_rejects_a_non_guid_subscription_without_auditing() {
        let app = TestApp::new();
        let err = list_keyvaults_impl(&app.state, "'; DROP TABLE --".to_string())
            .await
            .unwrap_err();
        assert_eq!(err, "Subscription ID must be a GUID.");
        assert!(
            app.audit().await.is_empty(),
            "a rejected call must not reach the audit log"
        );
    }

    // ── Audit commands ──

    #[tokio::test]
    async fn write_and_read_audit_log_round_trip() {
        let app = TestApp::new();
        app.state
            .audit
            .log_action(
                "vault-a",
                "custom_action",
                "note",
                "item-1",
                "success",
                Some("all good"),
            )
            .await;

        let entries = get_audit_log_impl(&app.state, None, None).await.unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "custom_action");
        assert_eq!(entries[0].details.as_deref(), Some("all good"));

        // A repeat read is stable and side-effect free.
        let again = get_audit_log_impl(&app.state, None, None).await.unwrap();
        assert_eq!(again.len(), entries.len());
        assert_eq!(again[0].action, entries[0].action);
    }

    #[test]
    fn no_ipc_command_can_write_arbitrary_audit_entries() {
        // `write_audit_log` was removed: it let any caller persist unbounded,
        // caller-controlled `details` under a benign `action`. The frontend
        // never used it. This pins that it does not come back unnoticed.
        assert!(
            !include_str!("../lib.rs").contains("write_audit_log"),
            "a removed command must not stay registered in the IPC handler"
        );
    }

    #[test]
    fn the_duplicate_audit_read_command_is_gone() {
        // `read_audit_log` was a pure alias for `get_audit_log`. The frontend
        // only ever called `get_audit_log`, and two IPC entry points onto the
        // same data is two places to keep authorised.
        assert!(
            !include_str!("../lib.rs").contains("read_audit_log"),
            "the duplicate audit read command must not stay registered"
        );
    }

    #[tokio::test]
    async fn get_audit_log_respects_limit_and_vault_filter() {
        let app = TestApp::new();
        for (vault, item) in [("a", "1"), ("b", "2"), ("a", "3")] {
            app.state
                .audit
                .log_action(vault, "note", "note", item, "success", None)
                .await;
        }

        assert_eq!(
            get_audit_log_impl(&app.state, None, None)
                .await
                .unwrap()
                .len(),
            3
        );
        assert_eq!(
            get_audit_log_impl(&app.state, Some(1), None)
                .await
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            get_audit_log_impl(&app.state, None, Some("a".to_string()))
                .await
                .unwrap()
                .len(),
            2
        );
        assert!(get_audit_log_impl(&app.state, None, Some("zz".to_string()))
            .await
            .unwrap()
            .is_empty());
    }

    #[tokio::test]
    async fn export_audit_log_is_sanitised_json() {
        let app = TestApp::new();
        app.state
            .audit
            .log_action(
                "v",
                "get_secret_value",
                "secret",
                "db",
                "success",
                Some("plain note"),
            )
            .await;

        let export = export_audit_log_impl(&app.state, None).await.unwrap();
        let parsed: Vec<AuditEntry> = serde_json::from_str(&export).unwrap();
        assert_eq!(parsed[0].details.as_deref(), Some("[REDACTED]"));
        assert!(!export.contains("plain note"));
    }

    #[tokio::test]
    async fn export_audit_log_of_an_empty_log_is_an_empty_array() {
        let app = TestApp::new();
        assert_eq!(export_audit_log_impl(&app.state, None).await.unwrap(), "[]");
    }

    #[tokio::test]
    async fn clear_audit_log_scoped_and_global() {
        let app = TestApp::new();
        for vault in ["a", "b"] {
            app.state
                .audit
                .log_action(vault, "note", "note", "i", "success", None)
                .await;
        }

        clear_audit_log_impl(&app.state, Some("a".to_string()))
            .await
            .unwrap();
        assert_eq!(app.audit().await.len(), 1);

        clear_audit_log_impl(&app.state, None).await.unwrap();
        assert!(app.audit().await.is_empty());
    }

    #[tokio::test]
    async fn audit_log_never_persists_a_secret_value_end_to_end() {
        let app = TestApp::new();

        // `set_secret` is caught by the action check on export; `note` is not,
        // so it is the detail scanner alone that has to stop the second one.
        // Both are asserted, otherwise this test would pass on a scanner that
        // does nothing at all.
        for action in ["set_secret", "note"] {
            app.state
                .audit
                .log_action(
                    "v",
                    action,
                    "secret",
                    "db-conn",
                    "success",
                    Some("value=CORRECT-HORSE-BATTERY"),
                )
                .await;
        }
        auth_sign_out_impl(&app.state).await.unwrap();
        app.state.audit.flush().await;

        let on_disk =
            std::fs::read_to_string(app.dir.join("audit_logs").join("audit.json")).unwrap();
        assert!(!on_disk.contains("CORRECT-HORSE-BATTERY"), "{on_disk}");

        let export = export_audit_log_impl(&app.state, None).await.unwrap();
        assert!(!export.contains("CORRECT-HORSE-BATTERY"), "{export}");

        // and the benign action really did make it into the log
        assert_eq!(app.audit().await.len(), 3);
    }
}

#[cfg(test)]
mod audit_write_redaction_tests {
    use super::*;

    fn app() -> (AppState, std::path::PathBuf) {
        let dir =
            std::env::temp_dir().join(format!("azvault-redaction-test-{}", uuid::Uuid::new_v4()));
        let state = AppState {
            auth: AuthManager::new(),
            azure: AzureClient::new(),
            audit: AuditLogger::new(dir.clone()),
        };
        (state, dir)
    }

    #[tokio::test]
    async fn sensitive_actions_always_store_the_redaction_marker() {
        let (state, dir) = app();
        for action in [
            "set_secret",
            "get_secret_value",
            "refresh_token",
            "read_value",
        ] {
            state
                .audit
                .log_action(
                    "v",
                    action,
                    "secret",
                    "i",
                    "success",
                    Some("value=LEAKED-MATERIAL"),
                )
                .await;
        }

        for entry in state.audit.get_entries(None, None).await {
            assert_eq!(entry.details.as_deref(), Some("[REDACTED]"), "{entry:?}");
        }
        state.audit.flush().await;
        let on_disk = std::fs::read_to_string(dir.join("audit_logs").join("audit.json")).unwrap();
        assert!(!on_disk.contains("LEAKED-MATERIAL"), "{on_disk}");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn benign_actions_keep_their_details() {
        let (state, dir) = app();
        state
            .audit
            .log_action("v", "list_keys", "key", "i", "success", Some("found 7"))
            .await;

        assert_eq!(
            state.audit.get_entries(None, None).await[0]
                .details
                .as_deref(),
            Some("found 7")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn benign_actions_still_go_through_keyword_redaction() {
        let (state, dir) = app();
        state
            .audit
            .log_action(
                "v",
                "list_keys",
                "key",
                "i",
                "success",
                Some("Authorization: Bearer eyJabc"),
            )
            .await;

        assert_eq!(
            state.audit.get_entries(None, None).await[0]
                .details
                .as_deref(),
            Some("[REDACTED]")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
