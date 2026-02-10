use crate::audit::AuditLogger;
use crate::auth::AuthManager;
use crate::azure::AzureClient;
use crate::models::*;
use tauri::State;
use url::Url;

pub struct AppState {
    pub auth: AuthManager,
    pub azure: AzureClient,
    pub audit: AuditLogger,
}

const MAX_EXPORT_INPUT_BYTES: usize = 2_000_000;
const MAX_EXPORT_ITEMS: usize = 20_000;
const MAX_AUDIT_FIELD_LEN: usize = 512;

// ─── Auth Commands ───

#[tauri::command]
pub async fn auth_status(state: State<'_, AppState>) -> Result<AuthState, String> {
    let signed_in = state.auth.is_signed_in().await;
    Ok(AuthState {
        signed_in,
        user_name: None, // Could decode JWT to get user info
        tenant_id: if signed_in {
            Some(state.auth.get_tenant().await)
        } else {
            None
        },
    })
}

#[tauri::command]
pub async fn auth_sign_out(state: State<'_, AppState>) -> Result<(), String> {
    state.auth.sign_out().await;
    state
        .audit
        .log_action("system", "sign_out", "auth", "user", "success", None)
        .await;
    Ok(())
}

#[tauri::command]
pub async fn set_tenant(state: State<'_, AppState>, tenant_id: String) -> Result<(), String> {
    state.auth.set_tenant(&tenant_id).await;
    Ok(())
}

// ─── Resource Commands ───

#[tauri::command]
pub async fn list_tenants(state: State<'_, AppState>) -> Result<Vec<Tenant>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_tenants(&token).await
}

#[tauri::command]
pub async fn list_subscriptions(state: State<'_, AppState>) -> Result<Vec<Subscription>, String> {
    let token = state.auth.get_management_token().await?;
    state.azure.list_subscriptions(&token).await
}

#[tauri::command]
pub async fn list_keyvaults(
    state: State<'_, AppState>,
    subscription_id: String,
) -> Result<Vec<KeyVaultInfo>, String> {
    let token = state.auth.get_management_token().await?;
    let result = state.azure.list_keyvaults(&token, &subscription_id).await;

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

// ─── Vault Item Commands ───

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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

#[tauri::command]
pub async fn get_secret_value(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<SecretValue, String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&name)?;
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state
        .azure
        .get_secret_value(&token, &vault_uri, &name)
        .await;

    state
        .audit
        .log_action(
            &vault_name,
            "get_secret_value",
            "secret",
            &name,
            if result.is_ok() { "success" } else { "error" },
            Some("[value retrieved - REDACTED]"),
        )
        .await;

    result
}

#[tauri::command]
pub async fn get_secret_metadata(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<SecretItem, String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&name)?;
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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

#[tauri::command]
pub async fn set_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    request: CreateSecretRequest,
) -> Result<SecretItem, String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&request.name)?;
    if request.value.is_empty() || request.value.len() > 25_000 {
        return Err("Secret value must be between 1 and 25000 characters.".to_string());
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
            if result.is_ok() { "success" } else { "error" },
            Some("[value set - REDACTED]"),
        )
        .await;

    result
}

#[tauri::command]
pub async fn delete_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&name)?;
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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

#[tauri::command]
pub async fn recover_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&name)?;
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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

#[tauri::command]
pub async fn purge_secret(
    state: State<'_, AppState>,
    vault_uri: String,
    name: String,
) -> Result<(), String> {
    validate_vault_uri(&vault_uri)?;
    validate_secret_name(&name)?;
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
            if result.is_ok() { "success" } else { "error" },
            None,
        )
        .await;

    result
}

// ─── Audit Commands ───

#[tauri::command]
pub async fn get_audit_log(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    Ok(state.audit.get_entries(limit).await)
}

#[tauri::command]
pub async fn read_audit_log(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<AuditEntry>, String> {
    get_audit_log(state, limit).await
}

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

#[tauri::command]
pub async fn export_audit_log(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.audit.get_sanitized_export().await)
}

#[tauri::command]
pub async fn clear_audit_log(state: State<'_, AppState>) -> Result<(), String> {
    state.audit.clear().await;
    Ok(())
}

// ─── Export Commands ───

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

            // Headers from first item's keys
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
        _ => Err(format!("Unsupported format: {}", format)),
    }
}

// ─── Helpers ───

fn extract_vault_name(vault_uri: &str) -> String {
    vault_uri
        .trim_start_matches("https://")
        .split('.')
        .next()
        .unwrap_or("unknown")
        .to_string()
}

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

fn validate_secret_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 127 {
        return Err("Secret name must be between 1 and 127 characters.".to_string());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Secret name may only contain letters, numbers, and '-'.".to_string());
    }
    Ok(())
}

fn truncate_for_audit(value: String) -> String {
    value.chars().take(MAX_AUDIT_FIELD_LEN).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_azure_vault_uris() {
        assert!(validate_vault_uri("https://demo.vault.azure.net").is_ok());
        assert!(validate_vault_uri("https://demo.vault.usgovcloudapi.net").is_ok());
        assert!(validate_vault_uri("https://demo.vault.azure.cn").is_ok());
        assert!(validate_vault_uri("http://demo.vault.azure.net").is_err());
        assert!(validate_vault_uri("https://evil.example.com").is_err());
    }

    #[test]
    fn validates_secret_names() {
        assert!(validate_secret_name("valid-name-01").is_ok());
        assert!(validate_secret_name("").is_err());
        assert!(validate_secret_name("bad_name").is_err());
    }

    #[test]
    fn truncates_for_audit() {
        let long = "a".repeat(2048);
        let truncated = truncate_for_audit(long);
        assert_eq!(truncated.len(), MAX_AUDIT_FIELD_LEN);
    }

    #[test]
    fn extracts_vault_name_from_uri() {
        assert_eq!(
            extract_vault_name("https://my-vault.vault.azure.net"),
            "my-vault".to_string()
        );
    }

    #[tokio::test]
    async fn exports_items_as_csv() {
        let input = r#"[{"name":"n1","enabled":true},{"name":"n2","enabled":false}]"#.to_string();
        let out = export_items(input, "csv".to_string())
            .await
            .expect("csv export should succeed");
        assert!(out.lines().next().is_some());
        assert!(out.contains("\"n1\""));
        assert!(out.contains("\"n2\""));
    }

    #[tokio::test]
    async fn rejects_oversized_export_payload() {
        let huge = "a".repeat(MAX_EXPORT_INPUT_BYTES + 10);
        let err = export_items(huge, "json".to_string())
            .await
            .expect_err("should reject oversized payload");
        assert!(err.contains("too large"));
    }
}
