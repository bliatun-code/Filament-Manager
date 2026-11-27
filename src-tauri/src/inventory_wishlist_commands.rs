use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::inventory_engine::{ReceiveWishlistItemInput, UpdateWishlistStatusInput};
use crate::inventory_create_commands::{with_reviewed_local_target, WishlistPurchaseTarget};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn update_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: UpdateWishlistStatusInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.update_wishlist_item_status(input))
    })
}

#[tauri::command]
pub(crate) fn receive_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: ReceiveWishlistItemInput,
) -> Result<WishlistReceiptResult, String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.receive_wishlist_item(input))
    })
}

#[tauri::command]
pub(crate) fn delete_wishlist_item(
    state: tauri::State<'_, AppState>,
    item_id: String,
    expected_target: WishlistPurchaseTarget,
) -> Result<(), String> {
    delete_local_wishlist_item(&state, &item_id, &expected_target)
}

pub(crate) fn delete_local_wishlist_item(
    state: &AppState,
    item_id: &str,
    expected_target: &WishlistPurchaseTarget,
) -> Result<(), String> {
    with_reviewed_local_target(state, Some(expected_target), || {
        with_inventory(state, |engine| engine.delete_wishlist_item(item_id))
    })
}
