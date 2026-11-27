use crate::active_library_gateway::{
    require_authoritative_local_mode, with_authoritative_local_library,
};
use crate::app_error::coded_command_error;
use crate::backend::database_wishlist_models::DashboardPurchaseResult;
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
    expected_target: WishlistPurchaseTarget,
) -> Result<(), String> {
    create_local_wishlist_item(&state, input, Some(&expected_target))
}

pub(crate) fn create_local_wishlist_item(
    state: &AppState,
    input: CreateWishlistItemInput,
    expected: Option<&WishlistPurchaseTarget>,
) -> Result<(), String> {
    with_reviewed_local_target(state, expected, || {
        with_inventory(state, |engine| engine.create_wishlist_item(input))
    })
}

pub(crate) fn with_reviewed_local_target<T>(
    state: &AppState,
    expected: Option<&WishlistPurchaseTarget>,
    run: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
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
    run()
}

#[tauri::command]
pub(crate) async fn ensure_dashboard_purchase(
    state: tauri::State<'_, AppState>,
    input: CreateWishlistItemInput,
    target: WishlistPurchaseTarget,
) -> Result<DashboardPurchaseResult, String> {
    let state = state.inner().clone();
    crate::library_sync_blocking_executor::run_library_sync_blocking(move || {
        ensure_dashboard_purchase_blocking(&state, input, target)
    })
    .await
}

pub(crate) fn ensure_dashboard_purchase_blocking(
    state: &AppState,
    input: CreateWishlistItemInput,
    target: WishlistPurchaseTarget,
) -> Result<DashboardPurchaseResult, String> {
    if target.mode != "CLIENT" {
        return with_reviewed_local_target(state, Some(&target), || {
            with_inventory(state, |engine| engine.ensure_dashboard_purchase(input))
        });
    }
    let url = target
        .host_base_url
        .as_deref()
        .filter(|_| !target.library_id.trim().is_empty())
        .ok_or_else(|| coded_command_error("common.invalid_request"))?;
    let host =
        crate::library_sync_command_support::library_sync_host_input(url, Some(&target.library_id));
    let (_, health, peer) =
        crate::library_sync_command_support::prepare_library_sync_host_write_for_generation(
            state,
            &host,
            Some(target.target_generation),
        )?;
    if !health
        .capabilities
        .iter()
        .any(|c| c == crate::companion_models::DASHBOARD_PURCHASE_CAPABILITY)
    {
        return Err(coded_command_error("purchase_metadata.host_unsupported"));
    }
    let result =
        crate::library_sync_host_client::perform_library_sync_host_write_and_parse_for_target(
            state,
            "/api/v1/wishlist/dashboard-purchase",
            &input,
            &peer,
            None,
        )?;
    crate::library_sync_cache_refresh::refresh_library_sync_wishlist_cache(state, &peer);
    Ok(result)
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
