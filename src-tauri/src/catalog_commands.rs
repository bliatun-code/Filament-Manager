use crate::backend::{
    self,
    filament_database::{FilamentDatabase, SourceCatalogEntryInput},
    vendor_lookup::{EsunProductDetail, EsunSearchResult},
};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct CatalogRefreshResult {
    imported: i64,
    detected_store: Option<String>,
    detected_collection: Option<String>,
    discovered_materials: Option<Vec<String>>,
    reactivated_count: i64,
    discontinued_count: i64,
    reused_cached_products: Option<i64>,
    detail_fetches: Option<i64>,
    pub(crate) output: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct CatalogSourceAuditResult {
    vendor: String,
    detected_store: String,
    detected_collection: Option<String>,
    discovered_materials: Vec<String>,
    products_discovered: i64,
    detail_fetches: i64,
    output: String,
}

#[derive(Serialize, Clone)]
pub(crate) struct CatalogRefreshProgressEvent {
    vendor: String,
    phase: String,
    message: String,
}

#[tauri::command]
pub(crate) async fn audit_bambu_catalog_source(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<CatalogSourceAuditResult, String> {
    let state = state.inner().clone();
    let app_for_worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let service =
            crate::app_services::CompanionService::new_bound_to_current_library(state.db_path);
        service
            .require_bound_authority()
            .map_err(crate::app_error::inventory_error_to_command_string)?;
        let result = audit_bambu_catalog_source_blocking(Some(&app_for_worker))?;
        service
            .require_bound_authority()
            .map_err(crate::app_error::inventory_error_to_command_string)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("Catalog source audit task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn audit_esun_catalog_source(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<CatalogSourceAuditResult, String> {
    let state = state.inner().clone();
    let app_for_worker = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let service =
            crate::app_services::CompanionService::new_bound_to_current_library(state.db_path);
        service
            .require_bound_authority()
            .map_err(crate::app_error::inventory_error_to_command_string)?;
        let result = audit_esun_catalog_source_blocking(Some(&app_for_worker))?;
        service
            .require_bound_authority()
            .map_err(crate::app_error::inventory_error_to_command_string)?;
        Ok(result)
    })
    .await
    .map_err(|error| format!("Catalog source audit task failed: {error}"))?
}

pub(crate) fn audit_bambu_catalog_source_blocking(
    app: Option<&tauri::AppHandle>,
) -> Result<CatalogSourceAuditResult, String> {
    emit_catalog_refresh_progress(
        app,
        "Bambu",
        "DISCOVER",
        "Checking which Bambu material types are available...",
    );
    let discovery = backend::bambu_lookup::discover_bambu_catalog_source()?;
    Ok(CatalogSourceAuditResult {
        vendor: "Bambu".to_string(),
        detected_store: discovery.detected_store,
        detected_collection: Some(discovery.detected_collection),
        discovered_materials: discovery.discovered_materials,
        products_discovered: discovery.products_discovered,
        detail_fetches: discovery.detail_fetches,
        output: discovery.output,
    })
}

pub(crate) fn audit_esun_catalog_source_blocking(
    app: Option<&tauri::AppHandle>,
) -> Result<CatalogSourceAuditResult, String> {
    emit_catalog_refresh_progress(
        app,
        "eSUN",
        "DISCOVER",
        "Checking which eSUN material types are available...",
    );
    let discovery = backend::vendor_lookup::discover_esun_catalog_source()?;
    Ok(CatalogSourceAuditResult {
        vendor: "eSUN".to_string(),
        detected_store: discovery.detected_store,
        detected_collection: Some(discovery.detected_collection),
        discovered_materials: discovery.discovered_materials,
        products_discovered: discovery.products_discovered,
        detail_fetches: discovery.detail_fetches,
        output: discovery.output,
    })
}

#[tauri::command]
pub(crate) async fn refresh_bambu_catalog(
    state: tauri::State<'_, AppState>,
    material_types: Option<Vec<String>>,
) -> Result<CatalogRefreshResult, String> {
    let path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::app_services::CompanionService::new_bound_to_current_library(path)
            .refresh_bambu_catalog(material_types)
    })
    .await
    .map_err(|_| "Catalog refresh task failed.".to_string())?
}

#[tauri::command]
pub(crate) async fn refresh_esun_catalog(
    state: tauri::State<'_, AppState>,
    material_types: Option<Vec<String>>,
) -> Result<CatalogRefreshResult, String> {
    let path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::app_services::CompanionService::new_bound_to_current_library(path)
            .refresh_esun_catalog(material_types)
    })
    .await
    .map_err(|_| "Catalog refresh task failed.".to_string())?
}

pub(crate) fn refresh_bambu_catalog_blocking(
    db_path: &str,
    material_types: Option<Vec<String>>,
    app: Option<&tauri::AppHandle>,
    job: &crate::catalog_refresh_jobs::CatalogJobExecution,
) -> Result<CatalogRefreshResult, String> {
    let material_types = require_single_material_filter(material_types)?;
    let refresh_started_at = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.sqlite_now().map_err(|error| format!("{:?}", error))?
    };
    let (known_bambu_entries, stale_before) = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let rows = db
            .list_master_catalog(100_000, None)
            .map_err(|error| format!("{:?}", error))?;
        let stale_before = db
            .sqlite_datetime_shift(&refresh_started_at, "-14 days")
            .map_err(|error| format!("{:?}", error))?;
        let entries: Vec<backend::bambu_lookup::BambuKnownCatalogEntry> = rows
            .into_iter()
            .filter(|row| row.vendor.eq_ignore_ascii_case("Bambu"))
            .filter(|row| {
                material_types
                    .iter()
                    .any(|material| material == &row.material.to_uppercase())
            })
            .filter_map(|row| {
                let product_url = row.product_url?;
                Some(backend::bambu_lookup::BambuKnownCatalogEntry {
                    entry: backend::bambu_lookup::BambuCatalogEntry {
                        material: row.material,
                        filament_name: row.filament_name,
                        color_name: row.color_name,
                        hex_color: row.hex_color,
                        image_url: None,
                        product_url,
                        default_weight_g: row.default_weight,
                    },
                    last_seen_at: row.last_seen_at,
                })
            })
            .collect();
        (Some(entries), Some(stale_before))
    };

    emit_catalog_refresh_progress(
        app,
        "Bambu",
        "FETCH",
        "Fetching one Bambu material family...",
    );

    let snapshot = match backend::bambu_lookup::refresh_bambu_catalog_snapshot(
        Some(material_types.clone()),
        known_bambu_entries,
        stale_before.as_deref(),
    ) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return Ok(CatalogRefreshResult {
                imported: 0,
                detected_store: None,
                detected_collection: None,
                discovered_materials: None,
                reactivated_count: 0,
                discontinued_count: 0,
                reused_cached_products: None,
                detail_fetches: None,
                output: format!(
                    "Remote Bambu refresh source was unavailable.\n{error}\nLocal Bambu catalog was left unchanged.\n\nCatalog lifecycle update:\nVendor: Bambu\nDiscontinued handling: skipped (source unavailable)\nReactivated: 0\nMarked discontinued: 0\n"
                ),
            });
        }
    };

    backend::bambu_lookup::validate_bambu_refresh_snapshot_for_mutation(&snapshot)?;

    emit_catalog_refresh_progress(
        app,
        "Bambu",
        "IMPORT",
        "Importing Bambu catalog into local database...",
    );
    let source_entries: Vec<SourceCatalogEntryInput<'_>> = snapshot
        .entries
        .iter()
        .map(|entry| SourceCatalogEntryInput {
            material: &entry.material,
            filament_name: &entry.filament_name,
            color_name: &entry.color_name,
            hex_color: entry.hex_color.as_deref(),
            product_url: &entry.product_url,
            default_weight: entry.default_weight_g,
        })
        .collect();
    job.import(
        "Bambu",
        &material_types[0],
        &refresh_started_at,
        &source_entries,
        |import_stats| {
            let imported = import_stats.imported_count();
            let reactivated_count = import_stats.reactivated_count;

            let mut output = format!(
                "Detected store: {}\nDetected collection: {}\nProducts discovered: {}\nProducts detailed: {}\nReused cached products: {}\nDetail fetches: {}\nAnti-bot blocks: {}\nImported {} entries.\nSkipped user-edited entries: {}\nSkipped vendor conflicts: {}\n",
                snapshot.detected_store,
                snapshot.detected_collection,
                snapshot.products_discovered,
                snapshot.products_detailed,
                snapshot.reused_cached_products,
                snapshot.detail_fetches,
                snapshot.anti_bot_blocks,
                imported,
                import_stats.skipped_user_edited_count,
                import_stats.skipped_vendor_conflict_count,
            );
            if !material_types.is_empty() {
                output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
            }
            if !snapshot.discovered_materials.is_empty() {
                output.push_str(&format!(
                    "Discovered materials: {}\n",
                    snapshot.discovered_materials.join(", ")
                ));
            }
            if snapshot.partial {
                output.push_str("Refresh quality: partial\n");
            }
            if !snapshot.warnings.is_empty() {
                output.push_str("\nWarnings:\n");
                output.push_str(&snapshot.warnings.join("\n"));
                output.push('\n');
            }
            let discontinued_count = 0;
            output.push_str("\nCatalog lifecycle update:\nVendor: Bambu\n");
            if !material_types.is_empty() {
                output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
            }
            output.push_str(
                "Discontinued handling: disabled for targeted refreshes. Unseen catalog rows were preserved.\n",
            );
            output.push_str(&format!(
                "Reactivated: {}\nMarked discontinued: {}\n",
                reactivated_count, discontinued_count
            ));

            CatalogRefreshResult {
                imported,
                detected_store: Some(snapshot.detected_store.clone()),
                detected_collection: Some(snapshot.detected_collection.clone()),
                discovered_materials: Some(snapshot.discovered_materials.clone()),
                reactivated_count,
                discontinued_count,
                reused_cached_products: Some(snapshot.reused_cached_products),
                detail_fetches: Some(snapshot.detail_fetches),
                output,
            }
        },
    )
}

pub(crate) fn refresh_esun_catalog_blocking(
    db_path: &str,
    material_types: Option<Vec<String>>,
    app: Option<&tauri::AppHandle>,
    job: &crate::catalog_refresh_jobs::CatalogJobExecution,
) -> Result<CatalogRefreshResult, String> {
    let material_types = require_single_material_filter(material_types)?;
    let refresh_started_at = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        db.sqlite_now().map_err(|error| format!("{:?}", error))?
    };

    emit_catalog_refresh_progress(app, "eSUN", "FETCH", "Fetching eSUN product catalog...");
    let (known_esun_entries, stale_before) = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let rows = db
            .list_master_catalog(100_000, None)
            .map_err(|error| format!("{:?}", error))?;
        let stale_before = db
            .sqlite_datetime_shift(&refresh_started_at, "-14 days")
            .map_err(|error| format!("{:?}", error))?;
        let entries: Vec<backend::vendor_lookup::EsunKnownCatalogEntry> = rows
            .into_iter()
            .filter(|row| row.vendor.eq_ignore_ascii_case("eSUN"))
            .filter(|row| {
                material_types
                    .iter()
                    .any(|material| material == &row.material.to_uppercase())
            })
            .filter_map(|row| {
                let product_url = row.product_url?;
                Some(backend::vendor_lookup::EsunKnownCatalogEntry {
                    entry: backend::vendor_lookup::EsunCatalogEntry {
                        material: row.material,
                        filament_name: row.filament_name,
                        color_name: row.color_name,
                        hex_color: row.hex_color,
                        image_url: None,
                        product_url,
                        default_weight_g: row.default_weight,
                    },
                    last_seen_at: row.last_seen_at,
                })
            })
            .collect();
        (Some(entries), Some(stale_before))
    };
    let snapshot = match backend::vendor_lookup::refresh_esun_catalog_snapshot(
        Some(material_types.clone()),
        known_esun_entries,
        stale_before.as_deref(),
    ) {
        Ok(snapshot) => snapshot,
        Err(error) => {
            return Ok(CatalogRefreshResult {
                imported: 0,
                detected_store: None,
                detected_collection: None,
                discovered_materials: None,
                reactivated_count: 0,
                discontinued_count: 0,
                reused_cached_products: None,
                detail_fetches: None,
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
    let source_entries: Vec<SourceCatalogEntryInput<'_>> = snapshot
        .entries
        .iter()
        .map(|entry| SourceCatalogEntryInput {
            material: &entry.material,
            filament_name: &entry.filament_name,
            color_name: &entry.color_name,
            hex_color: entry.hex_color.as_deref(),
            product_url: &entry.product_url,
            default_weight: entry.default_weight_g,
        })
        .collect();
    job.import(
        "eSUN",
        &material_types[0],
        &refresh_started_at,
        &source_entries,
        |import_stats| {
            let imported = import_stats.imported_count();
            let reactivated_count = import_stats.reactivated_count;
            let discontinued_count = 0;

            let mut output = format!(
                "Detected store: {}\nDetected collection: {}\nHandles discovered: {}\nProducts processed: {}\nSkipped non-filament: {}\nReused cached products: {}\nDetail fetches: {}\nImported {} entries.\nSkipped user-edited entries: {}\nSkipped vendor conflicts: {}\n",
                snapshot.detected_store,
                snapshot.detected_collection,
                snapshot.handles_found,
                snapshot.products_processed,
                snapshot.skipped_non_filament,
                snapshot.reused_cached_products,
                snapshot.detail_fetches,
                imported,
                import_stats.skipped_user_edited_count,
                import_stats.skipped_vendor_conflict_count,
            );
            if !material_types.is_empty() {
                output.push_str(&format!("Material filter: {}\n", material_types.join(", ")));
            }
            if !snapshot.warnings.is_empty() {
                output.push_str("\nWarnings:\n");
                output.push_str(&snapshot.warnings.join("\n"));
            }
            output.push_str("\n\nCatalog lifecycle update:\nVendor: eSUN\n");
            output.push_str(
                "Discontinued handling: disabled for targeted refreshes. Unseen catalog rows were preserved.\n",
            );
            output.push_str(&format!(
                "Reactivated: {}\nMarked discontinued: {}\n",
                reactivated_count, discontinued_count
            ));

            CatalogRefreshResult {
                imported,
                detected_store: Some(snapshot.detected_store.clone()),
                detected_collection: Some(snapshot.detected_collection.clone()),
                discovered_materials: Some(material_types.clone()),
                reactivated_count,
                discontinued_count,
                reused_cached_products: Some(snapshot.reused_cached_products),
                detail_fetches: Some(snapshot.detail_fetches),
                output,
            }
        },
    )
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

pub(crate) fn require_single_material_filter(
    material_types: Option<Vec<String>>,
) -> Result<Vec<String>, String> {
    let values = normalize_material_filters(material_types);
    if values.len() != 1 {
        return Err(
            "Choose exactly one material type. Source discovery is a separate operation."
                .to_string(),
        );
    }
    Ok(values)
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
pub(crate) fn esun_search_filaments(
    query: String,
    limit: Option<i64>,
) -> Result<Vec<EsunSearchResult>, String> {
    let bounded = limit.unwrap_or(12).clamp(1, 50) as usize;
    backend::vendor_lookup::search_esun_filaments(&query, bounded)
}

#[tauri::command]
pub(crate) fn esun_fetch_product_detail(handle: String) -> Result<EsunProductDetail, String> {
    backend::vendor_lookup::fetch_esun_product_detail(&handle)
}

#[cfg(test)]
#[path = "catalog_commands_tests.rs"]
mod tests;
