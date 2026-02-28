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
use tauri::{
    menu::{AboutMetadataBuilder, MenuBuilder, SubmenuBuilder},
    Manager, Runtime,
};

const APP_AUTHOR: &str = "Taras Kovalenko";
const APP_COPYRIGHT: &str = "Copyright © 2026 Taras Kovalenko";
const APP_DESCRIPTION: &str = "Azure Key Vault Explorer desktop app";

fn build_app_menu<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<tauri::menu::Menu<R>> {
    let handle = app.handle();
    let package_info = app.package_info();
    let app_name = package_info.name.clone();
    let about_metadata = AboutMetadataBuilder::new()
        .name(Some(app_name.clone()))
        .version(Some(package_info.version.to_string()))
        .authors(Some(vec![APP_AUTHOR.to_string()]))
        .comments(Some(APP_DESCRIPTION))
        .copyright(Some(APP_COPYRIGHT))
        .license(Some("MIT"))
        .credits(Some(format!("Created by {APP_AUTHOR}")))
        .build();

    let mut menu = MenuBuilder::new(handle);

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(handle, &app_name)
            .about(Some(about_metadata.clone()))
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .separator()
            .quit()
            .build()?;
        menu = menu.item(&app_menu);
    }

    let mut file_menu_builder = SubmenuBuilder::new(handle, "File").close_window();
    #[cfg(not(target_os = "macos"))]
    {
        file_menu_builder = file_menu_builder.separator().quit();
    }
    let file_menu = file_menu_builder.build()?;
    menu = menu.item(&file_menu);

    let edit_menu = SubmenuBuilder::new(handle, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;
    menu = menu.item(&edit_menu);

    let view_menu = SubmenuBuilder::new(handle, "View").fullscreen().build()?;
    menu = menu.item(&view_menu);

    let window_menu = SubmenuBuilder::new(handle, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;
    menu = menu.item(&window_menu);

    #[cfg(not(target_os = "macos"))]
    {
        let help_menu = SubmenuBuilder::new(handle, "Help")
            .about(Some(about_metadata))
            .build()?;
        menu = menu.item(&help_menu);
    }

    menu.build()
}

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
            app.set_menu(build_app_menu(app)?)?;

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
