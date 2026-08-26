use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::{
    self,
    filament_database::{FilamentDatabase, ManualMasterInput},
    vendor_lookup::{EsunProductDetail, EsunSearchResult},
};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

#[derive(Serialize, Deserialize)]
pub(crate) struct CatalogRefreshResult {
    imported: i64,
    detected_store: Option<String>,
    detected_collection: Option<String>,
    discovered_materials: Option<Vec<String>>,
    reactivated_count: i64,
    discontinued_count: i64,
    reused_cached_products: Option<i64>,
    detail_fetches: Option<i64>,
    output: String,
}

#[derive(Serialize, Clone)]
pub(crate) struct CatalogRefreshProgressEvent {
    vendor: String,
    phase: String,
    message: String,
}

#[tauri::command]
pub(crate) async fn refresh_bambu_catalog(
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

    let state = state.inner().clone();
    let db_path = state.db_path.clone();
    let app_for_worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            with_authoritative_local_library(&state, || {
                refresh_bambu_catalog_blocking(&db_path, material_types, Some(&app_for_worker))
            })
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
            discovered_materials: None,
            reactivated_count: 0,
            discontinued_count: 0,
            reused_cached_products: None,
            detail_fetches: None,
            output: format!(
                "Bambu refresh failed before completion.\n{message}\n\nCatalog lifecycle update:\nVendor: Bambu\nDiscontinued handling: skipped (refresh failed)\nReactivated: 0\nMarked discontinued: 0\n"
            ),
        }),
    }
}

#[tauri::command]
pub(crate) async fn refresh_esun_catalog(
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

    let state = state.inner().clone();
    let db_path = state.db_path.clone();
    let app_for_worker = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            with_authoritative_local_library(&state, || {
                refresh_esun_catalog_blocking(&db_path, material_types, Some(&app_for_worker))
            })
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
            discovered_materials: None,
            reactivated_count: 0,
            discontinued_count: 0,
            reused_cached_products: None,
            detail_fetches: None,
            output: format!(
                "eSUN refresh failed before completion.\n{message}\n\nCatalog lifecycle update:\nVendor: eSUN\nDiscontinued handling: skipped (refresh failed)\nReactivated: 0\nMarked discontinued: 0\n"
            ),
        }),
    }
}

pub(crate) fn refresh_bambu_catalog_blocking(
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
    let (known_bambu_entries, stale_before) = if material_types.is_empty() {
        (None, None)
    } else {
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
            db.upsert_manual_master(ManualMasterInput {
                material,
                filament_name,
                color_name,
                hex_color: entry.hex_color.as_deref(),
                product_url: Some(&entry.product_url),
                vendor: Some("Bambu"),
                default_weight: Some(entry.default_weight_g),
            })
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
        "Detected store: {}\nDetected collection: {}\nProducts discovered: {}\nProducts detailed: {}\nReused cached products: {}\nDetail fetches: {}\nAnti-bot blocks: {}\nImported {} entries.\nSkipped invalid entries: {}\n",
        snapshot.detected_store,
        snapshot.detected_collection,
        snapshot.products_discovered,
        snapshot.products_detailed,
        snapshot.reused_cached_products,
        snapshot.detail_fetches,
        snapshot.anti_bot_blocks,
        imported,
        skipped_invalid_entries
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
        discovered_materials: Some(snapshot.discovered_materials),
        reactivated_count,
        discontinued_count,
        reused_cached_products: Some(snapshot.reused_cached_products),
        detail_fetches: Some(snapshot.detail_fetches),
        output,
    })
}

pub(crate) fn refresh_esun_catalog_blocking(
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
    let (known_esun_entries, stale_before) = if material_types.is_empty() {
        (None, None)
    } else {
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
        if material_types.is_empty() {
            None
        } else {
            Some(material_types.clone())
        },
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
    let imported = {
        let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
        let mut processed = 0i64;
        for entry in &snapshot.entries {
            db.upsert_manual_master(ManualMasterInput {
                material: &entry.material,
                filament_name: &entry.filament_name,
                color_name: &entry.color_name,
                hex_color: entry.hex_color.as_deref(),
                product_url: Some(&entry.product_url),
                vendor: Some("eSUN"),
                default_weight: Some(entry.default_weight_g),
            })
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
        "Detected store: {}\nDetected collection: {}\nHandles discovered: {}\nProducts processed: {}\nSkipped non-filament: {}\nReused cached products: {}\nDetail fetches: {}\nImported {} entries.\n",
        snapshot.detected_store,
        snapshot.detected_collection,
        snapshot.handles_found,
        snapshot.products_processed,
        snapshot.skipped_non_filament,
        snapshot.reused_cached_products,
        snapshot.detail_fetches,
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
        discovered_materials: None,
        reactivated_count,
        discontinued_count,
        reused_cached_products: Some(snapshot.reused_cached_products),
        detail_fetches: Some(snapshot.detail_fetches),
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

fn detect_bambu_skip_discontinued_reason(output: &str, imported: i64) -> Option<String> {
    if imported <= 0 {
        return Some("no rows imported".to_string());
    }

    let lowered = output.to_lowercase();
    let anti_bot_signals = [
        "429 too many requests",
        "access denied",
        "captcha",
        "cloudflare",
    ];
    if anti_bot_signals
        .iter()
        .any(|signal| lowered.contains(signal))
    {
        return Some("anti-bot/rate-limit responses detected".to_string());
    }

    if let Some(blocks) = extract_prefixed_line(output, "Anti-bot blocks:")
        .and_then(|value| value.parse::<i64>().ok())
        && blocks > 0
    {
        return Some("anti-bot/rate-limit responses detected".to_string());
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

#[cfg(test)]
#[path = "catalog_commands_tests.rs"]
mod tests;
