use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreateSpoolInput, CreateWishlistItemInput,
};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn create_spool(
    state: tauri::State<'_, AppState>,
    input: CreateSpoolInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.create_spool(input))
    })
}

#[tauri::command]
pub(crate) fn create_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: CreateWishlistItemInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.create_wishlist_item(input))
    })
}

#[tauri::command]
pub(crate) fn create_manual_spool(
    state: tauri::State<'_, AppState>,
    input: CreateManualSpoolInput,
) -> Result<(), String> {
    companion_service(&state)
        .create_manual_spool(input)
        .map_err(inventory_error_to_string)
}
