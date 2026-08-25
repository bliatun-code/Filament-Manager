use crate::backend::filament_database::{InventoryLocationMergeResult, InventoryLocationRow};
use crate::inventory_location_models::{
    CreateInventoryLocationInput, InventoryLocationIdInput, MergeInventoryLocationsInput,
    RenameInventoryLocationInput,
};
use crate::state::AppState;
use crate::with_db;

#[tauri::command]
pub(crate) fn list_inventory_locations(
    state: tauri::State<'_, AppState>,
    include_archived: Option<bool>,
) -> Result<Vec<InventoryLocationRow>, String> {
    with_db(&state, |db| {
        db.list_inventory_locations(include_archived.unwrap_or(false))
    })
}

#[tauri::command]
pub(crate) fn create_inventory_location(
    state: tauri::State<'_, AppState>,
    input: CreateInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    with_db(&state, |db| {
        db.create_inventory_location(&input.name, input.parent_id.as_deref())
    })
}

#[tauri::command]
pub(crate) fn rename_inventory_location(
    state: tauri::State<'_, AppState>,
    input: RenameInventoryLocationInput,
) -> Result<InventoryLocationRow, String> {
    with_db(&state, |db| {
        db.rename_inventory_location(&input.location_id, &input.name)
    })
}

#[tauri::command]
pub(crate) fn archive_inventory_location(
    state: tauri::State<'_, AppState>,
    input: InventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    with_db(&state, |db| {
        db.archive_inventory_location(&input.location_id)
    })
}

#[tauri::command]
pub(crate) fn restore_inventory_location(
    state: tauri::State<'_, AppState>,
    input: InventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    with_db(&state, |db| {
        db.restore_inventory_location(&input.location_id)
    })
}

#[tauri::command]
pub(crate) fn delete_inventory_location(
    state: tauri::State<'_, AppState>,
    input: InventoryLocationIdInput,
) -> Result<InventoryLocationRow, String> {
    with_db(&state, |db| {
        db.delete_inventory_location(&input.location_id)
    })
}

#[tauri::command]
pub(crate) fn merge_inventory_locations(
    state: tauri::State<'_, AppState>,
    input: MergeInventoryLocationsInput,
) -> Result<InventoryLocationMergeResult, String> {
    with_db(&state, |db| {
        db.merge_inventory_locations(&input.source_id, &input.target_id)
    })
}
