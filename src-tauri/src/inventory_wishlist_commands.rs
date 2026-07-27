use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::inventory_engine::{ReceiveWishlistItemInput, UpdateWishlistStatusInput};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn update_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: UpdateWishlistStatusInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.update_wishlist_item_status(input))
}

#[tauri::command]
pub(crate) fn receive_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: ReceiveWishlistItemInput,
) -> Result<WishlistReceiptResult, String> {
    with_inventory(&state, |engine| engine.receive_wishlist_item(input))
}

#[tauri::command]
pub(crate) fn delete_wishlist_item(
    state: tauri::State<'_, AppState>,
    item_id: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_wishlist_item(&item_id))
}
