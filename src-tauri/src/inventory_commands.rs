use crate::backend::filament_database::{
    ActiveSpoolLoanRow, CatalogResetStats, LoanUsageByPersonRow, SpoolHistoryEventRow,
    SpoolLoanDetailsRow, SpoolLoanRow, SpoolUsagePointRow,
};
use crate::backend::inventory_engine::{
    DeleteSpoolInput, LendSpoolInput, PurgeSpoolInput, ReturnSpoolLoanInput, ScanSource,
    UpdateMasterCatalogEntryInput, UpdateSpoolDetailsInput, UpdateSpoolRfidTagInput,
    UpdateWishlistStatusInput, WeightSource,
};
use crate::backend::statistics::{FilamentConsumptionRow, InventoryOverview, MaterialUsageRow};
use crate::inventory_command_support::{
    companion_service, inventory_error_to_string, ExportPayload, ScanPayload,
};
use crate::state::AppState;
use crate::{with_inventory, with_stats};

#[tauri::command]
pub(crate) fn reset_app_data(state: tauri::State<'_, AppState>) -> Result<(), String> {
    with_inventory(&state, |engine| engine.reset_app_state())
}

#[tauri::command]
pub(crate) fn reset_catalog_data(
    state: tauri::State<'_, AppState>,
) -> Result<CatalogResetStats, String> {
    with_inventory(&state, |engine| engine.reset_catalogs())
}

#[tauri::command]
pub(crate) fn update_spool_weight(
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
pub(crate) fn update_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    grams: i64,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_tare_weight(&spool_id, grams)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn update_spool_status(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    status: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.update_spool_status(&spool_id, &status)
    })
}

#[tauri::command]
pub(crate) fn update_spool_details(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolDetailsInput,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_details(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn update_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolRfidTagInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_spool_rfid_tag(input))
}

#[tauri::command]
pub(crate) fn update_master_catalog_entry(
    state: tauri::State<'_, AppState>,
    input: UpdateMasterCatalogEntryInput,
) -> Result<String, String> {
    with_inventory(&state, |engine| engine.update_master_catalog_entry(input))
}

#[tauri::command]
pub(crate) fn delete_spool(
    state: tauri::State<'_, AppState>,
    input: DeleteSpoolInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_spool(input))
}

#[tauri::command]
pub(crate) fn purge_spool(
    state: tauri::State<'_, AppState>,
    input: PurgeSpoolInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.purge_spool(input))
}

#[tauri::command]
pub(crate) fn list_spool_history(
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
pub(crate) fn list_spool_usage(
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
pub(crate) fn list_active_spool_loans(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ActiveSpoolLoanRow>, String> {
    companion_service(&state)
        .list_active_spool_loans()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn list_loan_usage_by_person(
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
pub(crate) fn list_spool_loans(
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
pub(crate) fn update_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: UpdateWishlistStatusInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_wishlist_item_status(input))
}

#[tauri::command]
pub(crate) fn lend_spool(
    state: tauri::State<'_, AppState>,
    input: LendSpoolInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .lend_spool(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn return_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn return_inbound_spool_loan(
    state: tauri::State<'_, AppState>,
    input: ReturnSpoolLoanInput,
) -> Result<SpoolLoanRow, String> {
    companion_service(&state)
        .return_inbound_spool_loan(input)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn export_loans_csv(
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
pub(crate) fn delete_wishlist_item(
    state: tauri::State<'_, AppState>,
    item_id: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_wishlist_item(&item_id))
}

#[tauri::command]
pub(crate) fn assign_location(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    location_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.assign_location(&spool_id, location_id.as_deref())
    })
}

#[tauri::command]
pub(crate) fn record_scan_event(
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
pub(crate) fn inventory_overview(
    state: tauri::State<'_, AppState>,
) -> Result<InventoryOverview, String> {
    with_stats(&state, |stats| stats.inventory_overview())
}

#[tauri::command]
pub(crate) fn top_materials(
    state: tauri::State<'_, AppState>,
    limit: i64,
) -> Result<Vec<MaterialUsageRow>, String> {
    with_stats(&state, |stats| stats.top_materials(limit))
}

#[tauri::command]
pub(crate) fn list_filament_consumption(
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
pub(crate) fn check_low_stock(
    state: tauri::State<'_, AppState>,
    threshold: i64,
) -> Result<usize, String> {
    with_inventory(&state, |engine| engine.check_low_stock_alerts(threshold))
}

#[tauri::command]
pub(crate) fn enqueue_sync_action(
    state: tauri::State<'_, AppState>,
    action_type: String,
    payload_json: String,
) -> Result<String, String> {
    with_inventory(&state, |engine| {
        engine.enqueue_sync_action(&action_type, &payload_json)
    })
}
