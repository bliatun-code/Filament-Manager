use crate::catalog_commands::{CatalogRefreshResult, CatalogSourceAuditResult};
use crate::companion_models::VENDOR_CATALOG_DISCOVERY_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_printer_cache, refresh_library_sync_spool_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_write,
    save_library_sync_success, save_library_sync_success_without_message, trimmed_non_empty,
};
use crate::library_sync_host_client::{
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::{
    LibrarySyncAcceptBambuLiveWeightEstimateInput, LibrarySyncAssignPrinterSlotInput,
    LibrarySyncAuditCatalogInput, LibrarySyncCreatePrinterInput,
    LibrarySyncDeleteBambuLiveIntegrationInput, LibrarySyncDeletePrinterInput,
    LibrarySyncRecordPrintUsageInput, LibrarySyncRefreshCatalogInput,
    LibrarySyncSaveBambuLiveIntegrationInput, LibrarySyncUpdateMasterCatalogEntryInput,
};
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn assign_library_sync_host_printer_slot(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAssignPrinterSlotInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || assign_library_sync_host_printer_slot_blocking(&state, input))
        .await
}

fn assign_library_sync_host_printer_slot_blocking(
    state: &AppState,
    input: LibrarySyncAssignPrinterSlotInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let printer_id = input.printer_id.trim();
    let slot_id = input.slot_id.trim();
    if printer_id.is_empty() || slot_id.is_empty() {
        return Err("Printer id and slot id are required.".to_string());
    }
    let printer_id = encode_library_sync_path_segment(printer_id);
    let slot_id = encode_library_sync_path_segment(slot_id);

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/slots/{slot_id}/assignment"),
        &serde_json::json!({
            "spool_id": trimmed_non_empty(input.spool_id.as_deref()),
            "rfid_override_tray_uuid": trimmed_non_empty(input.rfid_override_tray_uuid.as_deref()),
            "rfid_override_color_hex": trimmed_non_empty(input.rfid_override_color_hex.as_deref()),
            "clear_live_cache_before_next_refresh": input.clear_live_cache_before_next_refresh.unwrap_or(false),
        }),
    )?;

    refresh_library_sync_printer_cache(state, &normalized_base_url, &target);
    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host printer slot updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn record_library_sync_host_print_usage(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRecordPrintUsageInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || record_library_sync_host_print_usage_blocking(&state, input))
        .await
}

fn record_library_sync_host_print_usage_blocking(
    state: &AppState,
    input: LibrarySyncRecordPrintUsageInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let printer_id = input.printer_id.trim();
    let spool_id = input.spool_id.trim();
    if printer_id.is_empty() || spool_id.is_empty() {
        return Err("Printer id and spool id are required.".to_string());
    }
    if input.grams <= 0 {
        return Err("Used grams must be greater than zero.".to_string());
    }
    let printer_id = encode_library_sync_path_segment(printer_id);
    let spool_id = encode_library_sync_path_segment(spool_id);

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/spools/{spool_id}/usage"),
        &serde_json::json!({
            "grams": input.grams,
            "job_name": trimmed_non_empty(input.job_name.as_deref()),
            "success": input.success.unwrap_or(true),
        }),
    )?;

    refresh_library_sync_printer_cache(state, &normalized_base_url, &target);
    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host print usage recorded.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn accept_library_sync_host_bambu_live_weight_estimate(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAcceptBambuLiveWeightEstimateInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        accept_library_sync_host_bambu_live_weight_estimate_blocking(&state, input)
    })
    .await
}

fn accept_library_sync_host_bambu_live_weight_estimate_blocking(
    state: &AppState,
    input: LibrarySyncAcceptBambuLiveWeightEstimateInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;
    let printer_id = input.printer_id.trim();
    let slot_id = input.slot_id.trim();
    let spool_id = input.spool_id.trim();
    let expected_weight_seen_at = input.expected_weight_seen_at.trim();
    if printer_id.is_empty()
        || slot_id.is_empty()
        || spool_id.is_empty()
        || expected_weight_seen_at.is_empty()
    {
        return Err("Printer id, slot id, spool id and weight timestamp are required.".to_string());
    }
    if input.expected_remaining_grams < 0
        || input.expected_current_grams.is_some_and(|grams| grams < 0)
    {
        return Err("Weight snapshot values must not be negative.".to_string());
    }

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &bambu_live_weight_estimate_accept_path(printer_id, slot_id, spool_id),
        &bambu_live_weight_estimate_accept_payload(
            expected_weight_seen_at,
            input.expected_remaining_grams,
            input.expected_current_grams,
        ),
    )?;

    refresh_library_sync_printer_cache(state, &normalized_base_url, &target);
    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    save_library_sync_success_without_message(state, &target, None)?;
    Ok(())
}

fn bambu_live_weight_estimate_accept_path(
    printer_id: &str,
    slot_id: &str,
    spool_id: &str,
) -> String {
    let printer_id = encode_library_sync_path_segment(printer_id);
    let slot_id = encode_library_sync_path_segment(slot_id);
    let spool_id = encode_library_sync_path_segment(spool_id);
    format!(
        "/api/v1/printers/{printer_id}/slots/{slot_id}/spools/{spool_id}/bambu-live-weight-estimate/accept"
    )
}

fn bambu_live_weight_estimate_accept_payload(
    expected_weight_seen_at: &str,
    expected_remaining_grams: i64,
    expected_current_grams: Option<i64>,
) -> serde_json::Value {
    serde_json::json!({
        "expected_weight_seen_at": expected_weight_seen_at,
        "expected_remaining_grams": expected_remaining_grams,
        "expected_current_grams": expected_current_grams,
    })
}

#[tauri::command]
pub(crate) async fn create_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreatePrinterInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || create_library_sync_host_printer_blocking(&state, input))
        .await
}

fn create_library_sync_host_printer_blocking(
    state: &AppState,
    input: LibrarySyncCreatePrinterInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let id = input.id.trim();
    let model = input.model.trim();
    let name = input.name.trim();
    if id.is_empty() || model.is_empty() || name.is_empty() {
        return Err("Printer id, model and name are required.".to_string());
    }

    perform_library_sync_host_write(
        state,
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

    refresh_library_sync_printer_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host printer saved.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_master_catalog_entry(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateMasterCatalogEntryInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_master_catalog_entry_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_master_catalog_entry_blocking(
    state: &AppState,
    input: LibrarySyncUpdateMasterCatalogEntryInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

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
    let master_id = encode_library_sync_path_segment(master_id);

    perform_library_sync_host_write(
        state,
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

    save_library_sync_success(state, &target, "Host catalog entry updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn refresh_library_sync_host_vendor_catalog(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRefreshCatalogInput,
) -> Result<CatalogRefreshResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        refresh_library_sync_host_vendor_catalog_blocking(&state, input)
    })
    .await
}

fn refresh_library_sync_host_vendor_catalog_blocking(
    state: &AppState,
    input: LibrarySyncRefreshCatalogInput,
) -> Result<CatalogRefreshResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let vendor = input.vendor.trim();
    if !vendor.eq_ignore_ascii_case("Bambu") && !vendor.eq_ignore_ascii_case("eSUN") {
        return Err("Vendor must be Bambu or eSUN.".to_string());
    }

    let mut material_types: Vec<String> = input
        .material_types
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_uppercase())
        .filter(|value| !value.is_empty())
        .collect();
    material_types.sort();
    material_types.dedup();
    if material_types.len() != 1 {
        return Err("Choose exactly one material type for catalog refresh.".to_string());
    }

    let summary = perform_library_sync_host_write_and_parse(
        state,
        &normalized_base_url,
        "/api/v1/catalog/refresh",
        &serde_json::json!({
            "vendor": vendor,
            "material_types": material_types,
        }),
    )?;

    save_library_sync_success(state, &target, "Host catalog refreshed.", None)?;
    Ok(summary)
}

#[tauri::command]
pub(crate) async fn audit_library_sync_host_vendor_catalog(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAuditCatalogInput,
) -> Result<CatalogSourceAuditResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        audit_library_sync_host_vendor_catalog_blocking(&state, input)
    })
    .await
}

fn audit_library_sync_host_vendor_catalog_blocking(
    state: &AppState,
    input: LibrarySyncAuditCatalogInput,
) -> Result<CatalogSourceAuditResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health, target) =
        prepare_library_sync_host_write(state, &host_input)?;
    require_vendor_catalog_discovery_capability(&health.capabilities)?;

    let vendor = input.vendor.trim();
    if !vendor.eq_ignore_ascii_case("Bambu") && !vendor.eq_ignore_ascii_case("eSUN") {
        return Err("Vendor must be Bambu or eSUN.".to_string());
    }

    let summary = perform_library_sync_host_write_and_parse(
        state,
        &normalized_base_url,
        "/api/v1/catalog/audit",
        &serde_json::json!({ "vendor": vendor }),
    )?;
    save_library_sync_success(state, &target, "Host catalog source checked.", None)?;
    Ok(summary)
}

fn require_vendor_catalog_discovery_capability(capabilities: &[String]) -> Result<(), String> {
    if capabilities
        .iter()
        .any(|capability| capability == VENDOR_CATALOG_DISCOVERY_CAPABILITY)
    {
        return Ok(());
    }
    Err(
        "The Host must be updated before it can safely discover vendor catalog materials."
            .to_string(),
    )
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
pub(crate) async fn delete_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeletePrinterInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || delete_library_sync_host_printer_blocking(&state, input))
        .await
}

fn delete_library_sync_host_printer_blocking(
    state: &AppState,
    input: LibrarySyncDeletePrinterInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    let printer_id = encode_library_sync_path_segment(printer_id);

    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/printers/{printer_id}/delete"),
        &serde_json::json!({}),
    )?;

    refresh_library_sync_printer_cache(state, &normalized_base_url, &target);
    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host printer deleted.", None)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        bambu_live_weight_estimate_accept_path, bambu_live_weight_estimate_accept_payload,
        require_vendor_catalog_discovery_capability,
    };
    use crate::companion_models::VENDOR_CATALOG_DISCOVERY_CAPABILITY;

    #[test]
    fn accepted_ams_weight_host_request_uses_companion_path_and_optimistic_snapshot_payload() {
        assert_eq!(
            bambu_live_weight_estimate_accept_path("printer_1", "slot_1", "spool_1"),
            "/api/v1/printers/printer_1/slots/slot_1/spools/spool_1/bambu-live-weight-estimate/accept"
        );
        assert_eq!(
            bambu_live_weight_estimate_accept_path("printer/&", "slot ?", "legacy/id#%"),
            "/api/v1/printers/printer%2F%26/slots/slot%20%3F/spools/legacy%2Fid%23%25/bambu-live-weight-estimate/accept"
        );
        assert_eq!(
            bambu_live_weight_estimate_accept_payload("2026-08-12T12:00:00Z", 300, Some(1000),),
            serde_json::json!({
                "expected_weight_seen_at": "2026-08-12T12:00:00Z",
                "expected_remaining_grams": 300,
                "expected_current_grams": 1000,
            })
        );
    }

    #[test]
    fn catalog_discovery_fails_closed_against_legacy_host() {
        assert!(require_vendor_catalog_discovery_capability(&[]).is_err());
        assert!(require_vendor_catalog_discovery_capability(&[
            VENDOR_CATALOG_DISCOVERY_CAPABILITY.to_string()
        ])
        .is_ok());
    }
}
