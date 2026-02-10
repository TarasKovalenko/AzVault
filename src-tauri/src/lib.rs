mod audit;
mod auth;
mod azure;
mod commands;
mod models;

use commands::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Set up audit logger with app data dir
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            let state = AppState {
                auth: auth::AuthManager::new(),
                azure: azure::AzureClient::new(),
                audit: audit::AuditLogger::new(app_data_dir),
            };

            app.manage(state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth_status,
            commands::auth_sign_out,
            commands::set_tenant,
            commands::list_tenants,
            commands::list_subscriptions,
            commands::list_keyvaults,
            commands::list_secrets,
            commands::list_keys,
            commands::list_certificates,
            commands::get_secret_metadata,
            commands::get_secret_value,
            commands::set_secret,
            commands::delete_secret,
            commands::recover_secret,
            commands::purge_secret,
            commands::get_audit_log,
            commands::read_audit_log,
            commands::write_audit_log,
            commands::export_audit_log,
            commands::clear_audit_log,
            commands::export_items,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
