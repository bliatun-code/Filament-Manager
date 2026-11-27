use crate::app_error::{coded_command_error, inventory_error_to_command_string};
use crate::backend::filament_database::WishlistReceiptResult;
use crate::backend::inventory_engine::{
    validate_wishlist_receipt_quantity, validate_wishlist_receipt_request_id,
};
use crate::companion_models::{
    WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY, WISHLIST_RECEIPT_LOCATION_CAPABILITY,
};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_cache_refresh::{
    refresh_library_sync_spool_cache, refresh_library_sync_wishlist_cache,
};
use crate::library_sync_command_support::{
    encode_library_sync_path_segment, library_sync_host_input,
    prepare_library_sync_host_write_for_generation, purchase_receipt_metadata_has_values,
    require_host_purchase_receipt_metadata_capability, save_library_sync_success,
    trimmed_non_empty,
};
use crate::library_sync_host_client::{
    library_sync_host_error_code, perform_library_sync_host_write_and_parse,
    perform_library_sync_host_write_and_parse_for_target,
};
use crate::library_sync_location_commands::refresh_location_cache_best_effort;
use crate::library_sync_models::{
    LibrarySyncCreateWishlistItemInput, LibrarySyncDeleteWishlistItemInput,
    LibrarySyncReceiveWishlistItemInput, LibrarySyncUpdateWishlistStatusInput,
};
use crate::library_sync_target_guard::{
    ensure_library_sync_target_current, LibrarySyncTargetGuard,
};
use crate::state::AppState;
use std::time::Duration;

fn purchase_write_target(
    state: &AppState,
    base_url: &str,
    library_id: &str,
    generation: u64,
) -> Result<LibrarySyncTargetGuard, String> {
    if library_id.trim().is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let input = library_sync_host_input(base_url, Some(library_id));
    let (_, _, target) =
        prepare_library_sync_host_write_for_generation(state, &input, Some(generation))?;
    Ok(target)
}

fn write_purchase_and_refresh(
    state: &AppState,
    target: &LibrarySyncTargetGuard,
    path: &str,
    payload: &serde_json::Value,
    message: &str,
) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    struct PurchaseAcknowledgment {
        ok: bool,
    }
    let acknowledgment: PurchaseAcknowledgment =
        perform_library_sync_host_write_and_parse(state, path, payload, target)?;
    if !acknowledgment.ok {
        return Err(coded_command_error("common.internal"));
    }

    // Once the Host confirms the write, local bookkeeping cannot undo it.
    refresh_library_sync_wishlist_cache(state, target);
    let _ = save_library_sync_success(state, target, message, None);
    Ok(())
}

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

pub(crate) fn create_library_sync_host_wishlist_item_blocking(
    state: &AppState,
    input: LibrarySyncCreateWishlistItemInput,
) -> Result<(), String> {
    let target = purchase_write_target(
        state,
        &input.base_url,
        &input.expected_library_id,
        input.expected_target_generation,
    )?;

    write_purchase_and_refresh(
        state,
        &target,
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
        "Host wishlist item created.",
    )
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
    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let target = purchase_write_target(
        state,
        &input.base_url,
        &input.expected_library_id,
        input.expected_target_generation,
    )?;

    let item_id = encode_library_sync_path_segment(item_id);
    write_purchase_and_refresh(
        state,
        &target,
        &format!("/api/v1/wishlist/{item_id}/status"),
        &serde_json::json!({ "status": input.status.trim() }),
        "Host wishlist item updated.",
    )
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
    validate_wishlist_receipt_quantity(input.quantity)
        .map_err(inventory_error_to_command_string)?;
    if let Some(request_id) = input.request_id.as_deref() {
        validate_wishlist_receipt_request_id(request_id)
            .map_err(inventory_error_to_command_string)?;
    } else if input.retry {
        return Err(coded_command_error("wishlist.receive.request_id_invalid"));
    }

    let not_sent = |error| {
        if input.request_id.is_some() {
            coded_command_error("wishlist.receive.not_sent")
        } else {
            error
        }
    };
    if input.expected_library_id.trim().is_empty() {
        return Err(not_sent(coded_command_error("common.invalid_request")));
    }
    let host_input = library_sync_host_input(&input.base_url, Some(&input.expected_library_id));
    let (_, health, target) = prepare_library_sync_host_write_for_generation(
        state,
        &host_input,
        Some(input.expected_target_generation),
    )
    .map_err(not_sent)?;
    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err("Wishlist item id is required.".to_string());
    }

    let payload = host_wishlist_receipt_payload_for_capabilities(&input, &health.capabilities)?;
    let sent_request_id = payload.get("request_id").is_some();
    // An older Host does not recognize this route, even if it replaces the
    // verified Host after capability discovery and before the write.
    let endpoint = if sent_request_id {
        "receive-idempotent"
    } else {
        "receive"
    };
    let item_id = encode_library_sync_path_segment(item_id);
    ensure_library_sync_target_current(state, &target).map_err(not_sent)?;
    let result = perform_library_sync_host_write_and_parse_for_target(
        state,
        &format!("/api/v1/wishlist/{item_id}/{endpoint}"),
        &payload,
        &target,
        sent_request_id.then_some(Duration::from_secs(30)),
    )
    .map_err(|error| {
        if input.request_id.is_none() || receipt_was_rejected(&error) {
            error
        } else if sent_request_id {
            coded_command_error("wishlist.receive.outcome_unknown")
        } else {
            coded_command_error("wishlist.receive.outcome_unknown_legacy_host")
        }
    })?;
    refresh_library_sync_spool_cache(state, &target);
    refresh_library_sync_wishlist_cache(state, &target);
    if payload.get("home_location").is_some() {
        refresh_location_cache_best_effort(state, &target);
    }
    let saved = save_library_sync_success(state, &target, "Host wishlist receipt saved.", None);
    if input.request_id.is_none() {
        saved?;
    }
    Ok(result)
}

fn receipt_was_rejected(error: &str) -> bool {
    library_sync_host_error_code(error).is_some_and(|code| {
        code.starts_with("purchase_metadata.")
            || code.starts_with("inventory.location.")
            || matches!(
                code.as_str(),
                "wishlist.receive.quantity_invalid"
                    | "wishlist.receive.quantity_too_large"
                    | "wishlist.receive.request_id_invalid"
                    | "wishlist.receive.request_conflict"
                    | "wishlist.receive.quantity_exceeds_remaining"
                    | "wishlist.receive.already_received"
                    | "common.not_found"
                    | "common.unauthorized"
                    | "common.forbidden"
            )
    })
}

fn host_wishlist_receipt_payload_for_capabilities(
    input: &LibrarySyncReceiveWishlistItemInput,
    capabilities: &[String],
) -> Result<serde_json::Value, String> {
    let has_idempotency = capabilities
        .iter()
        .any(|value| value == WISHLIST_RECEIPT_IDEMPOTENCY_CAPABILITY);
    if input.retry && !has_idempotency {
        return Err(coded_command_error(
            "wishlist.receive.retry_host_unsupported",
        ));
    }

    let home_location = trimmed_non_empty(input.home_location.as_deref());
    if home_location.is_some()
        && !capabilities
            .iter()
            .any(|value| value == WISHLIST_RECEIPT_LOCATION_CAPABILITY)
    {
        return Err(coded_command_error(
            "wishlist.receive.location_host_unsupported",
        ));
    }
    let purchase_metadata = input
        .purchase_metadata
        .as_ref()
        .filter(|metadata| purchase_receipt_metadata_has_values(metadata));
    require_host_purchase_receipt_metadata_capability(capabilities, purchase_metadata.is_some())?;

    let mut payload = serde_json::json!({"quantity": input.quantity});
    if let Some(request_id) = input.request_id.as_deref().filter(|_| has_idempotency) {
        payload["request_id"] = serde_json::json!(request_id);
    }
    if let Some(home_location) = home_location {
        payload["home_location"] = serde_json::json!(home_location);
    }
    if let Some(purchase_metadata) = purchase_metadata {
        payload["purchase_metadata"] = serde_json::json!(purchase_metadata);
    }
    Ok(payload)
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
    let item_id = input.item_id.trim();
    if item_id.is_empty() {
        return Err(coded_command_error("common.invalid_request"));
    }
    let target = purchase_write_target(
        state,
        &input.base_url,
        &input.expected_library_id,
        input.expected_target_generation,
    )?;

    let item_id = encode_library_sync_path_segment(item_id);
    write_purchase_and_refresh(
        state,
        &target,
        &format!("/api/v1/wishlist/{item_id}/delete"),
        &serde_json::json!({}),
        "Host wishlist item deleted.",
    )
}

#[cfg(test)]
#[path = "library_sync_wishlist_receipt_location_tests.rs"]
mod receipt_location_tests;

#[cfg(test)]
mod tests {
    use super::{
        host_wishlist_receipt_payload_for_capabilities, LibrarySyncReceiveWishlistItemInput,
    };
    use crate::backend::purchase_receipt_metadata::PurchaseReceiptMetadata;
    use crate::companion_models::PURCHASE_RECEIPT_METADATA_CAPABILITY;

    #[test]
    fn host_receipt_payload_omits_empty_metadata_but_preserves_meaningful_fields() {
        let payload = |quantity, purchase_metadata, capabilities: &[String]| {
            host_wishlist_receipt_payload_for_capabilities(
                &LibrarySyncReceiveWishlistItemInput {
                    base_url: "http://host.local".to_string(),
                    expected_library_id: "library".into(),
                    expected_target_generation: 1,
                    item_id: "order".to_string(),
                    quantity,
                    request_id: None,
                    retry: false,
                    home_location: None,
                    purchase_metadata,
                },
                capabilities,
            )
        };
        assert_eq!(
            payload(2, None, &[]).expect("legacy receipt"),
            serde_json::json!({ "quantity": 2 })
        );

        assert_eq!(
            payload(2, Some(PurchaseReceiptMetadata::default()), &[])
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
        let unsupported = payload(3, Some(metadata.clone()), &[])
            .expect_err("meaningful metadata must be rejected for a legacy Host");
        let unsupported: serde_json::Value =
            serde_json::from_str(&unsupported).expect("coded unsupported error");
        assert_eq!(unsupported["code"], "purchase_metadata.host_unsupported");

        assert_eq!(
            payload(
                3,
                Some(metadata),
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
