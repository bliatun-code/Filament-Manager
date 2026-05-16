#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_services;
mod backend;
mod bambu_live;
mod bambu_live_sync;
mod bambu_mqtt;
mod catalog_commands;
mod companion_api;
mod companion_assets;
mod companion_error;
mod companion_http;
mod companion_models;
mod companion_payload;
mod companion_session;
mod companion_state;
mod document_commands;
mod inventory_commands;
mod library_sync_command_support;
mod library_sync_commands;
mod library_sync_host_client;
mod library_sync_models;
mod library_sync_settings_commands;
mod printer_commands;
mod security;
mod state;
mod trusted_lan_commands;

use backend::filament_database::FilamentDatabase;
use backend::inventory_engine::InventoryEngine;
use backend::statistics::StatisticsEngine;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use state::AppState;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::path::PathBuf;
use tauri::Manager;

#[cfg(target_os = "macos")]
const DOCK_ICON_LIGHT_BYTES: &[u8] = include_bytes!("../icons/dock-light.png");
#[cfg(target_os = "macos")]
const DOCK_ICON_DARK_BYTES: &[u8] = include_bytes!("../icons/dock-dark.png");
#[tauri::command]
fn set_dock_icon_theme(app: tauri::AppHandle, theme: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let normalized = theme.trim().to_lowercase();
        let icon_bytes = if normalized == "dark" {
            DOCK_ICON_DARK_BYTES
        } else {
            DOCK_ICON_LIGHT_BYTES
        };
        apply_macos_dock_icon(&app, icon_bytes)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        let _ = theme;
        Ok(())
    }
}

#[tauri::command]
fn get_app_version(app: tauri::AppHandle) -> Result<String, String> {
    Ok(app.package_info().version.to_string())
}

#[cfg(target_os = "macos")]
fn apply_macos_dock_icon(app: &tauri::AppHandle, icon_bytes: &'static [u8]) -> Result<(), String> {
    let (sender, receiver) = std::sync::mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let result = (|| {
            let mtm = MainThreadMarker::new()
                .ok_or_else(|| "Dock icon update must run on main thread".to_string())?;
            let app_instance = NSApp(mtm);
            let icon_data = unsafe {
                NSData::dataWithBytes_length(icon_bytes.as_ptr().cast::<c_void>(), icon_bytes.len())
            };
            let image = NSImage::initWithData(NSImage::alloc(), &icon_data)
                .ok_or_else(|| "Failed to decode dock icon image".to_string())?;
            unsafe {
                app_instance.setApplicationIconImage(Some(&image));
            }
            Ok(())
        })();
        let _ = sender.send(result);
    })
    .map_err(|error| format!("Failed to schedule dock icon update: {error}"))?;
    receiver
        .recv()
        .map_err(|error| format!("Dock icon update did not complete: {error}"))?
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let db_path = ensure_db(app)?;
            let trusted_lan_runtime =
                trusted_lan_commands::load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
            let companion = state::CompanionRuntimeState::new(trusted_lan_runtime);
            let state = AppState {
                db_path: db_path.to_string_lossy().to_string(),
                companion,
            };
            app.manage(state.clone());

            let lan_state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = companion_api::reconcile_trusted_lan_server(lan_state).await {
                    eprintln!("Trusted-LAN companion failed: {error}");
                }
            });

            let bambu_live_state = app.state::<AppState>().inner().clone();
            tauri::async_runtime::spawn(async move {
                bambu_live::run_live_observer(bambu_live_state).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            inventory_commands::list_spools,
            inventory_commands::list_wishlist_items,
            printer_commands::get_printer_settings,
            printer_commands::list_printer_overview,
            trusted_lan_commands::get_trusted_lan_companion_status,
            trusted_lan_commands::list_trusted_lan_interfaces,
            trusted_lan_commands::update_trusted_lan_companion_config,
            trusted_lan_commands::create_trusted_lan_pairing,
            trusted_lan_commands::list_trusted_lan_paired_browsers,
            trusted_lan_commands::revoke_trusted_lan_paired_browser,
            trusted_lan_commands::revoke_all_trusted_lan_paired_browsers,
            inventory_commands::list_master_catalog,
            catalog_commands::refresh_bambu_catalog,
            catalog_commands::refresh_esun_catalog,
            catalog_commands::esun_search_filaments,
            catalog_commands::esun_fetch_product_detail,
            inventory_commands::create_spool,
            inventory_commands::create_wishlist_item,
            inventory_commands::create_manual_spool,
            printer_commands::create_printer,
            printer_commands::save_bambu_live_integration,
            printer_commands::delete_bambu_live_integration,
            printer_commands::delete_printer,
            printer_commands::set_active_printer,
            set_dock_icon_theme,
            get_app_version,
            library_sync_settings_commands::get_library_sync_settings,
            library_sync_settings_commands::save_library_sync_settings,
            library_sync_commands::validate_library_sync_host,
            library_sync_commands::fetch_library_sync_snapshot,
            library_sync_commands::fetch_library_sync_spool_detail,
            library_sync_commands::fetch_library_sync_spools,
            library_sync_commands::fetch_library_sync_catalog_masters,
            library_sync_commands::fetch_library_sync_wishlist_items,
            library_sync_commands::fetch_cached_library_sync_spools,
            library_sync_commands::fetch_library_sync_printer_overview,
            library_sync_commands::fetch_library_sync_printer_settings,
            library_sync_commands::fetch_cached_library_sync_printer_overview,
            library_sync_commands::fetch_library_sync_loans,
            library_sync_commands::fetch_library_sync_filament_consumption,
            library_sync_commands::fetch_cached_library_sync_loans,
            library_sync_commands::pair_library_sync_host,
            library_sync_settings_commands::clear_library_sync_client_auth,
            library_sync_commands::create_library_sync_host_spool,
            library_sync_commands::create_library_sync_host_wishlist_item,
            library_sync_commands::create_library_sync_host_printer,
            library_sync_commands::update_library_sync_host_wishlist_item_status,
            library_sync_commands::delete_library_sync_host_wishlist_item,
            library_sync_commands::delete_library_sync_host_spool,
            library_sync_commands::delete_library_sync_host_printer,
            library_sync_commands::purge_library_sync_host_spool,
            library_sync_commands::update_library_sync_host_spool_weight,
            library_sync_commands::update_library_sync_host_spool_tare_weight,
            library_sync_commands::update_library_sync_host_spool_details,
            library_sync_commands::update_library_sync_host_spool_rfid_tag,
            library_sync_commands::assign_library_sync_host_printer_slot,
            library_sync_commands::record_library_sync_host_print_usage,
            library_sync_commands::return_library_sync_host_loan,
            library_sync_commands::lend_library_sync_host_spool,
            printer_commands::assign_printer_slot,
            printer_commands::record_print_usage,
            inventory_commands::update_spool_weight,
            inventory_commands::update_spool_tare_weight,
            inventory_commands::update_spool_status,
            inventory_commands::update_spool_details,
            inventory_commands::update_spool_rfid_tag,
            inventory_commands::update_master_catalog_entry,
            inventory_commands::delete_spool,
            inventory_commands::purge_spool,
            inventory_commands::list_spool_history,
            inventory_commands::list_spool_usage,
            inventory_commands::list_active_spool_loans,
            inventory_commands::list_loan_usage_by_person,
            inventory_commands::list_spool_loans,
            inventory_commands::update_wishlist_item_status,
            inventory_commands::delete_wishlist_item,
            inventory_commands::lend_spool,
            inventory_commands::return_spool_loan,
            inventory_commands::return_inbound_spool_loan,
            inventory_commands::export_loans_csv,
            inventory_commands::assign_location,
            inventory_commands::find_spool_by_qr,
            inventory_commands::record_scan_event,
            document_commands::export_inventory_csv,
            document_commands::export_inventory_json,
            document_commands::export_full_backup_json,
            document_commands::import_full_backup_json,
            document_commands::import_data_file,
            document_commands::validate_full_backup_json,
            inventory_commands::inventory_overview,
            inventory_commands::reset_app_data,
            inventory_commands::reset_catalog_data,
            inventory_commands::top_materials,
            inventory_commands::list_filament_consumption,
            inventory_commands::check_low_stock,
            inventory_commands::enqueue_sync_action,
            document_commands::print_label_html,
            document_commands::print_label_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn ensure_db(app: &tauri::App) -> Result<PathBuf, String> {
    if let Ok(env_path) = std::env::var("BAMBU_DB_PATH") {
        let path = PathBuf::from(env_path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let db = FilamentDatabase::open(&path).map_err(|error| format!("DB open: {error:?}"))?;
        db.apply_schema()
            .map_err(|error| format!("DB schema: {error:?}"))?;
        return Ok(path);
    }

    let app_dir = resolve_app_storage_dir_for_app(app)?;
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    let db_path = app_dir.join("bambu.db");
    let db = FilamentDatabase::open(&db_path).map_err(|error| format!("DB open: {error:?}"))?;
    db.apply_schema()
        .map_err(|error| format!("DB schema: {error:?}"))?;
    Ok(db_path)
}

fn resolve_app_storage_dir_for_app(app: &tauri::App) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    #[cfg(target_os = "windows")]
    {
        let app_local_data_dir = app
            .path()
            .app_local_data_dir()
            .map_err(|error| error.to_string())?;
        Ok(resolve_windows_storage_dir(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(app_data_dir)
    }
}

#[cfg(target_os = "windows")]
fn resolve_windows_storage_dir(roaming_dir: PathBuf, local_dir: PathBuf) -> PathBuf {
    let roaming_db_path = roaming_dir.join("bambu.db");
    let local_db_path = local_dir.join("bambu.db");
    if local_db_path.exists() {
        return local_dir;
    }
    if roaming_db_path.exists() {
        return roaming_dir;
    }
    local_dir
}

pub(crate) fn with_inventory<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(InventoryEngine) -> backend::database_result::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    let engine = InventoryEngine::new(db);
    func(engine).map_err(|error| format!("{:?}", error))
}

pub(crate) fn with_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(&FilamentDatabase) -> backend::database_result::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    func(&db).map_err(|error| format!("{:?}", error))
}

pub(crate) fn with_stats<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(StatisticsEngine) -> Result<Output, rusqlite::Error>,
{
    let stats = StatisticsEngine::open(&state.db_path).map_err(|error| error.to_string())?;
    func(stats).map_err(|error| error.to_string())
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
