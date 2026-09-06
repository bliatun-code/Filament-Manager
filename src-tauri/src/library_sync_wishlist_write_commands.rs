use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
use crate::companion_models::WISHLIST_RECEIPT_LOCATION_CAPABILITY;
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_spool_cache, refresh_library_sync_wishlist_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input, prepare_library_sync_host_write,
    purchase_receipt_metadata_has_values, require_host_purchase_receipt_metadata_capability,
    save_library_sync_success, trimmed_non_empty,
};
use crate::library_sync_host_client::{
    perform_library_sync_host_write, perform_library_sync_host_write_and_parse,
};
use crate::library_sync_location_commands::refresh_location_cache_best_effort;
use crate::library_sync_models::{
    LibrarySyncCreateWishlistItemInput, LibrarySyncDeleteWishlistItemInput,
    LibrarySyncReceiveWishlistItemInput, LibrarySyncUpdateWishlistStatusInput,
};
use crate::library_sync_target_guard::ensure_library_sync_target_current;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn create_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        create_library_sync_host_wishlist_item_blocking(&state, input)
    })
    .await
}

fn create_library_sync_host_wishlist_item_blocking(
    state: &AppState,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    perform_library_sync_host_write(
        state,
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

    refresh_library_sync_wishlist_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host wishlist item created.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn update_library_sync_host_wishlist_item_status(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncUpdateWishlistStatusInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        update_library_sync_host_wishlist_item_status_blocking(&state, input)
    })
    .await
}

fn update_library_sync_host_wishlist_item_status_blocking(
    state: &AppState,
    input: LibrarySyncUpdateWishlistStatusInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    let item_id = encode_library_sync_path_segment(item_id);
    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/status"),
        &serde_json::json!({ "status": input.status.trim() }),
    )?;

    refresh_library_sync_wishlist_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host wishlist item updated.", None)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn receive_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncReceiveWishlistItemInput,
) -> Result<WishlistReceiptResult, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        receive_library_sync_host_wishlist_item_blocking(&state, input)
    })
    .await
}

pub(crate) fn receive_library_sync_host_wishlist_item_blocking(
    state: &AppState,
    input: LibrarySyncReceiveWishlistItemInput,
) -> Result<WishlistReceiptResult, String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, health, target) =
        prepare_library_sync_host_write(state, &host_input)?;
    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    let item_id = encode_library_sync_path_segment(item_id);
    let payload = host_wishlist_receipt_payload_for_capabilities(
        input.quantity,
        input.purchase_metadata.as_ref(),
        input.home_location.as_deref(),
        &health.capabilities,
    )?;
    ensure_library_sync_target_current(state, &target)?;
    let result = perform_library_sync_host_write_and_parse(
        state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/receive"),
        &payload,
    )?;
    ensure_library_sync_target_current(state, &target)?;
    refresh_library_sync_spool_cache(state, &normalized_base_url, &target);
    refresh_library_sync_wishlist_cache(state, &normalized_base_url, &target);
    if payload.get("home_location").is_some() {
        refresh_location_cache_best_effort(state, &normalized_base_url, &target);
    }
    save_library_sync_success(state, &target, "Host wishlist receipt saved.", None)?;
    Ok(result)
}

fn host_wishlist_receipt_payload(
    quantity: i64,
    purchase_metadata: Option<&PurchaseReceiptMetadata>,
    home_location: Option<&str>,
) -> serde_json::Value {
    let mut payload = serde_json::Map::new();
    payload.insert("quantity".to_string(), serde_json::json!(quantity));
    if let Some(home_location) = home_location {
        payload.insert(
            "home_location".to_string(),
            serde_json::json!(home_location),
        );
    }
    if let Some(purchase_metadata) = purchase_metadata {
        payload.insert(
            "purchase_metadata".to_string(),
            serde_json::json!(purchase_metadata),
        );
    }
    serde_json::Value::Object(payload)
}

fn host_wishlist_receipt_payload_for_capabilities(
    quantity: i64,
    purchase_metadata: Option<&PurchaseReceiptMetadata>,
    home_location: Option<&str>,
    capabilities: &[String],
) -> Result<serde_json::Value, String> {
    let home_location = home_location
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if home_location.is_some()
        && !capabilities
            .iter()
            .any(|value| value == WISHLIST_RECEIPT_LOCATION_CAPABILITY)
    {
        return Err(crate::app_error::coded_command_error(
            "wishlist.receive.location_host_unsupported",
        ));
    }
    let purchase_metadata =
        purchase_metadata.filter(|metadata| purchase_receipt_metadata_has_values(metadata));
    require_host_purchase_receipt_metadata_capability(capabilities, purchase_metadata.is_some())?;
    Ok(host_wishlist_receipt_payload(
        quantity,
        purchase_metadata,
        home_location,
    ))
}

#[tauri::command]
pub(crate) async fn delete_library_sync_host_wishlist_item(
    state: tauri::State<'_, AppState>,
    input: LibrarySyncDeleteWishlistItemInput,
) -> Result<(), String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || {
        delete_library_sync_host_wishlist_item_blocking(&state, input)
    })
    .await
}

fn delete_library_sync_host_wishlist_item_blocking(
    state: &AppState,
    input: LibrarySyncDeleteWishlistItemInput,
) -> Result<(), String> {
    let host_input = library_sync_host_input(&input.base_url, input.expected_library_id.as_deref());
    let (normalized_base_url, _, target) = prepare_library_sync_host_write(state, &host_input)?;

    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    let item_id = encode_library_sync_path_segment(item_id);
    perform_library_sync_host_write(
        state,
        &normalized_base_url,
        &format!("/api/v1/wishlist/{item_id}/delete"),
        &serde_json::json!({}),
    )?;

    refresh_library_sync_wishlist_cache(state, &normalized_base_url, &target);
    save_library_sync_success(state, &target, "Host wishlist item deleted.", None)?;
    Ok(())
}

#[cfg(test)]
#[path = "library_sync_wishlist_receipt_location_tests.rs"]
mod receipt_location_tests;

#[cfg(test)]
mod tests {
    use super::host_wishlist_receipt_payload_for_capabilities;
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::companion_models::PURCHASE_RECEIPT_METADATA_CAPABILITY;

    #[test]
    fn host_receipt_payload_omits_empty_metadata_but_preserves_meaningful_fields() {
        assert_eq!(
            host_wishlist_receipt_payload_for_capabilities(2, None, None, &[])
                .expect("legacy receipt"),
            serde_json::json!({ "quantity": 2 })
        );

        assert_eq!(
            host_wishlist_receipt_payload_for_capabilities(
                2,
                Some(&PurchaseReceiptMetadata::default()),
                None,
                &[],
            )
            .expect("all-null receipt metadata is not meaningful"),
            serde_json::json!({ "quantity": 2 })
        );

        let metadata = PurchaseReceiptMetadata {
            purchase_price: Some(249.5),
            purchase_currency: Some("NOK".to_string()),
            purchase_date: Some("2026-08-21".to_string()),
            batch_code: Some("batch-7".to_string()),
            supplier_reference: Some("po-19".to_string()),
        };
        let unsupported =
            host_wishlist_receipt_payload_for_capabilities(3, Some(&metadata), None, &[])
                .expect_err("meaningful metadata must be rejected for a legacy Host");
        let unsupported: serde_json::Value =
            serde_json::from_str(&unsupported).expect("coded unsupported error");
        assert_eq!(unsupported["code"], "purchase_metadata.host_unsupported");

        assert_eq!(
            host_wishlist_receipt_payload_for_capabilities(
                3,
                Some(&metadata),
                None,
                &[PURCHASE_RECEIPT_METADATA_CAPABILITY.to_string()],
            )
            .expect("capable Host receipt"),
            serde_json::json!({
                "quantity": 3,
                "purchase_metadata": {
                    "purchase_price": 249.5,
                    "purchase_currency": "NOK",
                    "purchase_date": "2026-08-21",
                    "batch_code": "batch-7",
                    "supplier_reference": "po-19"
                }
            })
        );
    }
}
