#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_services;
mod backend;
mod companion_api;
mod state;

use app_services::CompanionService;
use backend::filament_database::{
    ActiveSpoolLoanRow, BackupValidationStats, CatalogResetStats, FilamentDatabase,
    FilamentMasterCatalogRow, ImportDataStats, LoanUsageByPersonRow, PrinterOverviewRow,
    PrinterRow, SpoolHistoryEventRow, SpoolLoanDetailsRow, SpoolLoanRow, SpoolUsagePointRow,
    SpoolWithMasterRow, TrustedLanPairedBrowserRow, TrustedLanSettingsRow, WishlistItemRow,
};
use backend::inventory_engine::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput,
    CreateWishlistItemInput, DeleteSpoolInput, InventoryEngine, LendSpoolInput, PurgeSpoolInput,
    RecordPrintUsageInput, ReturnSpoolLoanInput, ScanSource, UpdateMasterCatalogEntryInput,
    UpdateSpoolDetailsInput, UpdateWishlistStatusInput, WeightSource,
};
use backend::statistics::{
    FilamentConsumptionRow, InventoryOverview, MaterialUsageRow, StatisticsEngine,
};
use backend::vendor_lookup::{EsunProductDetail, EsunSearchResult};
#[cfg(target_os = "macos")]
use objc2::{AnyThread, MainThreadMarker};
#[cfg(target_os = "macos")]
use objc2_app_kit::{NSApp, NSImage};
#[cfg(target_os = "macos")]
use objc2_foundation::NSData;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use state::{AppState, TrustedLanCompanionRuntime, TrustedLanCompanionRuntimeSnapshot};
#[cfg(target_os = "macos")]
use std::ffi::c_void;
use base64::Engine;
use std::net::IpAddr;
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Emitter, Manager};

#[cfg(target_os = "macos")]
const DOCK_ICON_LIGHT_BYTES: &[u8] = include_bytes!("../icons/dock-light.png");
#[cfg(target_os = "macos")]
const DOCK_ICON_DARK_BYTES: &[u8] = include_bytes!("../icons/dock-dark.png");
const TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS: u64 = 10 * 60;

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
struct CatalogRefreshResult {
    imported: i64,
    detected_store: Option<String>,
    detected_collection: Option<String>,
    reactivated_count: i64,
    discontinued_count: i64,
    output: String,
}

#[derive(Serialize, Clone)]
struct CatalogRefreshProgressEvent {
    vendor: String,
    phase: String,
    message: String,
}

#[derive(Serialize)]
struct PrinterSettingsSnapshot {
    active_printer_id: Option<String>,
    printers: Vec<PrinterRow>,
    printer_models: Vec<String>,
}

#[derive(Deserialize)]
struct CompanionHealthCheckResponse {
    ok: bool,
    api_version: String,
    auth_mode: String,
}

#[derive(Serialize)]
struct TrustedLanInterfaceOption {
    name: String,
    address: String,
    label: String,
}

#[derive(Deserialize)]
struct UpdateTrustedLanCompanionConfigInput {
    enabled: bool,
    selected_interface_name: Option<String>,
    selected_interface_address: Option<String>,
    listen_port: Option<u16>,
}

#[derive(Serialize)]
struct TrustedLanPairingLink {
    pairing_url: String,
    expires_in_seconds: u64,
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
    with_inventory(&state, |engine| {
        Ok(PrinterSettingsSnapshot {
            active_printer_id: engine.get_active_printer()?,
            printers: engine.list_printers()?,
            printer_models: supported_printer_models(),
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
        return apply_macos_dock_icon(&app, icon_bytes);
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
async fn refresh_bambu_catalog(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    material_types: Option<Vec<String>>,
) -> Result<CatalogRefreshResult, String> {
    emit_catalog_refresh_progress(
        Some(&app),
        "Bambu",
        "PREPARE",
        "Preparing Bambu catalog refresh...",
    );

    let db_path = state.db_path.clone();
    let app_for_worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            refresh_bambu_catalog_blocking(&db_path, material_types, Some(&app_for_worker))
        }))
    })
    .await
    .map_err(|error| format!("Catalog refresh task failed: {error}"))?;

    let result: Result<CatalogRefreshResult, String> = match result {
        Ok(inner) => inner,
        Err(panic_payload) => {
            let panic_message = if let Some(message) = panic_payload.downcast_ref::<&str>() {
                (*message).to_string()
            } else if let Some(message) = panic_payload.downcast_ref::<String>() {
                message.clone()
            } else {
                "unknown panic payload".to_string()
            };
            Err(format!("Bambu refresh panicked: {panic_message}"))
        }
    };

    match &result {
        Ok(_) => emit_catalog_refresh_progress(
            Some(&app),
            "Bambu",
            "DONE",
            "Bambu catalog refresh completed.",
        ),
        Err(message) => emit_catalog_refresh_progress(
            Some(&app),
            "Bambu",
            "FAILED",
            &format!("Bambu refresh failed: {message}"),
        ),
    }

    match result {
        Ok(summary) => Ok(summary),
        Err(message) => Ok(CatalogRefreshResult {
            imported: 0,
            detected_store: None,
            detected_collection: None,
            reactivated_count: 0,
            discontinued_count: 0,
            output: format!(
                "Bambu refresh failed before completion.\n{message}\n\nCatalog lifecycle update:\nVendor: Bambu\nDiscontinued handling: skipped (refresh failed)\nReactivated: 0\nMarked discontinued: 0\n"
            ),
        }),
    }
}

#[tauri::command]
async fn refresh_esun_catalog(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    material_types: Option<Vec<String>>,
) -> Result<CatalogRefreshResult, String> {
    emit_catalog_refresh_progress(
        Some(&app),
        "eSUN",
        "PREPARE",
        "Preparing eSUN catalog refresh...",
    );

    let db_path = state.db_path.clone();
    let app_for_worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            refresh_esun_catalog_blocking(&db_path, material_types, Some(&app_for_worker))
        }))
    })
    .await
    .map_err(|error| format!("Catalog refresh task failed: {error}"))?;

    let result: Result<CatalogRefreshResult, String> = match result {
        Ok(inner) => inner,
        Err(panic_payload) => {
            let panic_message = if let Some(message) = panic_payload.downcast_ref::<&str>() {
                (*message).to_string()
            } else if let Some(message) = panic_payload.downcast_ref::<String>() {
                message.clone()
            } else {
                "unknown panic payload".to_string()
            };
            Err(format!("eSUN refresh panicked: {panic_message}"))
        }
    };

    match &result {
        Ok(_) => emit_catalog_refresh_progress(
            Some(&app),
            "eSUN",
            "DONE",
            "eSUN catalog refresh completed.",
        ),
        Err(message) => emit_catalog_refresh_progress(
            Some(&app),
            "eSUN",
            "FAILED",
            &format!("eSUN refresh failed: {message}"),
        ),
    }

    match result {
        Ok(summary) => Ok(summary),
        Err(message) => Ok(CatalogRefreshResult {
            imported: 0,
            detected_store: None,
            detected_collection: None,
            reactivated_count: 0,
            discontinued_count: 0,
            output: format!(
                "eSUN refresh failed before completion.\n{message}\n\nCatalog lifecycle update:\nVendor: eSUN\nDiscontinued handling: skipped (refresh failed)\nReactivated: 0\nMarked discontinued: 0\n"
            ),
        }),
    }
}

fn refresh_bambu_catalog_blocking(
    db_path: &str,
    material_types: Option<Vec<String>>,
    app: Option<&tauri::AppHandle>,
) -> Result<CatalogRefreshResult, String> {
    let material_types = normalize_material_filters(material_types);
    let refresh_started_at = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.ensure_catalog_lifecycle_columns()
            .map_err(|error| format!("{:?}", error))?;
        db.sqlite_now().map_err(|error| format!("{:?}", error))?
    };

    emit_catalog_refresh_progress(
        app,
        "Bambu",
        "FETCH",
        if material_types.is_empty() {
            "Fetching Bambu product catalog..."
        } else {
            "Fetching filtered Bambu product catalog..."
        },
    );

    let snapshot = match backend::bambu_lookup::refresh_bambu_catalog_snapshot(
        if material_types.is_empty() {
            None
        } else {
            Some(material_types.clone())
        },
    ) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return Ok(CatalogRefreshResult {
                imported: 0,
                detected_store: None,
                detected_collection: None,
                reactivated_count: 0,
                discontinued_count: 0,
                output: format!(
                    "Remote Bambu refresh source was unavailable.\n{error}\nLocal Bambu catalog was left unchanged.\n\nCatalog lifecycle update:\nVendor: Bambu\nDiscontinued handling: skipped (source unavailable)\nReactivated: 0\nMarked discontinued: 0\n"
                ),
            });
        }
    };

    emit_catalog_refresh_progress(
        app,
        "Bambu",
        "IMPORT",
        "Importing Bambu catalog into local database...",
    );
    let (imported, skipped_invalid_entries, skipped_invalid_samples) = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let mut processed = 0i64;
        let mut skipped_invalid = 0i64;
        let mut skipped_samples: Vec<String> = Vec::new();
        for entry in &snapshot.entries {
            let material = entry.material.trim();
            let filament_name = entry.filament_name.trim();
            let color_name = entry.color_name.trim();
            if material.is_empty() || filament_name.is_empty() || color_name.is_empty() {
                skipped_invalid += 1;
                if skipped_samples.len() < 8 {
                    skipped_samples.push(format!(
                        "material='{}' filament='{}' color='{}' url='{}'",
                        material, filament_name, color_name, entry.product_url
                    ));
                }
                continue;
            }
            db.upsert_manual_master(
                material,
                filament_name,
                color_name,
                entry.hex_color.as_deref(),
                Some(&entry.product_url),
                Some("Bambu"),
                Some(entry.default_weight_g),
            )
            .map_err(|error| format!("{:?}", error))?;
            processed += 1;
            if processed % 25 == 0 {
                emit_catalog_refresh_progress(
                    app,
                    "Bambu",
                    "IMPORT",
                    &format!(
                        "Importing Bambu catalog into local database... {processed}/{}",
                        snapshot.entries.len()
                    ),
                );
            }
        }
        (processed, skipped_invalid, skipped_samples)
    };

    let mut output = format!(
        "Detected store: {}\nDetected collection: {}\nProducts discovered: {}\nProducts detailed: {}\nAnti-bot blocks: {}\nImported {} entries.\nSkipped invalid entries: {}\n",
        snapshot.detected_store,
        snapshot.detected_collection,
        snapshot.products_discovered,
        snapshot.products_detailed,
        snapshot.anti_bot_blocks,
        imported,
        skipped_invalid_entries
    );
    if !material_types.is_empty() {
        output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
    }
    if snapshot.partial {
        output.push_str("Refresh quality: partial\n");
    }
    if !snapshot.warnings.is_empty() {
        output.push_str("\nWarnings:\n");
        output.push_str(&snapshot.warnings.join("\n"));
        output.push('\n');
    }
    if !skipped_invalid_samples.is_empty() {
        output.push_str("\nInvalid rows (sample):\n");
        for sample in &skipped_invalid_samples {
            output.push_str("- ");
            output.push_str(sample);
            output.push('\n');
        }
    }

    let skip_discontinued_reason = if material_types.is_empty() {
        detect_bambu_skip_discontinued_reason(&output, imported)
    } else {
        Some(format!(
            "material-filtered refresh ({})",
            material_types.join(", ")
        ))
    };
    let (reactivated_count, discontinued_count) = if let Some(reason) = &skip_discontinued_reason {
        emit_catalog_refresh_progress(
            app,
            "Bambu",
            "DISCONTINUED",
            &format!(
                "Skipping Bambu discontinued update ({reason}). Previous flags are preserved."
            ),
        );
        (0, 0)
    } else {
        emit_catalog_refresh_progress(
            app,
            "Bambu",
            "DISCONTINUED",
            "Applying Bambu discontinued/reactivated status...",
        );
        let stats = {
            let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
            db.apply_bambu_discontinued_rules(&refresh_started_at)
                .map_err(|error| format!("{:?}", error))?
        };
        (stats.reactivated_count, stats.discontinued_count)
    };
    output.push_str("\nCatalog lifecycle update:\nVendor: Bambu\n");
    if !material_types.is_empty() {
        output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
    }
    if let Some(reason) = skip_discontinued_reason {
        output.push_str(&format!(
            "Discontinued handling: skipped ({reason})\nPrevious discontinued flags were preserved.\n"
        ));
    } else {
        output.push_str("Discontinued handling: applied\n");
    }
    output.push_str(&format!(
        "Reactivated: {}\nMarked discontinued: {}\n",
        reactivated_count, discontinued_count
    ));

    Ok(CatalogRefreshResult {
        imported,
        detected_store: Some(snapshot.detected_store),
        detected_collection: Some(snapshot.detected_collection),
        reactivated_count,
        discontinued_count,
        output,
    })
}

fn refresh_esun_catalog_blocking(
    db_path: &str,
    material_types: Option<Vec<String>>,
    app: Option<&tauri::AppHandle>,
) -> Result<CatalogRefreshResult, String> {
    let material_types = normalize_material_filters(material_types);
    let refresh_started_at = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.ensure_catalog_lifecycle_columns()
            .map_err(|error| format!("{:?}", error))?;
        db.sqlite_now().map_err(|error| format!("{:?}", error))?
    };

    emit_catalog_refresh_progress(app, "eSUN", "FETCH", "Fetching eSUN product catalog...");
    let snapshot = match backend::vendor_lookup::refresh_esun_catalog_snapshot(
        if material_types.is_empty() {
            None
        } else {
            Some(material_types.clone())
        },
    ) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return Ok(CatalogRefreshResult {
                imported: 0,
                detected_store: None,
                detected_collection: None,
                reactivated_count: 0,
                discontinued_count: 0,
                output: format!(
                    "Remote eSUN refresh source was unavailable.\n{error}\nLocal eSUN catalog was left unchanged.\n\nCatalog lifecycle update:\nVendor: eSUN\nDiscontinued handling: skipped (source unavailable)\nReactivated: 0\nMarked discontinued: 0\n"
                ),
            });
        }
    };

    emit_catalog_refresh_progress(
        app,
        "eSUN",
        "IMPORT",
        "Importing eSUN catalog into local database...",
    );
    let imported = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let mut processed = 0i64;
        for entry in &snapshot.entries {
            db.upsert_manual_master(
                &entry.material,
                &entry.filament_name,
                &entry.color_name,
                entry.hex_color.as_deref(),
                Some(&entry.product_url),
                Some("eSUN"),
                Some(entry.default_weight_g),
            )
            .map_err(|error| format!("{:?}", error))?;
            processed += 1;
            if processed % 25 == 0 {
                emit_catalog_refresh_progress(
                    app,
                    "eSUN",
                    "IMPORT",
                    &format!(
                        "Importing eSUN catalog into local database... {processed}/{}",
                        snapshot.entries.len()
                    ),
                );
            }
        }
        processed
    };

    emit_catalog_refresh_progress(
        app,
        "eSUN",
        "CLEANUP",
        "Normalizing existing eSUN colors in local catalog...",
    );
    let cleanup_stats = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.normalize_esun_catalog_colors()
            .map_err(|error| format!("{:?}", error))?
    };

    let skip_discontinued_reason = if !material_types.is_empty() {
        Some(format!(
            "material-filtered refresh ({})",
            material_types.join(", ")
        ))
    } else if snapshot.detected_store != "https://esun3dstore.com" {
        Some("fallback source was used".to_string())
    } else if !snapshot.warnings.is_empty() {
        Some("refresh had warnings/errors from source".to_string())
    } else {
        None
    };
    let should_apply_discontinued = skip_discontinued_reason.is_none();
    let (reactivated_count, discontinued_count) = if should_apply_discontinued {
        emit_catalog_refresh_progress(
            app,
            "eSUN",
            "DISCONTINUED",
            "Applying eSUN discontinued/reactivated status...",
        );
        let stats = {
            let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
            db.apply_vendor_discontinued_rules("eSUN", &refresh_started_at)
                .map_err(|error| format!("{:?}", error))?
        };
        (stats.reactivated_count, stats.discontinued_count)
    } else {
        (0, 0)
    };

    let mut output = format!(
        "Detected store: {}\nDetected collection: {}\nHandles discovered: {}\nProducts processed: {}\nSkipped non-filament: {}\nImported {} entries.\n",
        snapshot.detected_store,
        snapshot.detected_collection,
        snapshot.handles_found,
        snapshot.products_processed,
        snapshot.skipped_non_filament,
        imported
    );
    if !material_types.is_empty() {
        output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
    }
    if !snapshot.warnings.is_empty() {
        output.push_str("\nWarnings:\n");
        output.push_str(&snapshot.warnings.join("\n"));
    }
    output.push_str("\n\nCatalog lifecycle update:\nVendor: eSUN\n");
    output.push_str(&format!(
        "Local color normalization:\nScanned: {}\nNormalized: {}\nMerged duplicates: {}\nSkipped vendor conflicts: {}\n",
        cleanup_stats.scanned_count,
        cleanup_stats.normalized_count,
        cleanup_stats.merged_count,
        cleanup_stats.skipped_conflicts
    ));
    if let Some(reason) = skip_discontinued_reason {
        output.push_str(&format!(
            "Discontinued handling: skipped ({})\nPrevious discontinued flags were preserved.\n",
            reason
        ));
    } else {
        output.push_str("Discontinued handling: applied\n");
    }
    output.push_str(&format!(
        "Reactivated: {}\nMarked discontinued: {}\n",
        reactivated_count, discontinued_count
    ));

    Ok(CatalogRefreshResult {
        imported,
        detected_store: Some(snapshot.detected_store),
        detected_collection: Some(snapshot.detected_collection),
        reactivated_count,
        discontinued_count,
        output,
    })
}

fn normalize_material_filters(material_types: Option<Vec<String>>) -> Vec<String> {
    let mut values: Vec<String> = material_types
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_uppercase())
        .filter(|value| !value.is_empty())
        .collect();
    values.sort();
    values.dedup();
    values
}

fn emit_catalog_refresh_progress(
    app: Option<&tauri::AppHandle>,
    vendor: &str,
    phase: &str,
    message: &str,
) {
    if let Some(app_handle) = app {
        let payload = CatalogRefreshProgressEvent {
            vendor: vendor.to_string(),
            phase: phase.to_string(),
            message: message.to_string(),
        };
        let _ = app_handle.emit("catalog_refresh_progress", payload);
    }
}

#[tauri::command]
fn esun_search_filaments(
    query: String,
    limit: Option<i64>,
) -> Result<Vec<EsunSearchResult>, String> {
    let bounded = limit.unwrap_or(12).clamp(1, 50) as usize;
    backend::vendor_lookup::search_esun_filaments(&query, bounded)
}

#[tauri::command]
fn esun_fetch_product_detail(handle: String) -> Result<EsunProductDetail, String> {
    backend::vendor_lookup::fetch_esun_product_detail(&handle)
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
fn get_trusted_lan_companion_status(
    state: tauri::State<'_, AppState>,
) -> Result<TrustedLanCompanionRuntimeSnapshot, String> {
    Ok(trusted_lan_server_status_snapshot(
        &state.companion.trusted_lan,
    ))
}

#[tauri::command]
fn list_trusted_lan_interfaces() -> Result<Vec<TrustedLanInterfaceOption>, String> {
    Ok(list_private_trusted_lan_interfaces())
}

#[tauri::command]
async fn update_trusted_lan_companion_config(
    state: tauri::State<'_, AppState>,
    input: UpdateTrustedLanCompanionConfigInput,
) -> Result<TrustedLanCompanionRuntimeSnapshot, String> {
    let selected_interface = normalize_trusted_lan_interface_selection(
        input.selected_interface_name.as_deref(),
        input.selected_interface_address.as_deref(),
    );
    if input.enabled && selected_interface.is_none() {
        return Err(
            "Select one private LAN interface before enabling trusted-LAN access.".to_string(),
        );
    }

    if input.enabled {
        if let Some((_, address)) = selected_interface.as_ref() {
            ensure_private_trusted_lan_interface(address)?;
        }
    }

    let settings = TrustedLanSettingsRow {
        enabled: input.enabled,
        selected_interface_name: selected_interface.as_ref().map(|value| value.0.clone()),
        selected_interface_address: selected_interface.as_ref().map(|value| value.1.clone()),
        listen_port: input
            .listen_port
            .filter(|value| *value > 0)
            .unwrap_or(companion_api::COMPANION_DEFAULT_PORT),
    };
    with_db(&state, |db| db.save_trusted_lan_settings(&settings))?;
    state.companion.trusted_lan.apply_config(
        settings.enabled,
        selected_interface,
        settings.listen_port,
    );
    companion_api::reconcile_trusted_lan_server(state.inner().clone()).await?;
    Ok(state.companion.trusted_lan.snapshot())
}

#[tauri::command]
fn create_trusted_lan_pairing(
    state: tauri::State<'_, AppState>,
    browser_label: Option<String>,
) -> Result<TrustedLanPairingLink, String> {
    let status = trusted_lan_server_status_snapshot(&state.companion.trusted_lan);
    if !status.enabled {
        return Err("Trusted-LAN companion access is disabled.".to_string());
    }
    if !status.running || !status.shell_reachable {
        return Err(status.health_error.unwrap_or_else(|| {
            "Trusted-LAN companion is not ready yet. Refresh status and try again.".to_string()
        }));
    }

    let pairing_token = companion_api::generate_pairing_token();
    let pairing_token_hash = hash_secret(&pairing_token);
    with_db(&state, |db| {
        db.create_trusted_lan_pairing(
            browser_label.as_deref(),
            &pairing_token_hash,
            TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS,
        )?;
        Ok(())
    })?;

    let shell_url = status
        .shell_url
        .ok_or_else(|| "Trusted-LAN shell URL is not available.".to_string())?;
    Ok(TrustedLanPairingLink {
        pairing_url: format!(
            "{}?pairing={}",
            shell_url.trim_end_matches('/'),
            pairing_token
        ),
        expires_in_seconds: TRUSTED_LAN_PAIRING_MAX_AGE_SECONDS,
    })
}

#[tauri::command]
fn list_trusted_lan_paired_browsers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TrustedLanPairedBrowserRow>, String> {
    with_db(&state, |db| db.list_trusted_lan_paired_browsers())
}

#[tauri::command]
fn revoke_trusted_lan_paired_browser(
    state: tauri::State<'_, AppState>,
    browser_id: String,
) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_trusted_lan_paired_browser(&browser_id)
    })
}

#[tauri::command]
fn revoke_all_trusted_lan_paired_browsers(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_db(&state, |db| {
        db.revoke_all_trusted_lan_paired_browsers().map(|_| ())
    })
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
        .find_spool_row_by_qr(&qr_code)
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

    open::that(path).map_err(|error| error.to_string())?;
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

    open::that(path).map_err(|error| error.to_string())?;
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
            let trusted_lan_runtime = load_trusted_lan_runtime(db_path.to_string_lossy().as_ref())?;
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

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_spools,
            list_wishlist_items,
            get_printer_settings,
            list_printer_overview,
            get_trusted_lan_companion_status,
            list_trusted_lan_interfaces,
            update_trusted_lan_companion_config,
            create_trusted_lan_pairing,
            list_trusted_lan_paired_browsers,
            revoke_trusted_lan_paired_browser,
            revoke_all_trusted_lan_paired_browsers,
            list_master_catalog,
            refresh_bambu_catalog,
            refresh_esun_catalog,
            esun_search_filaments,
            esun_fetch_product_detail,
            create_spool,
            create_wishlist_item,
            create_manual_spool,
            create_printer,
            delete_printer,
            set_active_printer,
            set_dock_icon_theme,
            get_app_version,
            assign_printer_slot,
            record_print_usage,
            update_spool_weight,
            update_spool_status,
            update_spool_details,
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

fn detect_bambu_skip_discontinued_reason(output: &str, imported: i64) -> Option<String> {
    if imported <= 0 {
        return Some("no rows imported".to_string());
    }

    let lowered = output.to_lowercase();
    let anti_bot_signals = ["429 too many requests", "access denied", "captcha", "cloudflare"];
    if anti_bot_signals
        .iter()
        .any(|signal| lowered.contains(signal))
    {
        return Some("anti-bot/rate-limit responses detected".to_string());
    }

    if let Some(blocks) = extract_prefixed_line(output, "Anti-bot blocks:")
        .and_then(|value| value.parse::<i64>().ok())
    {
        if blocks > 0 {
            return Some("anti-bot/rate-limit responses detected".to_string());
        }
    }

    if lowered.contains("refresh quality: partial") {
        return Some("refresh had warnings/errors from source".to_string());
    }

    if lowered.contains("scraper warning:") {
        return Some("scraper reported partial refresh warnings".to_string());
    }

    if lowered.contains("no products found for any base url") {
        return Some("source returned no products".to_string());
    }

    None
}

fn extract_prefixed_line(stdout: &str, prefix: &str) -> Option<String> {
    for line in stdout.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix(prefix) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
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

    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    let db_path = app_dir.join("bambu.db");
    let db = FilamentDatabase::open(&db_path).map_err(|error| format!("DB open: {error:?}"))?;
    db.apply_schema()
        .map_err(|error| format!("DB schema: {error:?}"))?;
    Ok(db_path)
}

#[cfg(test)]
mod tests {
    use super::{
        detect_bambu_skip_discontinued_reason, enforce_trusted_lan_disabled_on_desktop_startup,
    };
    use crate::backend::filament_database::{FilamentDatabase, TrustedLanSettingsRow};
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
    fn bambu_discontinued_is_applied_on_clean_refresh_output() {
        let output = "\
Detected store: https://eu.store.bambulab.com\n\
Detected collection: bambu-lab-3d-printer-filament\n\
Products discovered: 36\n\
Products detailed: 36\n\
Imported 256 entries.\n";
        let reason = detect_bambu_skip_discontinued_reason(output, 256);
        assert!(reason.is_none());
    }

    #[test]
    fn bambu_discontinued_is_skipped_on_rate_limit_output() {
        let output = "\
Scraper: retrying https://eu.store.bambulab.com/products/pa6-cf after 429\n\
Scraper: 429 Too Many Requests https://eu.store.bambulab.com/products/pa6-cf\n\
Refresh quality: partial\n\
Imported 278 entries.\n";
        let reason = detect_bambu_skip_discontinued_reason(output, 278);
        assert_eq!(
            reason,
            Some("anti-bot/rate-limit responses detected".to_string())
        );
    }

    #[test]
    fn bambu_discontinued_partial_without_antibot_uses_source_warning_reason() {
        let output = "\
Detected store: https://eu.store.bambulab.com\n\
Anti-bot blocks: 0\n\
Refresh quality: partial\n\
Imported 296 entries.\n\
Warnings:\n\
Some product detail pages could not be fetched.\n";
        let reason = detect_bambu_skip_discontinued_reason(output, 296);
        assert_eq!(
            reason,
            Some("refresh had warnings/errors from source".to_string())
        );
    }

    #[test]
    fn bambu_discontinued_is_skipped_when_zero_imported() {
        let output = "Imported 0 entries.\n";
        let reason = detect_bambu_skip_discontinued_reason(output, 0);
        assert_eq!(reason, Some("no rows imported".to_string()));
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
}

fn write_label_to_disk(app: &tauri::AppHandle, html: &str) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.html", chrono_id());
    let path = label_dir.join(filename);
    std::fs::write(&path, html).map_err(|error| error.to_string())?;
    Ok(path)
}

fn write_pdf_to_disk(app: &tauri::AppHandle, bytes: &[u8]) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let label_dir = app_dir.join("labels");
    std::fs::create_dir_all(&label_dir).map_err(|error| error.to_string())?;
    let filename = format!("label_{}.pdf", chrono_id());
    let path = label_dir.join(filename);
    std::fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path)
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

fn trusted_lan_server_status_snapshot(
    runtime: &TrustedLanCompanionRuntime,
) -> TrustedLanCompanionRuntimeSnapshot {
    let mut snapshot = runtime.snapshot();
    if !snapshot.enabled || !snapshot.running {
        return snapshot;
    }

    let Some(base_url) = snapshot.base_url.clone() else {
        snapshot.shell_reachable = false;
        snapshot.health_error =
            Some("Trusted-LAN companion does not have a valid interface binding yet.".to_string());
        return snapshot;
    };

    match verify_companion_health_url(&base_url, "pairing-session", "Trusted-LAN companion") {
        Ok(()) => {
            snapshot.shell_reachable = true;
            snapshot.health_error = None;
        }
        Err(error) => {
            snapshot.shell_reachable = false;
            snapshot.health_error = Some(error);
        }
    }

    snapshot
}

fn verify_companion_health_url(
    base_url: &str,
    expected_auth_mode: &str,
    companion_label: &str,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(400))
        .build()
        .map_err(|error| format!("Failed to prepare {companion_label} health check: {error}"))?;

    let health_url = format!("{}/api/v1/health", base_url.trim_end_matches('/'));
    let response = client
        .get(&health_url)
        .send()
        .map_err(|error| format!("{companion_label} health check failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "{companion_label} health check returned {}.",
            response.status()
        ));
    }

    let response_text = response.text().map_err(|error| {
        format!("{companion_label} health check body could not be read: {error}")
    })?;
    let payload =
        serde_json::from_str::<CompanionHealthCheckResponse>(&response_text).map_err(|error| {
            format!("{companion_label} health check returned invalid JSON: {error}")
        })?;

    if !payload.ok {
        return Err(format!(
            "{companion_label} health check reported not ready."
        ));
    }
    if payload.api_version.trim() != "v1" {
        return Err(format!(
            "{companion_label} health check returned unexpected API version {}.",
            payload.api_version
        ));
    }
    if payload.auth_mode.trim() != expected_auth_mode {
        return Err(format!(
            "{companion_label} health check returned unexpected auth mode {}.",
            payload.auth_mode
        ));
    }

    Ok(())
}

fn load_trusted_lan_runtime(db_path: &str) -> Result<TrustedLanCompanionRuntime, String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let settings = db
        .get_trusted_lan_settings()
        .map_err(|error| error.to_string())?;
    let runtime =
        TrustedLanCompanionRuntime::new(settings.listen_port).with_enabled(settings.enabled);
    let runtime = match (
        settings.selected_interface_name.as_deref(),
        settings.selected_interface_address.as_deref(),
    ) {
        (Some(name), Some(address)) if !name.trim().is_empty() && !address.trim().is_empty() => {
            runtime.with_selected_interface(name.trim(), address.trim())
        }
        _ => runtime,
    };
    Ok(runtime)
}

fn list_private_trusted_lan_interfaces() -> Vec<TrustedLanInterfaceOption> {
    let mut interfaces = if_addrs::get_if_addrs()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|interface| match interface.ip() {
            IpAddr::V4(ipv4) if !interface.is_loopback() && ipv4.is_private() => {
                Some(TrustedLanInterfaceOption {
                    label: format!("{} ({})", interface.name, ipv4),
                    name: interface.name,
                    address: ipv4.to_string(),
                })
            }
            _ => None,
        })
        .collect::<Vec<_>>();
    interfaces.sort_by(|left, right| {
        left.name
            .cmp(&right.name)
            .then(left.address.cmp(&right.address))
    });
    interfaces.dedup_by(|left, right| left.name == right.name && left.address == right.address);
    interfaces
}

fn normalize_trusted_lan_interface_selection(
    interface_name: Option<&str>,
    interface_address: Option<&str>,
) -> Option<(String, String)> {
    let name = interface_name?.trim();
    let address = interface_address?.trim();
    if name.is_empty() || address.is_empty() {
        return None;
    }
    Some((name.to_string(), address.to_string()))
}

fn ensure_private_trusted_lan_interface(address: &str) -> Result<(), String> {
    let available = list_private_trusted_lan_interfaces();
    if available
        .iter()
        .any(|value| value.address == address.trim())
    {
        return Ok(());
    }
    Err(format!(
        "Trusted-LAN address {} is not currently available on a private interface.",
        address.trim()
    ))
}

fn hash_secret(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{:02x}", byte));
    }
    output
}

fn inventory_error_to_string(error: backend::filament_database::InventoryError) -> String {
    format!("{error:?}")
}

fn with_inventory<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
where
    Func: FnOnce(InventoryEngine) -> backend::filament_database::InventoryResult<Output>,
{
    let db = FilamentDatabase::open(&state.db_path).map_err(|error| error.to_string())?;
    let engine = InventoryEngine::new(db);
    func(engine).map_err(|error| format!("{:?}", error))
}

fn with_db<Func, Output>(state: &AppState, func: Func) -> Result<Output, String>
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
