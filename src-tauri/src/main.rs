#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod active_library_gateway;
mod app_error;
mod app_services;
mod app_storage;
mod bambu_live;
mod bambu_live_matching;
mod bambu_live_observation;
mod bambu_live_persistence;
mod bambu_live_sync;
mod bambu_live_usage;
mod bambu_mqtt;
mod bambu_printer_discovery;
mod bambu_thermal;
mod catalog_commands;
mod companion_api;
mod companion_assets;
mod companion_error;
mod companion_http;
mod companion_inventory_read_api;
mod companion_library_api;
mod companion_location_api;
mod companion_models;
mod companion_payload;
mod companion_routes;
mod companion_session;
mod companion_state;
mod companion_wishlist_write_api;
mod credential_migration;
mod credential_profile_migration;
mod credential_store;
mod desktop_lifecycle;
mod document_commands;
mod external_url_commands;
mod inventory_activity_commands;
mod inventory_command_support;
mod inventory_create_commands;
mod inventory_danger_zone_commands;
mod inventory_loan_commands;
mod inventory_location_commands;
mod inventory_location_models;
mod inventory_maintenance_commands;
mod inventory_read_commands;
mod inventory_stats_commands;
mod inventory_update_commands;
mod inventory_wishlist_commands;
mod library_revision_commands;
mod library_sync_blocking_executor;
mod library_sync_cache_commands;
mod library_sync_cache_refresh;
mod library_sync_command_support;
mod library_sync_danger_zone_commands;
mod library_sync_host_client;
mod library_sync_loan_write_commands;
mod library_sync_location_commands;
mod library_sync_models;
mod library_sync_pairing_commands;
mod library_sync_printer_write_commands;
mod library_sync_read_commands;
mod library_sync_runtime_auth;
mod library_sync_settings_commands;
mod library_sync_snapshot_commands;
mod library_sync_spool_write_commands;
mod library_sync_validation_commands;
mod library_sync_wishlist_write_commands;
mod local_service_advertisement;
mod optional_update;
mod packaged_desktop_e2e;
mod printer_active_commands;
mod printer_bambu_discovery_commands;
mod printer_bambu_live_commands;
mod printer_command_support;
mod printer_create_commands;
mod printer_danger_zone_commands;
mod printer_models;
mod printer_read_commands;
mod printer_settings_commands;
mod printer_slot_write_commands;
mod printer_usage_commands;
mod release_update_commands;
mod secure_credential_mutation;
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
mod trusted_lan_network_watcher;
mod trusted_lan_pairing_commands;
mod trusted_lan_runtime_commands;
mod trusted_lan_status_commands;

use backend::filament_database::FilamentDatabase;
use backend::inventory_engine::InventoryEngine;
use backend::statistics::StatisticsEngine;
use filament_manager_core::backend;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(all(target_os = "macos", debug_assertions))]
use objc2_app_kit::NSWindow;
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use state::AppState;
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use tauri::Manager;

#[cfg(test)]
use app_storage::*;

#[cfg(debug_assertions)]
const VISUAL_QA_SCENARIO_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_SCENARIO";
#[cfg(debug_assertions)]
const VISUAL_QA_LOCALE_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_LOCALE";
#[cfg(debug_assertions)]
const VISUAL_QA_THEME_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_THEME";
#[cfg(all(debug_assertions, target_os = "macos"))]
const VISUAL_QA_WINDOW_SIZE_ENV_VAR: &str = "FILAMENT_MANAGER_VISUAL_QA_WINDOW_SIZE";
#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
const VISUAL_QA_WINDOW_EDGE_INSET: f64 = 24.0;

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
        "add-printer-live-step" => Some("add-printer-live-step"),
        "dashboard-bambu-live-attention" => Some("dashboard-bambu-live-attention"),
        "dashboard-consumption" => Some("dashboard-consumption"),
        "printer-ams-weight-estimate" => Some("printer-ams-weight-estimate"),
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
    desktop_lifecycle::configure_builder(tauri::Builder::default())
        .setup(|app| {
            if let Ok(log_dir) = app.path().app_log_dir()
                && let Err(error) = app_error::operational_log::initialize_operational_log(&log_dir)
                {
                    eprintln!("Operational log unavailable: {error}");
                }
            let db_path = app_storage::ensure_db(app).inspect_err(|_| {
                let _ = app_error::operational_log::record_operational_event(
                    app_error::operational_log::OperationalLogLevel::Error,
                    app_error::operational_log::OperationalLogContext::DatabaseStartupFailure,
                    None,
                );
            })?;
            let credential_profile_id = FilamentDatabase::open(&db_path)
                .and_then(|db| db.get_or_create_credential_store_profile_id())
                .map_err(|error| {
                    std::io::Error::other(format!(
                        "Credential profile identity could not be loaded: {error}"
                    ))
                })?;
            let credentials =
                credential_store::CredentialStore::system(&credential_profile_id).map_err(|error| {
                std::io::Error::other(format!(
                    "Secure credential storage could not be initialized: {error}"
                ))
            })?;
            let library_sync_auth = library_sync_runtime_auth::LibrarySyncRuntimeAuth::new();
            let pending_credential_cleanup_completed =
                inventory_maintenance_commands::retry_pending_credential_cleanup(
                &db_path,
                &credentials,
                &library_sync_auth,
            )
            .map_err(|error| {
                std::io::Error::other(format!(
                    "Pending secure credential cleanup could not be completed and will be retried on the next start: {error}"
                ))
            })?;
            if pending_credential_cleanup_completed {
                eprintln!("Completed a pending secure credential cleanup.");
            }
            let credential_profile_migration =
                credential_profile_migration::migrate_legacy_credential_profile(
                    db_path.to_string_lossy().as_ref(),
                    &credentials,
                )
                .map_err(std::io::Error::other)?;
            if credential_profile_migration.credentials_moved > 0 {
                eprintln!(
                    "Moved {} credential(s) into the machine-local credential profile.",
                    credential_profile_migration.credentials_moved
                );
            }
            let credential_migration = credential_migration::migrate_legacy_credentials(
                db_path.to_string_lossy().as_ref(),
                &credentials,
                &library_sync_auth,
            )
            .map_err(std::io::Error::other)?;
            let recovery_sanitize =
                sqlite_recovery::sanitize_app_recovery_snapshot_credentials(&db_path)
                    .map_err(std::io::Error::other)?;
            if credential_migration.bambu_access_codes_migrated > 0
                || credential_migration.bambu_credential_refs_repaired > 0
                || credential_migration.library_device_token_migrated
            {
                eprintln!(
                    "Secure credential migration completed: {} Bambu credential(s), {} repaired reference(s), library client token migrated: {}.",
                    credential_migration.bambu_access_codes_migrated,
                    credential_migration.bambu_credential_refs_repaired,
                    credential_migration.library_device_token_migrated
                );
            }
            if recovery_sanitize.snapshots_sanitized > 0 {
                eprintln!(
                    "Sanitized credentials in {} app recovery snapshot(s).",
                    recovery_sanitize.snapshots_sanitized
                );
            }
            if recovery_sanitize.snapshot_sanitization_failures > 0 {
                eprintln!(
                    "Could not sanitize {} app recovery snapshot(s); they will be retried on the next start.",
                    recovery_sanitize.snapshot_sanitization_failures
                );
            }
            let trusted_lan_runtime = trusted_lan_runtime_commands::load_trusted_lan_runtime(
                db_path.to_string_lossy().as_ref(),
            )?;
            let companion = state::CompanionRuntimeState::new(trusted_lan_runtime);
            let state = AppState {
                db_path: db_path.to_string_lossy().to_string(),
                companion,
                credentials,
                library_sync_auth,
            };
            app.manage(state.clone());
            desktop_lifecycle::initialize(app).map_err(std::io::Error::other)?;

            #[cfg(debug_assertions)]
            apply_visual_qa_window_size(app.handle())?;

            #[cfg(debug_assertions)]
            apply_visual_qa_scenario_url(app)?;

            desktop_lifecycle::start_background_tasks(app).map_err(std::io::Error::other)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            inventory_read_commands::list_spools,
            inventory_location_commands::list_inventory_locations,
            inventory_location_commands::create_inventory_location,
            inventory_location_commands::rename_inventory_location,
            inventory_location_commands::archive_inventory_location,
            inventory_location_commands::restore_inventory_location,
            inventory_location_commands::merge_inventory_locations,
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
            printer_bambu_live_commands::inspect_bambu_live_tls_identity,
            printer_bambu_live_commands::save_bambu_live_integration,
            printer_bambu_live_commands::delete_bambu_live_integration,
            printer_bambu_discovery_commands::discover_bambu_live_printers,
            printer_bambu_discovery_commands::recover_bambu_live_host,
            printer_danger_zone_commands::delete_printer,
            printer_active_commands::set_active_printer,
            set_dock_icon_theme,
            get_app_version,
            packaged_desktop_e2e::get_packaged_desktop_e2e_configuration,
            packaged_desktop_e2e::complete_packaged_desktop_e2e,
            packaged_desktop_e2e::fail_packaged_desktop_e2e,
            desktop_lifecycle::get_desktop_lifecycle_settings,
            desktop_lifecycle::set_continue_in_background,
            desktop_lifecycle::set_launch_at_login,
            desktop_lifecycle::set_desktop_tray_menu_labels,
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
            library_sync_location_commands::fetch_library_sync_locations,
            library_sync_location_commands::fetch_cached_library_sync_locations,
            library_sync_cache_commands::save_library_sync_spool_cache,
            library_sync_read_commands::fetch_library_sync_printer_overview,
            library_sync_read_commands::fetch_library_sync_printer_settings,
            library_sync_cache_commands::fetch_cached_library_sync_printer_overview,
            library_sync_read_commands::fetch_library_sync_loans,
            library_sync_read_commands::fetch_library_sync_filament_consumption,
            library_sync_read_commands::fetch_library_sync_statistics_period_report,
            library_sync_cache_commands::fetch_cached_library_sync_loans,
            library_sync_cache_commands::fetch_cached_library_sync_wishlist,
            library_sync_pairing_commands::pair_library_sync_host,
            library_sync_settings_commands::clear_library_sync_client_auth,
            library_sync_spool_write_commands::create_library_sync_host_spool,
            library_sync_location_commands::create_library_sync_host_location,
            library_sync_location_commands::rename_library_sync_host_location,
            library_sync_location_commands::archive_library_sync_host_location,
            library_sync_location_commands::restore_library_sync_host_location,
            library_sync_location_commands::merge_library_sync_host_locations,
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
            library_sync_printer_write_commands::accept_library_sync_host_bambu_live_weight_estimate,
            library_sync_loan_write_commands::return_library_sync_host_loan,
            library_sync_loan_write_commands::lend_library_sync_host_spool,
            printer_slot_write_commands::assign_printer_slot,
            printer_usage_commands::record_print_usage,
            printer_usage_commands::accept_bambu_live_weight_estimate,
            inventory_update_commands::update_spool_weight,
            inventory_update_commands::update_spool_tare_weight,
            inventory_update_commands::update_spool_status,
            inventory_update_commands::update_spool_details,
            inventory_update_commands::update_active_library_spool_details,
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
            inventory_stats_commands::statistics_period_report,
            document_commands::export_inventory_label_sheet_pdf,
            document_commands::export_label_png,
            external_url_commands::open_external_url,
            release_update_commands::check_for_app_update,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(desktop_lifecycle::handle_run_event);
}

#[cfg(debug_assertions)]
fn normalize_visual_qa_scenario(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "dashboard-overview" | "dashboard" => Some("dashboard-overview"),
        "dashboard-onboarding" | "onboarding" | "getting-started" => Some("dashboard-onboarding"),
        "dashboard-consumption" | "annual-consumption" | "dashboard-usage" => {
            Some("dashboard-consumption")
        }
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
        "printer-overview" | "printers-static" | "printer-summary" => Some("printer-overview"),
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
        "printer-ams-weight-estimate" | "ams-weight-estimate" | "printer-weight-estimate" => {
            Some("printer-ams-weight-estimate")
        }
        "printer-slot-replacement" | "printer-slot-swap" | "slot-replacement" | "slot-swap" => {
            Some("printer-slot-replacement")
        }
        "printer-slot-clear" | "printer-slot-unload" | "slot-clear" | "slot-unload" => {
            Some("printer-slot-clear")
        }
        "bambu-batch-add" | "batch-add" | "bambu-batch" => Some("bambu-batch-add"),
        "settings-general" | "general-settings" => Some("settings-general"),
        "settings-updates" | "update-check" | "settings-update-check" => Some("settings-updates"),
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

#[cfg(any(test, all(debug_assertions, target_os = "macos")))]
fn visual_qa_window_origin(
    visible_x: f64,
    visible_y: f64,
    visible_width: f64,
    visible_height: f64,
    window_width: f64,
    window_height: f64,
) -> Option<(f64, f64)> {
    let values = [
        visible_x,
        visible_y,
        visible_width,
        visible_height,
        window_width,
        window_height,
    ];
    if values.iter().any(|value| !value.is_finite())
        || visible_width <= 0.0
        || visible_height <= 0.0
        || window_width <= 0.0
        || window_height <= 0.0
        || window_width > visible_width
        || window_height > visible_height
    {
        return None;
    }

    let horizontal_inset =
        ((visible_width - window_width) / 2.0).clamp(0.0, VISUAL_QA_WINDOW_EDGE_INSET);
    let vertical_inset =
        ((visible_height - window_height) / 2.0).clamp(0.0, VISUAL_QA_WINDOW_EDGE_INSET);
    Some((
        visible_x + horizontal_inset,
        visible_y + visible_height - window_height - vertical_inset,
    ))
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
    let screen = native_window
        .screen()
        .ok_or_else(|| "Desktop visual QA window is not attached to a screen".to_string())?;
    let visible_frame = screen.visibleFrame();
    let (origin_x, origin_y) = visual_qa_window_origin(
        visible_frame.origin.x,
        visible_frame.origin.y,
        visible_frame.size.width,
        visible_frame.size.height,
        width,
        height,
    )
    .ok_or_else(|| "Desktop visual QA window does not fit on the visible screen".to_string())?;
    let mut frame = native_window.frame();
    frame.origin.x = origin_x;
    frame.origin.y = origin_y;
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
