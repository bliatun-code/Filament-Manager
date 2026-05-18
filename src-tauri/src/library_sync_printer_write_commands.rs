use crate::library_sync_cache_refresh::{
    refresh_library_sync_printer_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::perform_library_sync_host_write;
use crate::library_sync_models::{
    LibrarySyncAssignPrinterSlotInput, LibrarySyncCreatePrinterInput,
    LibrarySyncDeletePrinterInput, LibrarySyncRecordPrintUsageInput,
};
use crate::state::AppState;

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
