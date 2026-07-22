#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_error;
mod app_services;
mod backend;
mod bambu_live;
mod bambu_live_sync;
mod bambu_mqtt;
mod bambu_thermal;
mod catalog_commands;
mod companion_api;
mod companion_assets;
mod companion_error;
mod companion_http;
mod companion_models;
mod companion_payload;
mod companion_routes;
mod companion_session;
mod companion_state;
mod document_commands;
mod external_url_commands;
mod inventory_activity_commands;
mod inventory_command_support;
mod inventory_create_commands;
mod inventory_danger_zone_commands;
mod inventory_loan_commands;
mod inventory_maintenance_commands;
mod inventory_read_commands;
mod inventory_stats_commands;
mod inventory_update_commands;
mod inventory_wishlist_commands;
mod library_revision_commands;
mod library_sync_cache_commands;
mod library_sync_cache_refresh;
mod library_sync_command_support;
mod library_sync_danger_zone_commands;
mod library_sync_host_client;
mod library_sync_loan_write_commands;
mod library_sync_models;
mod library_sync_pairing_commands;
mod library_sync_printer_write_commands;
mod library_sync_read_commands;
mod library_sync_settings_commands;
mod library_sync_snapshot_commands;
mod library_sync_spool_write_commands;
mod library_sync_validation_commands;
mod library_sync_wishlist_write_commands;
mod optional_update;
mod printer_active_commands;
mod printer_bambu_live_commands;
mod printer_command_support;
mod printer_create_commands;
mod printer_danger_zone_commands;
mod printer_models;
mod printer_read_commands;
mod printer_settings_commands;
mod printer_slot_write_commands;
mod printer_usage_commands;
mod security;
mod sqlite_recovery;
mod state;
mod trusted_lan_browser_read_commands;
mod trusted_lan_browser_revoke_all_commands;
mod trusted_lan_browser_revoke_commands;
mod trusted_lan_config_commands;
mod trusted_lan_health;
mod trusted_lan_interface_commands;
mod trusted_lan_interfaces;
mod trusted_lan_pairing_commands;
mod trusted_lan_runtime_commands;
mod trusted_lan_status_commands;

use backend::database_tables::FULL_BACKUP_TABLES;
use backend::filament_database::FilamentDatabase;
use backend::inventory_engine::InventoryEngine;
use backend::statistics::StatisticsEngine;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(all(target_os = "macos", debug_assertions))]
use objc2_app_kit::NSWindow;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
#[cfg(any(target_os = "windows", test))]
use rusqlite::OptionalExtension;
use sqlite_recovery::{online_backup, RecoveryReason, RecoverySnapshot, SqliteWorkingCopy};
use state::AppState;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub(crate) const APP_DB_FILE_NAME: &str = "filament-manager.db";
pub(crate) const APP_DB_PATH_ENV_VAR: &str = "FILAMENT_MANAGER_DB_PATH";
#[cfg(debug_assertions)]
const VISUAL_QA_SCENARIO_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_SCENARIO";
#[cfg(debug_assertions)]
const VISUAL_QA_LOCALE_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_LOCALE";
#[cfg(debug_assertions)]
const VISUAL_QA_THEME_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_THEME";
#[cfg(all(debug_assertions, target_os = "macos"))]
const VISUAL_QA_WINDOW_SIZE_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_WINDOW_SIZE";
pub(crate) const LEGACY_APP_DB_FILE_NAME: &str = "bambu.db";
pub(crate) const LEGACY_APP_DATA_DIR_NAME: &str = "com.bambu.filament.manager";
pub(crate) const LEGACY_APP_DB_PATH_ENV_VAR: &str = "BAMBU_DB_PATH";
const AUTO_GENERATED_LIBRARY_ID_SETTING_KEY: &str = "library_sync_library_id";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY: &str = "windows_split_brain_merge_v1";
#[cfg(any(target_os = "windows", test))]
const WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE: &str = "complete";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DatabaseUserDataState {
    DomainData,
    AncillaryData,
    NoData,
    Unreadable,
}

struct AppStorageResolution {
    app_dir: PathBuf,
    #[cfg(any(target_os = "windows", test))]
    windows_split_brain_source: Option<PathBuf>,
}

#[cfg(any(target_os = "windows", test))]
#[derive(Debug)]
struct DatabaseMergePreflight {
    needs_merge: bool,
    conflict: Option<String>,
}

#[cfg(any(target_os = "windows", test))]
struct DatabaseTableMergeSchema {
    columns: Vec<String>,
    primary_key_indices: Vec<usize>,
}

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

#[cfg(debug_assertions)]
fn normalize_desktop_visual_qa_readiness_token(value: &str) -> Option<&'static str> {
    match value.trim() {
        "printer-live-telemetry" => Some("printer-live-telemetry"),
        _ => None,
    }
}

#[tauri::command]
fn signal_desktop_visual_qa_readiness(token: String) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        let token = normalize_desktop_visual_qa_readiness_token(&token)
            .ok_or_else(|| "Unknown desktop visual QA readiness token".to_string())?;
        eprintln!("FILAMENT_MANAGER_VISUAL_QA_READY:{token}");
        Ok(())
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = token;
        Err("Desktop visual QA readiness is unavailable in release builds".to_string())
    }
}

#[tauri::command]
fn prepare_desktop_visual_qa_window(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(debug_assertions)]
    {
        apply_visual_qa_window_size(&app)
    }

    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        Err("Desktop visual QA window preparation is unavailable in release builds".to_string())
    }
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
            if let Ok(log_dir) = app.path().app_log_dir() {
                if let Err(error) = app_error::operational_log::initialize_operational_log(&log_dir)
                {
                    eprintln!("Operational log unavailable: {error}");
                }
            }
            let db_path = ensure_db(app).inspect_err(|_| {
                let _ = app_error::operational_log::record_operational_event(
                    app_error::operational_log::OperationalLogLevel::Error,
                    app_error::operational_log::OperationalLogContext::DatabaseStartupFailure,
                    None,
                );
            })?;
            let trusted_lan_runtime = trusted_lan_runtime_commands::load_trusted_lan_runtime(
                db_path.to_string_lossy().as_ref(),
            )?;
            let companion = state::CompanionRuntimeState::new(trusted_lan_runtime);
            let state = AppState {
                db_path: db_path.to_string_lossy().to_string(),
                companion,
            };
            app.manage(state.clone());

            #[cfg(debug_assertions)]
            apply_visual_qa_window_size(app.handle())?;

            #[cfg(debug_assertions)]
            apply_visual_qa_scenario_url(app)?;

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
            inventory_read_commands::list_spools,
            inventory_read_commands::list_wishlist_items,
            printer_settings_commands::get_printer_settings,
            printer_read_commands::list_printer_overview,
            trusted_lan_status_commands::get_trusted_lan_companion_status,
            trusted_lan_interface_commands::list_trusted_lan_interfaces,
            trusted_lan_config_commands::update_trusted_lan_companion_config,
            trusted_lan_pairing_commands::create_trusted_lan_pairing,
            trusted_lan_browser_read_commands::list_trusted_lan_paired_browsers,
            trusted_lan_browser_revoke_commands::revoke_trusted_lan_paired_browser,
            trusted_lan_browser_revoke_all_commands::revoke_all_trusted_lan_paired_browsers,
            inventory_read_commands::list_master_catalog,
            catalog_commands::refresh_bambu_catalog,
            catalog_commands::refresh_esun_catalog,
            catalog_commands::esun_search_filaments,
            catalog_commands::esun_fetch_product_detail,
            inventory_create_commands::create_spool,
            inventory_create_commands::create_wishlist_item,
            inventory_create_commands::create_manual_spool,
            printer_create_commands::create_printer,
            printer_bambu_live_commands::save_bambu_live_integration,
            printer_bambu_live_commands::delete_bambu_live_integration,
            printer_danger_zone_commands::delete_printer,
            printer_active_commands::set_active_printer,
            set_dock_icon_theme,
            get_app_version,
            signal_desktop_visual_qa_readiness,
            prepare_desktop_visual_qa_window,
            app_error::application_diagnostics::get_application_diagnostics,
            app_error::application_diagnostics::get_sanitized_support_bundle_json,
            library_sync_settings_commands::get_library_sync_settings,
            library_revision_commands::get_library_domain_revisions,
            library_revision_commands::fetch_library_sync_domain_revisions,
            library_sync_settings_commands::save_library_sync_settings,
            library_sync_validation_commands::validate_library_sync_host,
            library_sync_snapshot_commands::fetch_library_sync_snapshot,
            library_sync_read_commands::fetch_library_sync_spool_detail,
            library_sync_read_commands::fetch_library_sync_spools,
            library_sync_read_commands::fetch_library_sync_catalog_masters,
            library_sync_read_commands::fetch_library_sync_wishlist_items,
            library_sync_read_commands::fetch_library_sync_full_backup_json,
            library_sync_cache_commands::fetch_cached_library_sync_spools,
            library_sync_cache_commands::save_library_sync_spool_cache,
            library_sync_read_commands::fetch_library_sync_printer_overview,
            library_sync_read_commands::fetch_library_sync_printer_settings,
            library_sync_cache_commands::fetch_cached_library_sync_printer_overview,
            library_sync_read_commands::fetch_library_sync_loans,
            library_sync_read_commands::fetch_library_sync_filament_consumption,
            library_sync_cache_commands::fetch_cached_library_sync_loans,
            library_sync_cache_commands::fetch_cached_library_sync_wishlist,
            library_sync_pairing_commands::pair_library_sync_host,
            library_sync_settings_commands::clear_library_sync_client_auth,
            library_sync_spool_write_commands::create_library_sync_host_spool,
            library_sync_wishlist_write_commands::create_library_sync_host_wishlist_item,
            library_sync_printer_write_commands::create_library_sync_host_printer,
            library_sync_printer_write_commands::save_library_sync_host_bambu_live_integration,
            library_sync_printer_write_commands::update_library_sync_host_master_catalog_entry,
            library_sync_printer_write_commands::refresh_library_sync_host_vendor_catalog,
            library_sync_wishlist_write_commands::update_library_sync_host_wishlist_item_status,
            library_sync_wishlist_write_commands::receive_library_sync_host_wishlist_item,
            library_sync_wishlist_write_commands::delete_library_sync_host_wishlist_item,
            library_sync_danger_zone_commands::delete_library_sync_host_spool,
            library_sync_printer_write_commands::delete_library_sync_host_printer,
            library_sync_printer_write_commands::delete_library_sync_host_bambu_live_integration,
            library_sync_danger_zone_commands::purge_library_sync_host_spool,
            library_sync_spool_write_commands::update_library_sync_host_spool_weight,
            library_sync_spool_write_commands::update_library_sync_host_spool_tare_weight,
            library_sync_spool_write_commands::update_library_sync_host_spool_details,
            library_sync_spool_write_commands::update_library_sync_host_spool_ownership,
            library_sync_spool_write_commands::update_library_sync_host_spool_rfid_tag,
            library_sync_printer_write_commands::assign_library_sync_host_printer_slot,
            library_sync_printer_write_commands::record_library_sync_host_print_usage,
            library_sync_loan_write_commands::return_library_sync_host_loan,
            library_sync_loan_write_commands::lend_library_sync_host_spool,
            printer_slot_write_commands::assign_printer_slot,
            printer_usage_commands::record_print_usage,
            inventory_update_commands::update_spool_weight,
            inventory_update_commands::update_spool_tare_weight,
            inventory_update_commands::update_spool_status,
            inventory_update_commands::update_spool_details,
            inventory_update_commands::update_spool_ownership,
            inventory_update_commands::update_spool_rfid_tag,
            inventory_update_commands::update_master_catalog_entry,
            inventory_danger_zone_commands::delete_spool,
            inventory_danger_zone_commands::purge_spool,
            inventory_activity_commands::list_spool_history,
            inventory_activity_commands::list_spool_usage,
            inventory_loan_commands::list_active_spool_loans,
            inventory_loan_commands::list_loan_usage_by_person,
            inventory_loan_commands::list_spool_loans,
            inventory_wishlist_commands::update_wishlist_item_status,
            inventory_wishlist_commands::receive_wishlist_item,
            inventory_wishlist_commands::delete_wishlist_item,
            inventory_loan_commands::lend_spool,
            inventory_loan_commands::return_spool_loan,
            inventory_loan_commands::return_inbound_spool_loan,
            inventory_loan_commands::export_loans_csv,
            inventory_update_commands::assign_location,
            inventory_read_commands::find_spool_by_qr,
            document_commands::export_inventory_csv,
            document_commands::export_inventory_json,
            document_commands::export_full_backup_json,
            document_commands::import_full_backup_json,
            document_commands::import_data_file,
            document_commands::validate_full_backup_json,
            inventory_stats_commands::inventory_overview,
            inventory_maintenance_commands::reset_app_data,
            inventory_maintenance_commands::reset_catalog_data,
            inventory_stats_commands::top_materials,
            inventory_stats_commands::list_filament_consumption,
            document_commands::export_inventory_label_sheet_pdf,
            document_commands::export_label_png,
            external_url_commands::open_external_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(debug_assertions)]
fn normalize_visual_qa_scenario(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "dashboard-overview" | "dashboard" => Some("dashboard-overview"),
        "inventory-overview" | "inventory" => Some("inventory-overview"),
        "add-filament" | "inventory-add" => Some("add-filament"),
        "wishlist-queue" | "inventory-wishlist" | "wishlist-orders" | "order-queue" => {
            Some("wishlist-queue")
        }
        "loans-overview" | "loans" | "loan-history" => Some("loans-overview"),
        "loan-out" | "inventory-loan" => Some("loan-out"),
        "selected-roll" | "detail" | "inventory-detail" => Some("selected-roll"),
        "selected-roll-label" | "label" | "qr-label" | "inventory-label" => {
            Some("selected-roll-label")
        }
        "selected-roll-history" | "roll-history" | "inventory-roll-history" => {
            Some("selected-roll-history")
        }
        "selected-roll-danger-zone" | "danger-zone" | "inventory-danger-zone" => {
            Some("selected-roll-danger-zone")
        }
        "rfid-capture" | "inventory-rfid" => Some("rfid-capture"),
        "return-loan" | "loan-return" | "return" => Some("return-loan"),
        "return-inbound-loan"
        | "inbound-return"
        | "borrowed-in-hand-back"
        | "hand-back-borrowed-in" => Some("return-inbound-loan"),
        "printer-board" | "printers" => Some("printer-board"),
        "add-printer" | "printer-add" | "add-printer-modal" => Some("add-printer"),
        "printer-slot-assignment" | "printer-slot-dropdown" | "slot-assignment" => {
            Some("printer-slot-assignment")
        }
        "printer-slot-onboarding"
        | "slot-onboarding"
        | "ams-onboarding"
        | "printer-ams-onboarding" => Some("printer-slot-onboarding"),
        "printer-rfid-override"
        | "rfid-override"
        | "slot-rfid-override"
        | "printer-slot-rfid-override" => Some("printer-rfid-override"),
        "printer-slot-replacement" | "printer-slot-swap" | "slot-replacement" | "slot-swap" => {
            Some("printer-slot-replacement")
        }
        "printer-slot-clear" | "printer-slot-unload" | "slot-clear" | "slot-unload" => {
            Some("printer-slot-clear")
        }
        "bambu-batch-add" | "batch-add" | "bambu-batch" => Some("bambu-batch-add"),
        "settings-general" | "general-settings" => Some("settings-general"),
        "settings-inventory-label-sheet" | "inventory-label-sheet" | "settings-label-sheet" => {
            Some("settings-inventory-label-sheet")
        }
        "settings-library" | "library-settings" | "companion-settings" => Some("settings-library"),
        "settings-library-role-change"
        | "library-role-change"
        | "library-role-dialog"
        | "library-role-modal"
        | "library-role-switch"
        | "companion-role-change" => Some("settings-library-role-change"),
        "settings-library-network-details"
        | "library-network-details"
        | "companion-network-details"
        | "trusted-lan-details" => Some("settings-library-network-details"),
        "settings-library-network-editor"
        | "library-network-editor"
        | "companion-network-editor"
        | "trusted-lan-editor" => Some("settings-library-network-editor"),
        "settings-library-pairing"
        | "library-pairing"
        | "companion-pairing"
        | "trusted-lan-pairing" => Some("settings-library-pairing"),
        "settings-library-browsers"
        | "library-browsers"
        | "companion-browsers"
        | "trusted-lan-browsers" => Some("settings-library-browsers"),
        "settings-library-browsers-history"
        | "library-browser-history"
        | "companion-browser-history"
        | "trusted-lan-browser-history" => Some("settings-library-browsers-history"),
        "settings-printer-diagnostics" | "printer-diagnostics" | "bambu-live-diagnostics" => {
            Some("settings-printer-diagnostics")
        }
        "settings-printer-diagnostics-fields"
        | "printer-diagnostics-fields"
        | "bambu-live-diagnostics-fields" => Some("settings-printer-diagnostics-fields"),
        "settings-printer-diagnostics-paused"
        | "printer-diagnostics-paused"
        | "bambu-live-diagnostics-paused" => Some("settings-printer-diagnostics-paused"),
        "settings-printer-editor" | "printer-editor" | "printer-settings-editor" => {
            Some("settings-printer-editor")
        }
        "settings-printer-editor-dirty"
        | "printer-editor-dirty"
        | "printer-settings-editor-dirty" => Some("settings-printer-editor-dirty"),
        "settings-printer-editor-discard"
        | "printer-editor-discard"
        | "printer-settings-editor-discard" => Some("settings-printer-editor-discard"),
        "settings-catalog" | "catalog-settings" | "filament-catalog" => Some("settings-catalog"),
        "settings-catalog-swatch-review"
        | "settings-catalog-missing-swatches"
        | "catalog-swatch-review"
        | "missing-swatches" => Some("settings-catalog-swatch-review"),
        "settings-maintenance" | "maintenance-settings" | "program-maintenance" => {
            Some("settings-maintenance")
        }
        "settings-application-diagnostics" | "settings-diagnostics" | "application-diagnostics" => {
            Some("settings-application-diagnostics")
        }
        "statistics-overview" | "statistics" | "usage-statistics" | "print-statistics" => {
            Some("statistics-overview")
        }
        "statistics-consumption" | "total-consumption" | "consumption-breakdown" => {
            Some("statistics-consumption")
        }
        "statistics-borrower" | "borrower-usage-breakdown" | "statistics-borrower-usage" => {
            Some("statistics-borrower")
        }
        "statistics-loans" | "loan-usage-statistics" | "statistics-loan-usage" => {
            Some("statistics-loans")
        }
        _ => None,
    }
}

#[cfg(debug_assertions)]
fn visual_qa_scenario_from_env() -> Option<&'static str> {
    let value = std::env::var(VISUAL_QA_SCENARIO_ENV_VAR).ok()?;
    normalize_visual_qa_scenario(&value)
}

#[cfg(debug_assertions)]
fn normalize_visual_qa_locale(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "nb" | "no" | "nb-no" => "nb",
        "en-xa" | "en_xa" => "en-XA",
        "ar-xb" | "ar_xb" => "ar-XB",
        "zh-xb" | "zh_xb" => "zh-XB",
        "de" | "de-de" => "de",
        "fr" | "fr-fr" => "fr",
        "es" | "es-es" => "es",
        "pt-br" | "pt_br" => "pt-BR",
        "it" | "it-it" | "it_it" => "it-IT",
        "pl" | "pl-pl" | "pl_pl" => "pl-PL",
        "nl" | "nl-nl" | "nl_nl" => "nl-NL",
        "cs" | "cs-cz" | "cs_cz" => "cs-CZ",
        "zh" | "zh-cn" | "zh_cn" | "zh-hans" => "zh-CN",
        "ja" | "ja-jp" | "ja_jp" => "ja-JP",
        "ko" | "ko-kr" | "ko_kr" => "ko-KR",
        "zh-tw" | "zh_tw" | "zh-hant" => "zh-TW",
        "tr" | "tr-tr" | "tr_tr" => "tr-TR",
        "uk" | "uk-ua" | "uk_ua" => "uk-UA",
        "ru" | "ru-ru" | "ru_ru" => "ru-RU",
        "hu" | "hu-hu" | "hu_hu" => "hu-HU",
        "sv" | "sv-se" | "sv_se" => "sv-SE",
        "da" | "da-dk" | "da_dk" => "da-DK",
        "fi" | "fi-fi" | "fi_fi" => "fi-FI",
        _ => "en",
    }
}

#[cfg(debug_assertions)]
fn visual_qa_locale_from_env() -> &'static str {
    std::env::var(VISUAL_QA_LOCALE_ENV_VAR)
        .ok()
        .map(|value| normalize_visual_qa_locale(&value))
        .unwrap_or("en")
}

#[cfg(debug_assertions)]
fn normalize_visual_qa_theme(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "light" => Some("light"),
        "dark" => Some("dark"),
        "auto" => Some("auto"),
        _ => None,
    }
}

#[cfg(debug_assertions)]
fn visual_qa_theme_from_env() -> Option<&'static str> {
    let value = std::env::var(VISUAL_QA_THEME_ENV_VAR).ok()?;
    normalize_visual_qa_theme(&value)
}

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn normalize_visual_qa_window_size(value: &str) -> Option<(f64, f64)> {
    let normalized = value.trim().to_ascii_lowercase().replace('×', "x");
    let (width, height) = normalized.split_once('x')?;
    let width = width.trim().parse::<u32>().ok()?;
    let height = height.trim().parse::<u32>().ok()?;
    if !(320..=8192).contains(&width) || !(320..=8192).contains(&height) {
        return None;
    }
    Some((f64::from(width), f64::from(height)))
}

#[cfg(all(debug_assertions, target_os = "macos"))]
fn apply_visual_qa_window_size(app: &tauri::AppHandle) -> Result<(), String> {
    let Some(raw_size) = std::env::var(VISUAL_QA_WINDOW_SIZE_ENV_VAR).ok() else {
        return Ok(());
    };
    let (width, height) = normalize_visual_qa_window_size(&raw_size)
        .ok_or_else(|| "Invalid desktop visual QA window size".to_string())?;
    let Some(window) = app.get_webview_window("main") else {
        return Err("Desktop visual QA main window is unavailable".to_string());
    };
    let raw_window = window.ns_window().map_err(|error| error.to_string())?;
    let native_window: &NSWindow = unsafe { &*raw_window.cast() };
    let mut frame = native_window.frame();
    frame.origin.x = 0.0;
    frame.origin.y = 0.0;
    frame.size.width = width;
    frame.size.height = height;
    native_window.setFrame_display(frame, true);
    Ok(())
}

#[cfg(all(debug_assertions, not(target_os = "macos")))]
fn apply_visual_qa_window_size(_app: &tauri::AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(debug_assertions)]
fn apply_visual_qa_scenario_url(app: &tauri::App) -> Result<(), String> {
    let Some(scenario) = visual_qa_scenario_from_env() else {
        return Ok(());
    };
    let Some(window) = app.get_webview_window("main") else {
        return Ok(());
    };
    let mut url = window.url().map_err(|error| error.to_string())?;
    url.query_pairs_mut()
        .append_pair("bfm_visual_qa", scenario)
        .append_pair("bfm_locale", visual_qa_locale_from_env());
    if let Some(theme) = visual_qa_theme_from_env() {
        url.query_pairs_mut()
            .append_pair("bfm_visual_qa_theme", theme);
    }
    window.navigate(url).map_err(|error| error.to_string())
}

fn ensure_db(app: &tauri::App) -> Result<PathBuf, String> {
    if let Some(path) = app_db_path_override_from_env() {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let _db = open_database_and_apply_schema(&path)?;
        return Ok(path);
    }

    prepare_resolved_app_database(resolve_app_storage_dir_for_app(app)?)
}

fn prepare_resolved_app_database(resolution: AppStorageResolution) -> Result<PathBuf, String> {
    prepare_app_storage_dir(&resolution.app_dir)?;
    let db_path = resolution.app_dir.join(APP_DB_FILE_NAME);
    let _db = open_database_and_apply_schema(&db_path)?;

    #[cfg(any(target_os = "windows", test))]
    if let Some(source_path) = resolution.windows_split_brain_source {
        drop(_db);
        merge_windows_split_brain_databases(&source_path, &db_path)?;
    }

    Ok(db_path)
}

fn open_database_and_apply_schema(path: &Path) -> Result<FilamentDatabase, String> {
    let schema_version = backend::database_connection::inspect_existing_database_schema(path)
        .map_err(|error| format!("DB inspect: {error:?}"))?;
    let recovery_snapshot = if schema_version
        .is_some_and(|version| version < backend::database_schema::CURRENT_SCHEMA_VERSION)
    {
        Some(
            RecoverySnapshot::create(path, RecoveryReason::SchemaUpgrade)
                .map_err(|error| format!("DB recovery snapshot: {error}"))?,
        )
    } else {
        None
    };

    let result = (|| {
        let db = FilamentDatabase::open(path).map_err(|error| format!("DB open: {error:?}"))?;
        db.apply_schema()
            .map_err(|error| format!("DB schema: {error:?}"))?;
        Ok(db)
    })();

    finish_recovery_operation(recovery_snapshot, result)
}

fn finish_recovery_operation<T>(
    recovery_snapshot: Option<RecoverySnapshot>,
    result: Result<T, String>,
) -> Result<T, String> {
    match result {
        Ok(value) => {
            if let Some(snapshot) = recovery_snapshot {
                snapshot.mark_operation_succeeded();
            }
            Ok(value)
        }
        Err(error) => {
            if let Some(snapshot) = recovery_snapshot {
                snapshot.mark_operation_failed();
            }
            Err(error)
        }
    }
}

fn app_db_path_override_from_env() -> Option<PathBuf> {
    env_path(APP_DB_PATH_ENV_VAR).or_else(|| env_path(LEGACY_APP_DB_PATH_ENV_VAR))
}

fn env_path(name: &str) -> Option<PathBuf> {
    std::env::var_os(name)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn resolve_app_storage_dir_for_app(app: &tauri::App) -> Result<AppStorageResolution, String> {
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
        Ok(resolve_windows_storage_resolution(
            app_data_dir,
            app_local_data_dir,
        ))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(AppStorageResolution {
            app_dir: app_data_dir,
            #[cfg(test)]
            windows_split_brain_source: None,
        })
    }
}

fn prepare_app_storage_dir(app_dir: &Path) -> Result<(), String> {
    migrate_legacy_app_storage_if_needed(app_dir)?;
    std::fs::create_dir_all(app_dir).map_err(|error| error.to_string())
}

fn migrate_legacy_app_storage_if_needed(app_dir: &Path) -> Result<(), String> {
    let Some((legacy_db_path, legacy_dir)) = legacy_database_source(app_dir) else {
        return Ok(());
    };

    let current_db_path = app_dir.join(APP_DB_FILE_NAME);
    let current_db_exists = current_db_path.exists();
    let should_migrate = if current_db_exists {
        should_replace_current_database_with_legacy(
            database_user_data_state(&current_db_path),
            database_user_data_state(&legacy_db_path),
        )
    } else {
        true
    };
    if !should_migrate {
        return Ok(());
    }

    if let Some(legacy_dir) = legacy_dir {
        copy_dir_contents_without_overwrite(&legacy_dir, app_dir)?;
    } else {
        std::fs::create_dir_all(app_dir).map_err(|error| error.to_string())?;
    }
    let working_copy = SqliteWorkingCopy::create(
        &legacy_db_path,
        app_dir,
        RecoveryReason::LegacyBundleMigration,
    )?;
    let recovery_snapshot = if current_db_exists {
        Some(RecoverySnapshot::create(
            &current_db_path,
            RecoveryReason::LegacyBundleMigration,
        )?)
    } else {
        None
    };
    let migration_result = online_backup(working_copy.path(), &current_db_path);
    finish_recovery_operation(recovery_snapshot, migration_result)
}

fn should_replace_current_database_with_legacy(
    current: DatabaseUserDataState,
    legacy: DatabaseUserDataState,
) -> bool {
    matches!(
        (current, legacy),
        (
            DatabaseUserDataState::NoData,
            DatabaseUserDataState::DomainData | DatabaseUserDataState::AncillaryData
        ) | (
            DatabaseUserDataState::AncillaryData,
            DatabaseUserDataState::DomainData
        )
    )
}

fn legacy_database_source(app_dir: &Path) -> Option<(PathBuf, Option<PathBuf>)> {
    let mut candidates = Vec::new();

    let same_dir_legacy_db = app_dir.join(LEGACY_APP_DB_FILE_NAME);
    if same_dir_legacy_db.exists() {
        candidates.push((same_dir_legacy_db, None));
    }

    if let Some(parent_dir) = app_dir.parent() {
        let legacy_dir = parent_dir.join(LEGACY_APP_DATA_DIR_NAME);
        for file_name in [APP_DB_FILE_NAME, LEGACY_APP_DB_FILE_NAME] {
            let legacy_db_path = legacy_dir.join(file_name);
            if legacy_db_path.exists() {
                candidates.push((legacy_db_path, Some(legacy_dir.clone())));
            }
        }
    }

    let mut ancillary_fallback = None;
    let mut empty_fallback = None;
    for candidate in candidates {
        match database_user_data_state(&candidate.0) {
            DatabaseUserDataState::DomainData => return Some(candidate),
            DatabaseUserDataState::AncillaryData if ancillary_fallback.is_none() => {
                ancillary_fallback = Some(candidate);
            }
            DatabaseUserDataState::NoData if empty_fallback.is_none() => {
                empty_fallback = Some(candidate);
            }
            DatabaseUserDataState::AncillaryData
            | DatabaseUserDataState::NoData
            | DatabaseUserDataState::Unreadable => {}
        }
    }

    ancillary_fallback.or(empty_fallback)
}

fn copy_dir_contents_without_overwrite(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target_dir).map_err(|error| error.to_string())?;
    for entry in std::fs::read_dir(source_dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let source_path = entry.path();
        let target_path = target_dir.join(entry.file_name());
        let file_type = entry.file_type().map_err(|error| error.to_string())?;

        if file_type.is_dir() {
            if target_path.exists() && !target_path.is_dir() {
                continue;
            }
            copy_dir_contents_without_overwrite(&source_path, &target_path)?;
        } else if file_type.is_file() && !target_path.exists() {
            std::fs::copy(&source_path, &target_path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn database_user_data_state(db_path: &Path) -> DatabaseUserDataState {
    let connection = match rusqlite::Connection::open_with_flags(
        db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(connection) => connection,
        Err(_) => return DatabaseUserDataState::Unreadable,
    };

    for table in FULL_BACKUP_TABLES {
        if table == "filament_master_list" || database_table_is_ancillary(table) {
            continue;
        }
        let has_rows = match database_table_has_rows(&connection, table) {
            Ok(has_rows) => has_rows,
            Err(error) if error.to_string().contains("no such table") => false,
            Err(_) => return DatabaseUserDataState::Unreadable,
        };
        if has_rows {
            return DatabaseUserDataState::DomainData;
        }
    }

    match database_catalog_has_user_data(&connection) {
        Ok(true) => return DatabaseUserDataState::DomainData,
        Ok(false) => {}
        Err(_) => return DatabaseUserDataState::Unreadable,
    }

    for table in [
        "settings",
        "trusted_lan_pairings",
        "trusted_lan_paired_browsers",
        "sync_queue",
    ] {
        let has_rows_result = if table == "settings" {
            database_settings_have_user_data(&connection)
        } else {
            database_table_has_rows(&connection, table)
        };
        let has_rows = match has_rows_result {
            Ok(has_rows) => has_rows,
            Err(error) if error.to_string().contains("no such table") => false,
            Err(_) => return DatabaseUserDataState::Unreadable,
        };
        if has_rows {
            return DatabaseUserDataState::AncillaryData;
        }
    }

    DatabaseUserDataState::NoData
}

fn database_table_is_ancillary(table: &str) -> bool {
    matches!(
        table,
        "settings" | "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue"
    )
}

fn database_settings_have_user_data(connection: &rusqlite::Connection) -> rusqlite::Result<bool> {
    connection
        .query_row(
            "SELECT EXISTS(
                SELECT 1 FROM settings WHERE key != ?1
             )",
            [AUTO_GENERATED_LIBRARY_ID_SETTING_KEY],
            |row| row.get::<_, i64>(0),
        )
        .map(|value| value != 0)
}

fn database_table_has_rows(
    connection: &rusqlite::Connection,
    table: &str,
) -> rusqlite::Result<bool> {
    let sql = format!("SELECT EXISTS(SELECT 1 FROM {table})");
    connection
        .query_row(&sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value != 0)
}

fn database_catalog_has_user_data(connection: &rusqlite::Connection) -> rusqlite::Result<bool> {
    let (catalog_table_exists, has_catalog_source, has_catalog_user_edited) = {
        let mut statement = connection.prepare("PRAGMA table_info(filament_master_list)")?;
        let mut rows = statement.query([])?;
        let mut catalog_table_exists = false;
        let mut has_catalog_source = false;
        let mut has_catalog_user_edited = false;
        while let Some(row) = rows.next()? {
            catalog_table_exists = true;
            let column_name = row.get::<_, String>(1)?;
            has_catalog_source |= column_name == "catalog_source";
            has_catalog_user_edited |= column_name == "catalog_user_edited";
        }
        (
            catalog_table_exists,
            has_catalog_source,
            has_catalog_user_edited,
        )
    };

    if !catalog_table_exists {
        return Ok(false);
    }

    let sql = match (has_catalog_source, has_catalog_user_edited) {
        (true, true) => {
            "SELECT EXISTS(
                SELECT 1 FROM filament_master_list
                WHERE COALESCE(catalog_source, 'unknown') NOT IN ('seeded', 'scraped')
                   OR catalog_user_edited != 0
            )"
        }
        (true, false) => {
            "SELECT EXISTS(
                SELECT 1 FROM filament_master_list
                WHERE COALESCE(catalog_source, 'unknown') NOT IN ('seeded', 'scraped')
            )"
        }
        (false, _) => "SELECT EXISTS(SELECT 1 FROM filament_master_list)",
    };
    connection
        .query_row(sql, [], |row| row.get::<_, i64>(0))
        .map(|value| value != 0)
}

#[cfg(test)]
fn resolve_windows_storage_dir(roaming_dir: PathBuf, local_dir: PathBuf) -> PathBuf {
    resolve_windows_storage_resolution(roaming_dir, local_dir).app_dir
}

#[cfg(any(target_os = "windows", test))]
fn resolve_windows_storage_resolution(
    roaming_dir: PathBuf,
    local_dir: PathBuf,
) -> AppStorageResolution {
    let split_brain_source = windows_legacy_roaming_merge_source(&roaming_dir, &local_dir);
    if split_brain_source.is_some() {
        return AppStorageResolution {
            app_dir: local_dir,
            windows_split_brain_source: split_brain_source,
        };
    }

    AppStorageResolution {
        app_dir: resolve_windows_storage_dir_without_split_merge(roaming_dir, local_dir),
        windows_split_brain_source: None,
    }
}

#[cfg(any(target_os = "windows", test))]
fn windows_legacy_roaming_merge_source(roaming_dir: &Path, local_dir: &Path) -> Option<PathBuf> {
    let current_roaming_has_user_data = storage_dir_current_database_candidates(roaming_dir)
        .iter()
        .any(|path| {
            matches!(
                database_user_data_state(path),
                DatabaseUserDataState::DomainData | DatabaseUserDataState::AncillaryData
            )
        });
    if current_roaming_has_user_data {
        return None;
    }

    let current_local_database = local_dir.join(APP_DB_FILE_NAME);
    if current_local_database.exists()
        && database_user_data_state(&current_local_database) == DatabaseUserDataState::Unreadable
    {
        return None;
    }

    storage_dir_legacy_database_candidates(roaming_dir)
        .into_iter()
        .find(|path| database_user_data_state(path) == DatabaseUserDataState::DomainData)
}

#[cfg(any(target_os = "windows", test))]
fn resolve_windows_storage_dir_without_split_merge(
    roaming_dir: PathBuf,
    local_dir: PathBuf,
) -> PathBuf {
    for state in [
        DatabaseUserDataState::DomainData,
        DatabaseUserDataState::AncillaryData,
    ] {
        if database_candidates_have_state(
            &storage_dir_current_database_candidates(&local_dir),
            state,
        ) {
            return local_dir;
        }
        if database_candidates_have_state(
            &storage_dir_current_database_candidates(&roaming_dir),
            state,
        ) {
            return roaming_dir;
        }
        if database_candidates_have_state(
            &storage_dir_legacy_database_candidates(&local_dir),
            state,
        ) {
            return local_dir;
        }
        if database_candidates_have_state(
            &storage_dir_legacy_database_candidates(&roaming_dir),
            state,
        ) {
            return roaming_dir;
        }
    }
    if database_candidates_exist(&storage_dir_current_database_candidates(&local_dir)) {
        return local_dir;
    }
    if database_candidates_exist(&storage_dir_current_database_candidates(&roaming_dir)) {
        return roaming_dir;
    }
    if database_candidates_exist(&storage_dir_legacy_database_candidates(&local_dir)) {
        return local_dir;
    }
    if database_candidates_exist(&storage_dir_legacy_database_candidates(&roaming_dir)) {
        return roaming_dir;
    }
    local_dir
}

#[cfg(any(target_os = "windows", test))]
fn database_candidates_have_state(candidates: &[PathBuf], state: DatabaseUserDataState) -> bool {
    candidates
        .iter()
        .any(|path| database_user_data_state(path) == state)
}

#[cfg(any(target_os = "windows", test))]
fn database_candidates_exist(candidates: &[PathBuf]) -> bool {
    candidates.iter().any(|path| path.exists())
}

#[cfg(any(target_os = "windows", test))]
fn storage_dir_current_database_candidates(dir: &Path) -> [PathBuf; 2] {
    [
        dir.join(APP_DB_FILE_NAME),
        dir.join(LEGACY_APP_DB_FILE_NAME),
    ]
}

#[cfg(any(target_os = "windows", test))]
fn storage_dir_legacy_database_candidates(dir: &Path) -> Vec<PathBuf> {
    if let Some(parent_dir) = dir.parent() {
        let legacy_dir = parent_dir.join(LEGACY_APP_DATA_DIR_NAME);
        return vec![
            legacy_dir.join(APP_DB_FILE_NAME),
            legacy_dir.join(LEGACY_APP_DB_FILE_NAME),
        ];
    }
    Vec::new()
}

#[cfg(any(target_os = "windows", test))]
fn merge_windows_split_brain_databases(
    source_path: &Path,
    target_path: &Path,
) -> Result<Option<PathBuf>, String> {
    if source_path == target_path {
        return Err("Windows split-brain merge source and target must be different".to_string());
    }
    if windows_split_brain_merge_is_marked(target_path)? {
        return Ok(None);
    }

    let preflight = preflight_windows_split_brain_merge(source_path, target_path)?;
    if !preflight.needs_merge {
        write_windows_split_brain_merge_marker(target_path)?;
        return Ok(None);
    }

    let recovery_snapshot =
        RecoverySnapshot::create(target_path, RecoveryReason::WindowsStorageMerge)?;

    if let Some(conflict) = preflight.conflict {
        let backup_path = recovery_snapshot.mark_operation_failed();
        return Err(format!(
            "{conflict}. The target backup is {} and the source database was left unchanged",
            backup_path.display()
        ));
    }

    match apply_windows_split_brain_merge(source_path, target_path) {
        Ok(()) => Ok(Some(recovery_snapshot.mark_operation_succeeded())),
        Err(error) => {
            let backup_path = recovery_snapshot.mark_operation_failed();
            Err(format!(
                "{error}. The merge was rolled back, the target backup is {}, and the source database was left unchanged",
                backup_path.display()
            ))
        }
    }
}

#[cfg(any(target_os = "windows", test))]
fn preflight_windows_split_brain_merge(
    source_path: &Path,
    target_path: &Path,
) -> Result<DatabaseMergePreflight, String> {
    let source = rusqlite::Connection::open_with_flags(
        source_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| {
        format!(
            "failed to open Windows split-brain source {}: {error}",
            source_path.display()
        )
    })?;
    let target = rusqlite::Connection::open_with_flags(
        target_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
    )
    .map_err(|error| {
        format!(
            "failed to open Windows split-brain target {}: {error}",
            target_path.display()
        )
    })?;

    let mut needs_merge = false;
    for table in FULL_BACKUP_TABLES {
        if database_merge_skips_table(table) {
            continue;
        }
        if table == "settings" {
            for (key, _) in read_safe_merge_settings(&source)? {
                let target_value = target
                    .query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| {
                        row.get::<_, String>(0)
                    })
                    .optional()
                    .map_err(|error| error.to_string())?;
                if target_value.is_none() {
                    needs_merge = true;
                }
            }
            continue;
        }

        let Some(schema) = database_table_merge_schema(&source, &target, table)? else {
            continue;
        };
        for source_row in read_database_table_rows(&source, table, &schema.columns)? {
            match find_database_merge_target_row(&target, table, &schema, &source_row)? {
                Some(target_row) => {
                    if table == "filament_master_list"
                        && database_catalog_merge_row_is_automatic(&schema.columns, &source_row)
                    {
                        continue;
                    }
                    if target_row != source_row {
                        return Ok(DatabaseMergePreflight {
                            needs_merge: true,
                            conflict: Some(format!(
                                "Windows split-brain merge found a conflicting primary key in `{table}`"
                            )),
                        });
                    }
                }
                None => needs_merge = true,
            }
        }
    }

    Ok(DatabaseMergePreflight {
        needs_merge,
        conflict: None,
    })
}

#[cfg(any(target_os = "windows", test))]
fn apply_windows_split_brain_merge(source_path: &Path, target_path: &Path) -> Result<(), String> {
    let source = rusqlite::Connection::open_with_flags(
        source_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| error.to_string())?;
    let mut target = rusqlite::Connection::open(target_path).map_err(|error| error.to_string())?;
    target
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    let transaction = target
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|error| error.to_string())?;

    let merge_result = (|| -> Result<(), String> {
        for table in FULL_BACKUP_TABLES {
            if database_merge_skips_table(table) || table == "settings" {
                continue;
            }
            let Some(schema) = database_table_merge_schema(&source, &transaction, table)? else {
                continue;
            };
            for source_row in read_database_table_rows(&source, table, &schema.columns)? {
                if let Some(target_row) =
                    find_database_merge_target_row(&transaction, table, &schema, &source_row)?
                {
                    if table == "filament_master_list"
                        && database_catalog_merge_row_is_automatic(&schema.columns, &source_row)
                    {
                        continue;
                    }
                    if target_row != source_row {
                        return Err(format!(
                            "Windows split-brain merge found a conflicting primary key in `{table}`"
                        ));
                    }
                    continue;
                }
                insert_database_merge_row(&transaction, table, &schema.columns, &source_row)?;
            }
        }

        for (key, value) in read_safe_merge_settings(&source)? {
            transaction
                .execute(
                    "INSERT INTO settings (key, value) VALUES (?1, ?2)
                     ON CONFLICT(key) DO NOTHING",
                    rusqlite::params![key, value],
                )
                .map_err(|error| error.to_string())?;
        }
        transaction
            .execute(
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                rusqlite::params![
                    WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY,
                    WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE
                ],
            )
            .map_err(|error| error.to_string())?;

        let mut statement = transaction
            .prepare("PRAGMA foreign_key_check")
            .map_err(|error| error.to_string())?;
        let mut rows = statement.query([]).map_err(|error| error.to_string())?;
        if let Some(row) = rows.next().map_err(|error| error.to_string())? {
            let table: String = row.get(0).map_err(|error| error.to_string())?;
            let parent: String = row.get(2).map_err(|error| error.to_string())?;
            return Err(format!(
                "Windows split-brain merge would leave `{table}` referencing missing `{parent}` data"
            ));
        }
        drop(rows);
        drop(statement);
        Ok(())
    })();

    match merge_result {
        Ok(()) => transaction.commit().map_err(|error| error.to_string()),
        Err(error) => {
            let _ = transaction.rollback();
            Err(error)
        }
    }
}

#[cfg(any(target_os = "windows", test))]
fn database_merge_skips_table(table: &str) -> bool {
    matches!(
        table,
        "trusted_lan_pairings" | "trusted_lan_paired_browsers" | "sync_queue"
    )
}

#[cfg(any(target_os = "windows", test))]
fn database_table_merge_schema(
    source: &rusqlite::Connection,
    target: &rusqlite::Connection,
    table: &str,
) -> Result<Option<DatabaseTableMergeSchema>, String> {
    let (source_columns, _) = database_table_columns_and_primary_key(source, table)?;
    if source_columns.is_empty() {
        return Ok(None);
    }
    let (target_columns, target_primary_key) =
        database_table_columns_and_primary_key(target, table)?;
    if target_columns.is_empty() {
        return Err(format!(
            "Windows split-brain target is missing the `{table}` table"
        ));
    }

    let source_column_set = source_columns
        .into_iter()
        .collect::<std::collections::HashSet<_>>();
    let columns = target_columns
        .into_iter()
        .filter(|column| source_column_set.contains(column))
        .collect::<Vec<_>>();
    let primary_key_indices = target_primary_key
        .iter()
        .map(|column| {
            columns.iter().position(|candidate| candidate == column).ok_or_else(|| {
                format!(
                    "Windows split-brain source is missing primary-key column `{column}` for `{table}`"
                )
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    if primary_key_indices.is_empty() {
        return Err(format!(
            "Windows split-brain merge requires a primary key for `{table}`"
        ));
    }

    Ok(Some(DatabaseTableMergeSchema {
        columns,
        primary_key_indices,
    }))
}

#[cfg(any(target_os = "windows", test))]
fn database_table_columns_and_primary_key(
    connection: &rusqlite::Connection,
    table: &str,
) -> Result<(Vec<String>, Vec<String>), String> {
    let mut statement = connection
        .prepare(&format!(
            "PRAGMA table_info({})",
            quote_sql_identifier(table)
        ))
        .map_err(|error| error.to_string())?;
    let mut rows = statement.query([]).map_err(|error| error.to_string())?;
    let mut columns = Vec::new();
    let mut primary_key = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let column_name: String = row.get(1).map_err(|error| error.to_string())?;
        let primary_key_order: i64 = row.get(5).map_err(|error| error.to_string())?;
        columns.push(column_name.clone());
        if primary_key_order > 0 {
            primary_key.push((primary_key_order, column_name));
        }
    }
    primary_key.sort_by_key(|(order, _)| *order);
    Ok((
        columns,
        primary_key.into_iter().map(|(_, column)| column).collect(),
    ))
}

#[cfg(any(target_os = "windows", test))]
fn read_database_table_rows(
    connection: &rusqlite::Connection,
    table: &str,
    columns: &[String],
) -> Result<Vec<Vec<rusqlite::types::Value>>, String> {
    let column_list = columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let mut statement = connection
        .prepare(&format!(
            "SELECT {column_list} FROM {}",
            quote_sql_identifier(table)
        ))
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            (0..columns.len())
                .map(|index| row.get::<_, rusqlite::types::Value>(index))
                .collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>()
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn find_database_merge_target_row(
    target: &rusqlite::Connection,
    table: &str,
    schema: &DatabaseTableMergeSchema,
    source_row: &[rusqlite::types::Value],
) -> Result<Option<Vec<rusqlite::types::Value>>, String> {
    let column_list = schema
        .columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let predicate = schema
        .primary_key_indices
        .iter()
        .enumerate()
        .map(|(parameter_index, column_index)| {
            format!(
                "{} IS ?{}",
                quote_sql_identifier(&schema.columns[*column_index]),
                parameter_index + 1
            )
        })
        .collect::<Vec<_>>()
        .join(" AND ");
    let sql = format!(
        "SELECT {column_list} FROM {} WHERE {predicate}",
        quote_sql_identifier(table)
    );
    target
        .query_row(
            &sql,
            rusqlite::params_from_iter(
                schema
                    .primary_key_indices
                    .iter()
                    .map(|index| &source_row[*index]),
            ),
            |row| {
                (0..schema.columns.len())
                    .map(|index| row.get::<_, rusqlite::types::Value>(index))
                    .collect::<rusqlite::Result<Vec<_>>>()
            },
        )
        .optional()
        .map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn insert_database_merge_row(
    target: &rusqlite::Connection,
    table: &str,
    columns: &[String],
    row: &[rusqlite::types::Value],
) -> Result<(), String> {
    let column_list = columns
        .iter()
        .map(|column| quote_sql_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");
    let placeholders = vec!["?"; columns.len()].join(", ");
    target
        .execute(
            &format!(
                "INSERT INTO {} ({column_list}) VALUES ({placeholders})",
                quote_sql_identifier(table)
            ),
            rusqlite::params_from_iter(row.iter()),
        )
        .map_err(|error| format!("failed to merge `{table}`: {error}"))?;
    Ok(())
}

#[cfg(any(target_os = "windows", test))]
fn database_catalog_merge_row_is_automatic(
    columns: &[String],
    row: &[rusqlite::types::Value],
) -> bool {
    let Some(source_index) = columns.iter().position(|column| column == "catalog_source") else {
        return false;
    };
    let source_is_automatic = matches!(
        row.get(source_index),
        Some(rusqlite::types::Value::Text(source)) if source == "seeded" || source == "scraped"
    );
    let user_edited = columns
        .iter()
        .position(|column| column == "catalog_user_edited")
        .and_then(|index| row.get(index))
        .is_some_and(|value| match value {
            rusqlite::types::Value::Integer(value) => *value != 0,
            rusqlite::types::Value::Real(value) => *value != 0.0,
            rusqlite::types::Value::Text(value) => value != "0" && !value.is_empty(),
            rusqlite::types::Value::Null | rusqlite::types::Value::Blob(_) => false,
        });
    source_is_automatic && !user_edited
}

#[cfg(any(target_os = "windows", test))]
fn read_safe_merge_settings(
    connection: &rusqlite::Connection,
) -> Result<Vec<(String, String)>, String> {
    let (columns, _) = database_table_columns_and_primary_key(connection, "settings")?;
    if !columns.iter().any(|column| column == "key")
        || !columns.iter().any(|column| column == "value")
    {
        return Ok(Vec::new());
    }
    let mut statement = connection
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?;
    let mut settings = Vec::new();
    for row in rows {
        let (key, value) = row.map_err(|error| error.to_string())?;
        let normalized_key = key.to_ascii_lowercase();
        if normalized_key == WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY
            || normalized_key.starts_with("library_sync_")
            || normalized_key.starts_with("trusted_lan_")
        {
            continue;
        }
        settings.push((key, value));
    }
    Ok(settings)
}

#[cfg(any(target_os = "windows", test))]
fn windows_split_brain_merge_is_marked(target_path: &Path) -> Result<bool, String> {
    let connection = rusqlite::Connection::open_with_flags(
        target_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .map_err(|error| error.to_string())?;
    let marker = connection
        .query_row(
            "SELECT value FROM settings WHERE key = ?1",
            [WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    Ok(marker.as_deref() == Some(WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE))
}

#[cfg(any(target_os = "windows", test))]
fn write_windows_split_brain_merge_marker(target_path: &Path) -> Result<(), String> {
    let mut connection =
        rusqlite::Connection::open(target_path).map_err(|error| error.to_string())?;
    let transaction = connection
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![
                WINDOWS_SPLIT_BRAIN_MERGE_MARKER_KEY,
                WINDOWS_SPLIT_BRAIN_MERGE_MARKER_VALUE
            ],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

#[cfg(any(target_os = "windows", test))]
fn quote_sql_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('"', "\"\""))
}

pub(crate) fn with_inventory<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(InventoryEngine) -> backend::database_result::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path)
        .map_err(|error| app_error::internal_command_error("Open inventory database", error))?;
    let engine = InventoryEngine::new(db);
    func(engine).map_err(app_error::inventory_error_to_command_string)
}

pub(crate) fn with_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(&FilamentDatabase) -> backend::database_result::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path)
        .map_err(|error| app_error::internal_command_error("Open inventory database", error))?;
    func(&db).map_err(app_error::inventory_error_to_command_string)
}

pub(crate) fn with_stats<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(StatisticsEngine) -> Result<Output, rusqlite::Error>,
{
    let stats = StatisticsEngine::open(&state.db_path)
        .map_err(|error| app_error::internal_command_error("Open statistics database", error))?;
    func(stats).map_err(|error| app_error::internal_command_error("Statistics query", error))
}

#[cfg(test)]
#[path = "main_tests.rs"]
mod tests;
