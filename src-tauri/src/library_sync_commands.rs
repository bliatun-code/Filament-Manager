use crate::app_services::CompanionSpoolDetail;
use crate::backend::filament_database::{
    FilamentMasterCatalogRow, PrinterOverviewRow, SpoolLoanDetailsRow, SpoolWithMasterRow,
    WishlistItemRow,
};
use crate::backend::database_library_sync_models::LibrarySyncCachedSnapshotRow;
use crate::backend::statistics::FilamentConsumptionRow;
use crate::library_sync_command_support::{
    prepare_library_sync_host_checked, prepare_library_sync_host_read, prepare_library_sync_host_write,
    save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::{
    fetch_library_sync_host_json, get_library_sync_host_json_authenticated,
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::*;
use crate::printer_commands::PrinterSettingsSnapshot;
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn fetch_library_sync_snapshot(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<LibrarySyncRemoteSnapshot, String> {
    let (normalized_base_url, expected_library_id) = prepare_library_sync_host_checked(&input)?;
    let parsed: LibrarySyncSnapshotResponse =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/snapshot")?;

    if !parsed.ok {
        return Err("Host snapshot reported not ready.".to_string());
    }

    if let Some(expected_library_id) = expected_library_id {
        if parsed.library_id != expected_library_id {
            return Err(format!(
                "Host snapshot belongs to a different library ({}).",
                parsed.library_id
            ));
        }
    }

    let snapshot = LibrarySyncRemoteSnapshot {
        captured_at: parsed.captured_at,
        library_id: parsed.library_id,
        device_name: parsed.device_name,
        sync_mode: parsed.sync_mode,
        inventory: parsed.inventory.clone(),
        total_spools: parsed.inventory.total_spools,
        in_use: parsed.inventory.in_use,
        low_stock: parsed.inventory.low_stock,
        active_loans: parsed.active_loans,
        printers: parsed.printers,
    };

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_snapshot(&LibrarySyncCachedSnapshotRow {
            captured_at: snapshot.captured_at.clone(),
            library_id: snapshot.library_id.clone(),
            device_name: snapshot.device_name.clone(),
            sync_mode: snapshot.sync_mode.clone(),
            inventory: snapshot.inventory.clone(),
            total_spools: snapshot.total_spools,
            in_use: snapshot.in_use,
            low_stock: snapshot.low_stock,
            active_loans: snapshot.active_loans,
            printers: snapshot.printers,
        })?;
        Ok(())
    })?;
    save_library_sync_success(&state, "Host snapshot refreshed.", Some(&snapshot.device_name))?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_spool_detail(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolDetailInput,
) -> Result<CompanionSpoolDetail, String> {
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    let history_limit = input.history_limit.unwrap_or(80).clamp(1, 250);
    let usage_limit = input.usage_limit.unwrap_or(500).clamp(1, 1_000);

    let detail: CompanionSpoolDetail = get_library_sync_host_json_authenticated(
        &state,
        &normalized_base_url,
        &format!(
            "/api/v1/spools/{spool_id}?history_limit={history_limit}&usage_limit={usage_limit}"
        ),
    )?;

    save_library_sync_success(&state, "Host spool detail refreshed.", None)?;

    Ok(detail)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_spools(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolWithMasterRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;
    let limit = input.limit.unwrap_or(1200).clamp(1, 2_500);
    let offset = input.offset.unwrap_or(0).max(0);
    let rows: Vec<SpoolWithMasterRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/spools?limit={limit}&offset={offset}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_spools(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host spool list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_overview(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<Vec<PrinterOverviewRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let rows: Vec<PrinterOverviewRow> =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printers")?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_printers(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host printer overview refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_printer_settings(
    state: tauri::State<'_, AppState>,
    input: ValidateLibrarySyncHostInput,
) -> Result<PrinterSettingsSnapshot, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&input)?;
    let snapshot: PrinterSettingsSnapshot =
        fetch_library_sync_host_json(&normalized_base_url, "/api/v1/library/printer-settings")?;

    save_library_sync_success(
        &state,
        "Host printer settings refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(snapshot)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_loans(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncSpoolListInput,
) -> Result<Vec<SpoolLoanDetailsRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;
    let limit = input.limit.unwrap_or(2000).clamp(1, 2_500);
    let rows: Vec<SpoolLoanDetailsRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/loans?include_returned=true&direction=ALL&limit={limit}").as_str(),
    )?;

    with_inventory(&state, |engine| {
        engine.save_library_sync_cached_loans(&rows)
    })?;
    save_library_sync_success(
        &state,
        "Host loan list refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_filament_consumption(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncFilamentConsumptionInput,
) -> Result<Vec<FilamentConsumptionRow>, String> {
    let (normalized_base_url, health) = prepare_library_sync_host_read(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;
    let limit = input.limit.unwrap_or(500).clamp(1, 2_000);
    let printer_id = input
        .printer_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let printer_query = printer_id
        .map(|value| format!("&printer_id={value}"))
        .unwrap_or_default();
    let rows: Vec<FilamentConsumptionRow> = fetch_library_sync_host_json(
        &normalized_base_url,
        format!("/api/v1/library/statistics/filament-consumption?limit={limit}{printer_query}")
            .as_str(),
    )?;

    save_library_sync_success(
        &state,
        "Host filament consumption refreshed.",
        health.device_name.as_deref(),
    )?;

    Ok(rows)
}

#[tauri::command]
pub(crate) fn fetch_library_sync_catalog_masters(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCatalogListInput,
) -> Result<Vec<FilamentMasterCatalogRow>, String> {
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let limit = input.limit.unwrap_or(1_000).clamp(1, 5_000);
    let _search = input.search;
    match fetch_library_sync_host_json(
        &normalized_base_url,
        &format!("/api/v1/library/catalog/masters?limit={limit}"),
    ) {
        Ok(rows) => Ok(rows),
        Err(error) if error.contains("404") => get_library_sync_host_json_authenticated(
            &state,
            &normalized_base_url,
            &format!("/api/v1/catalog/masters?limit={limit}"),
        ),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn fetch_library_sync_wishlist_items(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWishlistListInput,
) -> Result<Vec<WishlistItemRow>, String> {
    let (normalized_base_url, _) = prepare_library_sync_host_checked(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let limit = input.limit.unwrap_or(500).clamp(1, 2_500);
    match fetch_library_sync_host_json(
        &normalized_base_url,
        &format!("/api/v1/library/wishlist?limit={limit}"),
    ) {
        Ok(rows) => Ok(rows),
        Err(error) if error.contains("404") => get_library_sync_host_json_authenticated(
            &state,
            &normalized_base_url,
            &format!("/api/v1/wishlist?limit={limit}"),
        ),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    save_library_sync_success(&state, "Host spool weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_tare_weight(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncWeightWriteInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/tare-weight"),
        &serde_json::json!({ "grams": input.grams.max(0) }),
    )?;

    save_library_sync_success(&state, "Host spool tare weight updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_details(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolDetailsInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/details"),
        &serde_json::json!({
            "qr_code": trimmed_non_empty(input.qr_code.as_deref()),
            "status": input.status.trim(),
            "location": trimmed_non_empty(input.location.as_deref()),
            "home_location": input.home_location.as_ref().map(|value| {
                trimmed_non_empty(value.as_deref())
            }),
        }),
    )?;

    save_library_sync_success(&state, "Host spool details updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_spool_rfid_tag(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateSpoolRfidTagInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/rfid"),
        &serde_json::json!({
            "rfid_tag": trimmed_non_empty(input.rfid_tag.as_deref()),
            "rfid_observed_at": trimmed_non_empty(input.rfid_observed_at.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host spool RFID updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn assign_library_sync_host_printer_slot(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncAssignPrinterSlotInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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

    save_library_sync_success(&state, "Host printer slot updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn record_library_sync_host_print_usage(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncRecordPrintUsageInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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

    save_library_sync_success(&state, "Host print usage recorded.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn return_library_sync_host_loan(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReturnLoanInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let loan_id = input.loan_id.trim();
    if loan_id.is_empty() {
        return Err("Loan id is required.".to_string());
    }
    let path = if input.inbound {
        format!("/api/v1/loans/{loan_id}/hand-back")
    } else {
        format!("/api/v1/loans/{loan_id}/return")
    };

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &path,
        &serde_json::json!({
            "returned_grams": input.returned_grams.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host loan updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn lend_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncLendSpoolInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("spool_id is required".to_string());
    }
    let borrower_name = input.borrower_name.trim();
    if borrower_name.is_empty() {
        return Err("borrower_name is required".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/lend"),
        &serde_json::json!({
            "borrower_name": borrower_name,
            "grams_out": input.grams_out.max(0),
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host loan-out write completed.", None)?;

    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateSpoolInput,
) -> Result<String, String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let path = if trimmed_non_empty(input.owner_name.as_deref()).is_some() {
        "/api/v1/spools/borrowed-in"
    } else if trimmed_non_empty(input.master_id.as_deref()).is_some() {
        "/api/v1/spools/owned"
    } else {
        "/api/v1/spools/manual"
    };

    let response: LibrarySyncCreateSpoolResponse = perform_library_sync_host_write_and_parse(
        &state,
        &normalized_base_url,
        path,
        &serde_json::json!({
            "master_id": trimmed_non_empty(input.master_id.as_deref()),
            "material": trimmed_non_empty(input.material.as_deref()),
            "filament_name": trimmed_non_empty(input.filament_name.as_deref()),
            "color_name": trimmed_non_empty(input.color_name.as_deref()),
            "vendor": trimmed_non_empty(input.vendor.as_deref()),
            "initial_weight_g": input.initial_weight_g,
            "location": trimmed_non_empty(input.location.as_deref()),
            "hex_color": trimmed_non_empty(input.hex_color.as_deref()),
            "owner_name": trimmed_non_empty(input.owner_name.as_deref()),
            "owner_contact": trimmed_non_empty(input.owner_contact.as_deref()),
            "ownership_note": trimmed_non_empty(input.ownership_note.as_deref()),
        }),
    )?;
    if !response.ok {
        return Err(response.message);
    }

    save_library_sync_success(&state, &response.message, None)?;

    Ok(response.spool_id)
}

#[tauri::command]
pub(crate) fn create_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        "/api/v1/wishlist",
        &serde_json::json!({
            "master_id": trimmed_non_empty(input.master_id.as_deref()),
            "vendor": input.vendor.trim(),
            "material": input.material.trim(),
            "filament_name": input.filament_name.trim(),
            "color_name": input.color_name.trim(),
            "quantity": input.quantity,
            "note": trimmed_non_empty(input.note.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host wishlist item created.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateWishlistStatusInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/status"),
        &serde_json::json!({ "status": input.status.trim() }),
    )?;

    save_library_sync_success(&state, "Host wishlist item updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteWishlistItemInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/delete"),
        &serde_json::json!({}),
    )?;

    save_library_sync_success(&state, "Host wishlist item deleted.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/delete"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host spool removed.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn purge_library_sync_host_spool(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteSpoolInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

    let spool_id = input.spool_id.trim();
    if spool_id.is_empty() {
        return Err("Spool id is required.".to_string());
    }

    perform_library_sync_host_write(
        &state,
        &normalized_base_url,
        &format!("/api/v1/spools/{spool_id}/purge"),
        &serde_json::json!({
            "reason": trimmed_non_empty(input.reason.as_deref()),
        }),
    )?;

    save_library_sync_success(&state, "Host spool purged.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn create_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreatePrinterInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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

    save_library_sync_success(&state, "Host printer saved.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_printer(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeletePrinterInput,
) -> Result<(), String> {
    let (normalized_base_url, _) = prepare_library_sync_host_write(&ValidateLibrarySyncHostInput {
        base_url: input.base_url.clone(),
        expected_library_id: input.expected_library_id.clone(),
    })?;

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

    save_library_sync_success(&state, "Host printer deleted.", None)?;
    Ok(())
}
