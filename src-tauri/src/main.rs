#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_services;
mod backend;
mod bambu_live;
mod catalog_commands;
mod companion_api;
mod companion_assets;
mod companion_error;
mod companion_http;
mod companion_models;
mod companion_payload;
mod companion_session;
mod companion_state;
mod inventory_commands;
mod library_sync_commands;
mod printer_commands;
mod security;
mod state;
mod trusted_lan_commands;

use backend::filament_database::{BackupValidationStats, FilamentDatabase, ImportDataStats};
use backend::inventory_engine::InventoryEngine;
use backend::statistics::StatisticsEngine;
use base64::Engine;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use serde::Serialize;
use state::AppState;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::fs::File;
use std::io::Write;
use std::path::Path;
use std::path::PathBuf;
use tauri::Manager;

#[cfg(target_os = "macos")]
const DOCK_ICON_LIGHT_BYTES: &[u8] = include_bytes!("../icons/dock-light.png");
#[cfg(target_os = "macos")]
const DOCK_ICON_DARK_BYTES: &[u8] = include_bytes!("../icons/dock-dark.png");
#[derive(Serialize)]
struct ExportPayload {
    content: String,
}

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

#[tauri::command]
fn export_inventory_csv(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_csv())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn export_inventory_json(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_spools_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn export_full_backup_json(state: tauri::State<'_, AppState>) -> Result<ExportPayload, String> {
    let content = with_db(&state, |db| db.export_full_backup_json())?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn import_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<(), String> {
    with_db(&state, |db| db.import_full_backup_json(&content))
}

#[tauri::command]
fn import_data_file(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<ImportDataStats, String> {
    with_db(&state, |db| db.import_data_content(&content))
}

#[tauri::command]
fn validate_full_backup_json(
    state: tauri::State<'_, AppState>,
    content: String,
) -> Result<BackupValidationStats, String> {
    with_db(&state, |db| db.validate_full_backup_json(&content))
}

#[tauri::command]
fn print_label_html(
    app: tauri::AppHandle,
    html: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let path = write_label_to_disk(&app, &html)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
}

#[tauri::command]
fn print_label_pdf(
    app: tauri::AppHandle,
    pdf_base64: String,
    printer_name: Option<String>,
    copies: Option<u32>,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(pdf_base64.trim())
        .map_err(|error| format!("Invalid PDF payload: {error}"))?;
    let path = write_pdf_to_disk(&app, &bytes)?;
    let _ = printer_name;
    let _ = copies;

    open_generated_document(&path)?;
    Ok(())
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
            library_sync_commands::get_library_sync_settings,
            library_sync_commands::save_library_sync_settings,
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
            library_sync_commands::clear_library_sync_client_auth,
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
            export_inventory_csv,
            export_inventory_json,
            export_full_backup_json,
            import_full_backup_json,
            import_data_file,
            validate_full_backup_json,
            inventory_commands::inventory_overview,
            inventory_commands::reset_app_data,
            inventory_commands::reset_catalog_data,
            inventory_commands::top_materials,
            inventory_commands::list_filament_consumption,
            inventory_commands::check_low_stock,
            inventory_commands::enqueue_sync_action,
            print_label_html,
            print_label_pdf,
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

fn write_label_to_disk(app: &tauri::AppHandle, html: &str) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.html", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, html.as_bytes())?;
    Ok(path)
}

fn write_pdf_to_disk(app: &tauri::AppHandle, bytes: &[u8]) -> Result<PathBuf, String> {
    let app_dir = resolve_app_storage_dir_for_handle(app)?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.pdf", chrono_id());
    let path = label_dir.join(filename);
    write_generated_file(&path, bytes)?;
    Ok(path)
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

fn resolve_app_storage_dir_for_handle(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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

fn write_generated_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = path.with_extension(format!("{}.tmp", chrono_id()));
    let mut file = File::create(&temp_path).map_err(|error| error.to_string())?;
    file.write_all(contents)
        .map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    std::fs::rename(&temp_path, path).map_err(|error| error.to_string())?;
    Ok(())
}

fn open_generated_document(path: &Path) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        open::that(path).map_err(|error| {
            format!("Failed to open generated file in the default Windows handler: {error}")
        })?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(path).map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn chrono_id() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    nanos.to_string()
}

pub(crate) fn with_inventory<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(InventoryEngine) -> backend::filament_database::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    let engine = InventoryEngine::new(db);
    func(engine).map_err(|error| format!("{:?}", error))
}

pub(crate) fn with_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(&FilamentDatabase) -> backend::filament_database::InventoryResult<Output>,
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
mod tests {
    use super::{chrono_id, write_generated_file};
    use crate::backend::filament_database::{FilamentDatabase, TrustedLanSettingsRow};
    use crate::trusted_lan_commands::load_trusted_lan_runtime;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-main-{test_name}-{nanos}.db"))
    }

    #[test]
    fn trusted_lan_runtime_keeps_enabled_state_from_settings() {
        let db_path = temp_db_path("trusted-lan-dark-startup");
        let result = (|| -> Result<(), String> {
            {
                let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
                db.apply_schema().map_err(|error| error.to_string())?;
                db.save_trusted_lan_settings(&TrustedLanSettingsRow {
                    enabled: true,
                    selected_interface_name: Some("Wi-Fi".to_string()),
                    selected_interface_address: Some("192.168.1.50".to_string()),
                    listen_port: 4278,
                })
                .map_err(|error| error.to_string())?;
            }

            let runtime = load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
            let snapshot = runtime.snapshot();
            assert!(snapshot.enabled);
            assert_eq!(snapshot.selected_interface_name.as_deref(), Some("Wi-Fi"));
            assert_eq!(
                snapshot.selected_interface_address.as_deref(),
                Some("192.168.1.50")
            );
            assert_eq!(snapshot.listen_port, 4278);
            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[test]
    fn generated_file_write_persists_contents() {
        let path = std::env::temp_dir().join(format!("filament-manager-write-{}.txt", chrono_id()));
        let result = (|| -> Result<(), String> {
            write_generated_file(&path, b"hello windows rc")?;
            let contents = std::fs::read_to_string(&path).map_err(|error| error.to_string())?;
            assert_eq!(contents, "hello windows rc");
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(error) = result {
            panic!("{error}");
        }
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_storage_prefers_existing_db_location() {
        use super::resolve_windows_storage_dir;

        let base =
            std::env::temp_dir().join(format!("filament-manager-windows-storage-{}", chrono_id()));
        let roaming_dir = base.join("roaming");
        let local_dir = base.join("local");
        let result = (|| -> Result<(), String> {
            std::fs::create_dir_all(&roaming_dir).map_err(|error| error.to_string())?;
            std::fs::create_dir_all(&local_dir).map_err(|error| error.to_string())?;

            let selected_without_db =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_without_db, local_dir);

            std::fs::write(roaming_dir.join("bambu.db"), b"roaming-db")
                .map_err(|error| error.to_string())?;
            let selected_with_roaming =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_with_roaming, roaming_dir);

            std::fs::write(local_dir.join("bambu.db"), b"local-db")
                .map_err(|error| error.to_string())?;
            let selected_with_local =
                resolve_windows_storage_dir(roaming_dir.clone(), local_dir.clone());
            assert_eq!(selected_with_local, local_dir);

            Ok(())
        })();

        let _ = std::fs::remove_dir_all(&base);
        if let Err(error) = result {
            panic!("{error}");
        }
    }
}
