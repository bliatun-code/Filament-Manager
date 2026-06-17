use crate::backend::inventory_engine::{
    UpdateMasterCatalogEntryInput, UpdateSpoolDetailsInput, UpdateSpoolOwnershipInput,
    UpdateSpoolRfidTagInput, WeightSource,
};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;
use crate::with_inventory;

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
pub(crate) fn update_spool_ownership(
    state: tauri::State<'_, AppState>,
    input: UpdateSpoolOwnershipInput,
) -> Result<(), String> {
    companion_service(&state)
        .update_spool_ownership(input)
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
pub(crate) fn assign_location(
    state: tauri::State<'_, AppState>,
    spool_id: String,
    location_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.assign_location(&spool_id, location_id.as_deref())
    })
}
