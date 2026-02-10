//! AzVault – Tauri backend library.
//!
//! This crate provides the Rust backend for the AzVault desktop application.
//! It manages Azure CLI authentication, Key Vault REST API access, and
//! local audit logging.

mod audit;
mod auth;
mod azure;
mod commands;
mod models;

use commands::AppState;
use tauri::Manager;

/// Initialises and runs the Tauri application.
///
/// Sets up plugins (store, logging), constructs the shared `AppState`
/// (auth manager, Azure client, audit logger), and registers all
/// IPC command handlers.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Enable structured logging in debug builds
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Resolve the app data directory for audit log persistence
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            // Build shared application state
            let state = AppState {
                auth: auth::AuthManager::new(),
                azure: azure::AzureClient::new(),
                audit: audit::AuditLogger::new(app_data_dir),
            };

            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Auth
            commands::auth_status,
            commands::auth_sign_out,
            commands::set_tenant,
            // Resource discovery
            commands::list_tenants,
            commands::list_subscriptions,
            commands::list_keyvaults,
            // Vault items
            commands::list_secrets,
            commands::list_keys,
            commands::list_certificates,
            commands::get_secret_metadata,
            commands::get_secret_value,
            commands::set_secret,
            commands::delete_secret,
            commands::recover_secret,
            commands::purge_secret,
            // Audit
            commands::get_audit_log,
            commands::read_audit_log,
            commands::write_audit_log,
            commands::export_audit_log,
            commands::clear_audit_log,
            // Export
            commands::export_items,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
