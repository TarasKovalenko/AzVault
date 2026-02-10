use crate::audit::AuditLogger;
use crate::auth::AuthManager;
use crate::azure::AzureClient;
use crate::models::*;
use tauri::State;

pub struct AppState {
    pub auth: AuthManager,
    pub azure: AzureClient,
    pub audit: AuditLogger,
}

// ─── Auth Commands ───

#[tauri::command]
pub async fn auth_start(state: State<'_, AppState>) -> Result<DeviceCodeResponse, String> {
    state.auth.start_device_code_flow().await
}

#[tauri::command]
pub async fn auth_poll(state: State<'_, AppState>, device_code: String) -> Result<bool, String> {
    match state.auth.poll_device_code(&device_code).await {
        Ok(_) => {
            state
                .audit
                .log_action("system", "sign_in", "auth", "user", "success", None)
                .await;
            Ok(true)
        }
        Err(e) if e == "authorization_pending" || e == "slow_down" => Ok(false),
        Err(e) => Err(e),
    }
}

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
    let result = state
        .azure
        .list_keyvaults(&token, &subscription_id)
        .await;

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
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state.azure.get_secret_value(&token, &vault_uri, &name).await;

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
    let token = state.auth.get_vault_token().await?;
    let vault_name = extract_vault_name(&vault_uri);

    let result = state.azure.get_secret_metadata(&token, &vault_uri, &name).await;

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
pub async fn export_items(
    items_json: String,
    format: String,
) -> Result<String, String> {
    let items: Vec<serde_json::Value> =
        serde_json::from_str(&items_json).map_err(|e| format!("Invalid JSON: {}", e))?;

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
                    csv.push_str(&headers.iter().map(|h| h.as_str()).collect::<Vec<_>>().join(","));
                    csv.push('\n');

                    for item in &items {
                        if let Some(obj) = item.as_object() {
                            let row: Vec<String> = headers
                                .iter()
                                .map(|h| {
                                    let val = obj.get(*h).cloned().unwrap_or(serde_json::Value::Null);
                                    match val {
                                        serde_json::Value::String(s) => format!("\"{}\"", s.replace('"', "\"\"")),
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
