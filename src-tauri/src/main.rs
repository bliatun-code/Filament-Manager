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
mod library_sync_commands;
mod security;
mod state;
mod trusted_lan_commands;

use app_services::CompanionService;
use backend::filament_database::{
    ActiveSpoolLoanRow, BackupValidationStats, BambuLiveIntegrationEntryRow,
    BambuLiveIntegrationRow, CatalogResetStats, FilamentDatabase, FilamentMasterCatalogRow,
    ImportDataStats, LoanUsageByPersonRow, PrinterOverviewRow, PrinterRow, SpoolHistoryEventRow,
    SpoolLoanDetailsRow, SpoolLoanRow, SpoolUsagePointRow, SpoolWithMasterRow, WishlistItemRow,
};
use backend::inventory_engine::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput,
    CreateWishlistItemInput, DeleteSpoolInput, InventoryEngine, LendSpoolInput, PurgeSpoolInput,
    RecordPrintUsageInput, ReturnSpoolLoanInput, ScanSource, UpdateMasterCatalogEntryInput,
    UpdateSpoolDetailsInput, UpdateSpoolRfidTagInput, UpdateWishlistStatusInput, WeightSource,
};
use backend::statistics::{
    FilamentConsumptionRow, InventoryOverview, MaterialUsageRow, StatisticsEngine,
};
use base64::Engine;
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use serde::{Deserialize, Serialize};
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
#[derive(Serialize, Deserialize)]
struct ScanPayload {
    qr_code: Option<String>,
    detected_color_hex: Option<String>,
    source: Option<String>,
}

#[derive(Serialize)]
struct ExportPayload {
    content: String,
}

#[derive(Serialize, Deserialize)]
pub(crate) struct PrinterSettingsSnapshot {
    active_printer_id: Option<String>,
    printers: Vec<PrinterRow>,
    printer_models: Vec<String>,
    bambu_live_integrations: Vec<BambuLiveIntegrationEntryRow>,
}

#[derive(Serialize, Deserialize)]
struct SaveBambuLiveIntegrationInput {
    printer_id: String,
    enabled: bool,
    host: Option<String>,
    access_code: Option<String>,
    printer_serial: Option<String>,
}

#[tauri::command]
fn list_spools(
    state: tauri::State<'_, AppState>,
    limit: i64,
    offset: i64,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    companion_service(&state)
        .list_spools(limit, offset)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_wishlist_items(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<WishlistItemRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_inventory(&state, |engine| engine.list_wishlist_items(capped))
}

#[tauri::command]
fn get_printer_settings(
    state: tauri::State<'_, AppState>,
) -> Result<PrinterSettingsSnapshot, String> {
    let bambu_live_integrations = with_db(&state, |db| db.list_bambu_live_integrations())?;
    with_inventory(&state, |engine| {
        Ok(PrinterSettingsSnapshot {
            active_printer_id: engine.get_active_printer()?,
            printers: engine.list_printers()?,
            printer_models: supported_printer_models(),
            bambu_live_integrations,
        })
    })
}

#[tauri::command]
fn list_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PrinterOverviewRow>, String> {
    companion_service(&state)
        .list_printer_overview()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn create_printer(
    state: tauri::State<'_, AppState>,
    input: CreatePrinterInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_printer(input))
}

#[tauri::command]
fn save_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    input: SaveBambuLiveIntegrationInput,
) -> Result<(), String> {
    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    with_inventory(&state, |engine| {
        let exists = engine
            .list_printers()?
            .into_iter()
            .any(|printer| printer.id == printer_id);
        if !exists {
            return Err(crate::backend::filament_database::InventoryError::NotFound);
        }
        Ok(())
    })?;
    with_db(&state, |db| {
        db.save_bambu_live_integration(
            printer_id,
            &BambuLiveIntegrationRow {
                enabled: input.enabled,
                host: input
                    .host
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                access_code: input
                    .access_code
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                printer_serial: input
                    .printer_serial
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                last_error: None,
                observed_state: None,
            },
        )
    })
}

#[tauri::command]
fn delete_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    with_db(&state, |db| db.delete_bambu_live_integration(&printer_id))
}

#[tauri::command]
fn delete_printer(state: tauri::State<'_, AppState>, printer_id: String) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_printer(&printer_id))
}

#[tauri::command]
fn set_active_printer(
    state: tauri::State<'_, AppState>,
    printer_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.set_active_printer(printer_id.as_deref())
    })
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
fn assign_printer_slot(
    state: tauri::State<'_, AppState>,
    input: AssignPrinterSlotInput,
) -> Result<(), String> {
    companion_service(&state)
        .assign_printer_slot(
            input.printer_id.trim(),
            input.slot_id.trim(),
            input
                .spool_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_tray_uuid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input.clear_live_cache_before_next_refresh.unwrap_or(false),
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn record_print_usage(
    state: tauri::State<'_, AppState>,
    input: RecordPrintUsageInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.record_print_usage(input))
}

#[tauri::command]
fn reset_app_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_inventory(&state, |engine| engine.reset_app_state())
}

#[tauri::command]
fn reset_catalog_data(state: tauri::State<'_, AppState>) -> Result<CatalogResetStats, String> {
    with_inventory(&state, |engine| engine.reset_catalogs())
}

#[tauri::command]
fn list_master_catalog(
    state: tauri::State<'_, AppState>,
    limit: i64,
    search: Option<String>,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    with_db(&state, |db| {
        db.list_master_catalog(limit, search.as_deref())
    })
}

#[tauri::command]
fn create_spool(state: tauri::State<'_, AppState>, input: CreateSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_spool(input))
}

#[tauri::command]
fn create_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: CreateWishlistItemInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_wishlist_item(input))
}

#[tauri::command]
fn create_manual_spool(
    state: tauri::State<'_, AppState>,
    input: CreateManualSpoolInput,
) -> Result<(), String> {
    companion_service(&state)
        .create_manual_spool(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_weight(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    grams: i64,
    scale_id: Option<String>,
    source: Option<String>,
) -> Result<(), String> {
    let weight_source = match source.as_deref() {
        Some("AUTO") => WeightSource::Auto,
        _ => WeightSource::Manual,
    };
    companion_service(&state)
        .update_spool_weight(&spool_id, grams, scale_id.as_deref(), weight_source)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    grams: i64,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_tare_weight(&spool_id, grams)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_status(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    status: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.update_spool_status(&spool_id, &status)
    })
}

#[tauri::command]
fn update_spool_details(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolDetailsInput,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_details(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolRfidTagInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_spool_rfid_tag(input))
}

#[tauri::command]
fn update_master_catalog_entry(
    state: tauri::State<'_, AppState>,
    input: UpdateMasterCatalogEntryInput,
) -> Result<String, String> {
    with_inventory(&state, |engine| engine.update_master_catalog_entry(input))
}

#[tauri::command]
fn delete_spool(state: tauri::State<'_, AppState>, input: DeleteSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_spool(input))
}

#[tauri::command]
fn purge_spool(state: tauri::State<'_, AppState>, input: PurgeSpoolInput) -> Result<(), String> {
    with_inventory(&state, |engine| engine.purge_spool(input))
}

#[tauri::command]
fn list_spool_history(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolHistoryEventRow>, String> {
    let capped = limit.unwrap_or(50).clamp(1, 250);
    companion_service(&state)
        .list_spool_history(&spool_id, capped)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_spool_usage(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    limit: Option<i64>,
) -> Result<Vec<SpoolUsagePointRow>, String> {
    let capped = limit.unwrap_or(300).clamp(1, 1_000);
    companion_service(&state)
        .list_spool_usage(&spool_id, capped)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_active_spool_loans(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ActiveSpoolLoanRow>, String> {
    companion_service(&state)
        .list_active_spool_loans()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn list_loan_usage_by_person(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    direction: Option<String>,
) -> Result<Vec<LoanUsageByPersonRow>, String> {
    let capped = limit.unwrap_or(30).clamp(1, 200);
    with_inventory(&state, |engine| {
        engine.list_loan_usage_by_person(capped, direction.as_deref())
    })
}

#[tauri::command]
fn list_spool_loans(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    include_returned: Option<bool>,
    direction: Option<String>,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 10_000);
    companion_service(&state)
        .list_spool_loans(
            capped,
            include_returned.unwrap_or(true),
            direction.as_deref(),
        )
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn update_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: UpdateWishlistStatusInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_wishlist_item_status(input))
}

#[tauri::command]
fn lend_spool(
    state: tauri::State<'_, AppState>,
    input: LendSpoolInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .lend_spool(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn return_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn return_inbound_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_inbound_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn export_loans_csv(
    state: tauri::State<'_, AppState>,
    include_returned: Option<bool>,
    direction: Option<String>,
) -> Result<ExportPayload, String> {
    let content = with_inventory(&state, |engine| {
        engine
            .export_loans_csv_for_direction(include_returned.unwrap_or(true), direction.as_deref())
    })?;
    Ok(ExportPayload { content })
}

#[tauri::command]
fn delete_wishlist_item(state: tauri::State<'_, AppState>, item_id: String) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_wishlist_item(&item_id))
}

#[tauri::command]
fn assign_location(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    location_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.assign_location(&spool_id, location_id.as_deref())
    })
}

#[tauri::command]
fn find_spool_by_qr(
    state: tauri::State<'_, AppState>,
    qr_code: String,
) -> Result<Option<backend::filament_database::SpoolRow>, String> {
    companion_service(&state)
        .find_spool_row_by_qr_or_id(&qr_code)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
fn record_scan_event(
    state: tauri::State<'_, AppState>,
    payload: ScanPayload,
) -> Result<(), String> {
    let source = match payload.source.as_deref() {
        Some("MOBILE") => ScanSource::Mobile,
        _ => ScanSource::Desktop,
    };
    with_inventory(&state, |engine| {
        engine.record_scan(
            None,
            payload.qr_code.as_deref(),
            source,
            payload.detected_color_hex.as_deref(),
        )
    })
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
fn inventory_overview(state: tauri::State<'_, AppState>) -> Result<InventoryOverview, String> {
    with_stats(&state, |stats| stats.inventory_overview())
}

#[tauri::command]
fn top_materials(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<MaterialUsageRow>, String> {
    with_stats(&state, |stats| stats.top_materials(limit))
}

#[tauri::command]
fn list_filament_consumption(
    state: tauri::State<'_, AppState>,
    limit: Option<i64>,
    printer_id: Option<String>,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let capped = limit.unwrap_or(500).clamp(1, 2_000);
    with_stats(&state, |stats| {
        stats.filament_consumption(capped, printer_id.as_deref())
    })
}

#[tauri::command]
fn check_low_stock(state: tauri::State<'_, AppState>, threshold: i64) -> Result<usize, String> {
    with_inventory(&state, |engine| engine.check_low_stock_alerts(threshold))
}

#[tauri::command]
fn enqueue_sync_action(
    state: tauri::State<'_, AppState>,
    action_type: String,
    payload_json: String,
) -> Result<String, String> {
    with_inventory(&state, |engine| {
        engine.enqueue_sync_action(&action_type, &payload_json)
    })
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
            list_spools,
            list_wishlist_items,
            get_printer_settings,
            list_printer_overview,
            trusted_lan_commands::get_trusted_lan_companion_status,
            trusted_lan_commands::list_trusted_lan_interfaces,
            trusted_lan_commands::update_trusted_lan_companion_config,
            trusted_lan_commands::create_trusted_lan_pairing,
            trusted_lan_commands::list_trusted_lan_paired_browsers,
            trusted_lan_commands::revoke_trusted_lan_paired_browser,
            trusted_lan_commands::revoke_all_trusted_lan_paired_browsers,
            list_master_catalog,
            catalog_commands::refresh_bambu_catalog,
            catalog_commands::refresh_esun_catalog,
            catalog_commands::esun_search_filaments,
            catalog_commands::esun_fetch_product_detail,
            create_spool,
            create_wishlist_item,
            create_manual_spool,
            create_printer,
            save_bambu_live_integration,
            delete_bambu_live_integration,
            delete_printer,
            set_active_printer,
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
            assign_printer_slot,
            record_print_usage,
            update_spool_weight,
            update_spool_tare_weight,
            update_spool_status,
            update_spool_details,
            update_spool_rfid_tag,
            update_master_catalog_entry,
            delete_spool,
            purge_spool,
            list_spool_history,
            list_spool_usage,
            list_active_spool_loans,
            list_loan_usage_by_person,
            list_spool_loans,
            update_wishlist_item_status,
            delete_wishlist_item,
            lend_spool,
            return_spool_loan,
            return_inbound_spool_loan,
            export_loans_csv,
            assign_location,
            find_spool_by_qr,
            record_scan_event,
            export_inventory_csv,
            export_inventory_json,
            export_full_backup_json,
            import_full_backup_json,
            import_data_file,
            validate_full_backup_json,
            inventory_overview,
            reset_app_data,
            reset_catalog_data,
            top_materials,
            list_filament_consumption,
            check_low_stock,
            enqueue_sync_action,
            print_label_html,
            print_label_pdf,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn supported_printer_models() -> Vec<String> {
    vec![
        "Bambu Lab X1 Carbon",
        "Bambu Lab X1E",
        "Bambu Lab P1S",
        "Bambu Lab P1P",
        "Bambu Lab A1",
        "Bambu Lab A1 mini",
        "Bambu Lab H2D",
        "Prusa CORE One",
        "Prusa CORE One+",
        "Prusa XL",
        "Prusa XL (Single Toolhead)",
        "Prusa XL (Dual Toolhead)",
        "Prusa XL (Five Toolhead)",
        "Prusa MK4S",
        "Prusa MK4",
        "Prusa MK3.9S",
        "Prusa MK3.9",
        "Prusa MK3.5S",
        "Prusa MK3.5",
        "Prusa MINI+",
        "Prusa i3 MK3S+",
        "Creality K1",
        "Creality K1 Max",
        "Anycubic Kobra 2",
        "Custom model",
    ]
    .into_iter()
    .map(String::from)
    .collect()
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

fn companion_service(state: &AppState) -> CompanionService {
    CompanionService::new(state.db_path.clone())
}

fn inventory_error_to_string(error: backend::filament_database::InventoryError) -> String {
    format!("{error:?}")
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

fn with_stats<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
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
