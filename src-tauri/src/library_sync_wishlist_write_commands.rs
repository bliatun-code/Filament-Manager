use crate::backend::filament_database::WishlistReceiptResult;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_spool_cache, refresh_library_sync_wishlist_cache,
};
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::{
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_models::{
    LibrarySyncCreateWishlistItemInput, LibrarySyncDeleteWishlistItemInput,
    LibrarySyncReceiveWishlistItemInput, LibrarySyncUpdateWishlistStatusInput,
};
use crate::state::AppState;

#[tauri::command]
pub(crate) fn create_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

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

    refresh_library_sync_wishlist_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host wishlist item created.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn update_library_sync_host_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateWishlistStatusInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

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

    refresh_library_sync_wishlist_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host wishlist item updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) fn receive_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReceiveWishlistItemInput,
) -> Result<WishlistReceiptResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;
    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    let result = perform_library_sync_host_write_and_parse(
        &state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/receive"),
        &serde_json::json!({ "quantity": input.quantity }),
    )?;
    refresh_library_sync_spool_cache(&state, &normalized_base_url);
    refresh_library_sync_wishlist_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host wishlist receipt saved.", None)?;
    Ok(result)
}

#[tauri::command]
pub(crate) fn delete_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteWishlistItemInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _) = prepare_library_sync_host_write(&host_input)?;

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

    refresh_library_sync_wishlist_cache(&state, &normalized_base_url);
    save_library_sync_success(&state, "Host wishlist item deleted.", None)?;
    Ok(())
}
