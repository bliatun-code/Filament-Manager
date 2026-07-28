use crate::catalog_commands::CatalogRefreshResult;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_printer_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::{
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse_with_timeout,
};
use crate::library_sync_models::{
    LibrarySyncAssignPrinterSlotInput, LibrarySyncCreatePrinterInput,
    LibrarySyncDeleteBambuLiveIntegrationInput, LibrarySyncDeletePrinterInput,
    LibrarySyncRecordPrintUsageInput, LibrarySyncRefreshCatalogInput,
    LibrarySyncSaveBambuLiveIntegrationInput, LibrarySyncUpdateMasterCatalogEntryInput,
};
use crate::state::AppState;
use std::time::Duration;

#[tauri::command]
pub(crate) fn assign_library_sync_host_printer_slot(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAssignPrinterSlotInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let printer_id = input.printer_id.trim();
    let slot_id = input.slot_id.trim();
    if printer_id.is_empty() || slot_id.is_empty() {
        return Err("Printer id and slot id are required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/slots/{slot_id}/assignment"),
        &serde_json::json!({
            "spool_id": trimmed_non_empty(input.spool_id.as_deref()),
            "rfid_override_tray_uuid": trimmed_non_empty(input.rfid_override_tray_uuid.as_deref()),
            "rfid_override_color_hex": trimmed_non_empty(input.rfid_override_color_hex.as_deref()),
            "clear_live_cache_before_next_refresh": input.clear_live_cache_before_next_refresh.unwrap_or(false),
        }),
    )?;

    refresh_library_sync_printer_cache(&state, &normalized_base_url);
    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host printer slot updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn record_library_sync_host_print_usage(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRecordPrintUsageInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let printer_id = input.printer_id.trim();
    let spool_id = input.spool_id.trim();
    if printer_id.is_empty() || spool_id.is_empty() {
        return Err("Printer id and spool id are required.".to_string());
    }
    if input.grams <= 0 {
        return Err("Used grams must be greater than zero.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/spools/{spool_id}/usage"),
        &serde_json::json!({
            "grams": input.grams,
            "job_name": trimmed_non_empty(input.job_name.as_deref()),
            "success": input.success.unwrap_or(true),
        }),
    )?;

    refresh_library_sync_printer_cache(&state, &normalized_base_url);
    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host print usage recorded.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreatePrinterInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let id = input.id.trim();
    let model = input.model.trim();
    let name = input.name.trim();
    if id.is_empty() || model.is_empty() || name.is_empty() {
        return Err("Printer id, model and name are required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        "/api/v1/printers",
        &serde_json::json!({
            "id": id,
            "model": model,
            "name": name,
            "ams_units": input.ams_units,
            "slots_per_ams": input.slots_per_ams,
        }),
    )?;

    refresh_library_sync_printer_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host printer saved.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_master_catalog_entry(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateMasterCatalogEntryInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let master_id = input.master_id.trim();
    let material = input.material.trim();
    let filament_name = input.filament_name.trim();
    let color_name = input.color_name.trim();
    if master_id.is_empty()
        || material.is_empty()
        || filament_name.is_empty()
        || color_name.is_empty()
    {
        return Err("Master id, material, filament name and color name are required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/catalog/masters/{master_id}/details"),
        &serde_json::json!({
            "material": material,
            "filament_name": filament_name,
            "color_name": color_name,
            "hex_color": trimmed_non_empty(input.hex_color.as_deref()),
            "product_url": trimmed_non_empty(input.product_url.as_deref()),
            "vendor": trimmed_non_empty(input.vendor.as_deref()),
            "default_weight": input.default_weight,
        }),
    )?;

    save_library_sync_success(&state, "Host catalog entry updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn refresh_library_sync_host_vendor_catalog(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRefreshCatalogInput,
) -> Result<CatalogRefreshResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let vendor = input.vendor.trim();
    if !vendor.eq_ignore_ascii_case("Bambu") && !vendor.eq_ignore_ascii_case("eSUN") {
        return Err("Vendor must be Bambu or eSUN.".to_string());
    }

    let summary = perform_library_sync_host_write_and_parse_with_timeout(
        &state,
        &normalized_base_url,
        "/api/v1/catalog/refresh",
        &serde_json::json!({
            "vendor": vendor,
            "material_types": input.material_types.unwrap_or_default(),
        }),
        Duration::from_secs(180),
    )?;

    save_library_sync_success(&state, "Host catalog refreshed.", None)?;
    Ok(summary)
}

#[tauri::command]
pub(crate) fn save_library_sync_host_bambu_live_integration(
    _state: tauri::State<'_, AppState>,
    _input: LibrarySyncSaveBambuLiveIntegrationInput,
) -> Result<(), String> {
    Err("Bambu credentials and TLS trust can only be changed on the host desktop.".to_string())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_bambu_live_integration(
    _state: tauri::State<'_, AppState>,
    _input: LibrarySyncDeleteBambuLiveIntegrationInput,
) -> Result<(), String> {
    Err("Bambu credentials and TLS trust can only be changed on the host desktop.".to_string())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeletePrinterInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/delete"),
        &serde_json::json!({}),
    )?;

    refresh_library_sync_printer_cache(&state, &normalized_base_url);
    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host printer deleted.", None)?;
    Ok(())
}
