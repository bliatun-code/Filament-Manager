use crate::active_library_gateway::{
    require_authoritative_local_mode, with_authoritative_local_library,
};
use crate::app_error::coded_command_error;
use crate::backend::filament_database::FilamentDatabase;
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreateSpoolInput, CreateWishlistItemInput,
};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use crate::{with_db, with_inventory};

#[tauri::command]
pub(crate) fn create_spool(
    state: tauri::State<'_, AppState>,
    input: CreateSpoolInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.create_spool(input))
    })
}

#[derive(serde::Deserialize)]
pub(crate) struct WishlistPurchaseTarget {
    mode: String,
    library_id: String,
    target_generation: u64,
    host_base_url: Option<String>,
}

#[tauri::command]
pub(crate) fn create_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: CreateWishlistItemInput,
    expected_target: Option<WishlistPurchaseTarget>,
) -> Result<(), String> {
    create_local_wishlist_item(&state, input, expected_target.as_ref())
}

pub(crate) fn create_local_wishlist_item(
    state: &AppState,
    input: CreateWishlistItemInput,
    expected: Option<&WishlistPurchaseTarget>,
) -> Result<(), String> {
    let _gate = lock_secure_credential_mutation()?;
    let status = with_db(state, FilamentDatabase::get_library_sync_page_status)?;
    require_authoritative_local_mode(&status.mode)?;
    if expected.is_some_and(|target| {
        target.mode != status.mode
            || target.library_id != status.library_id
            || target.host_base_url != status.host_base_url
            || target.target_generation != status.target_generation
    }) {
        return Err(coded_command_error("common.invalid_request"));
    }
    with_inventory(state, |engine| engine.create_wishlist_item(input))
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
