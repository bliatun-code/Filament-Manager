use crate::backend::filament_database::{
    FilamentPriceBatchInput, FilamentPriceBatchReceipt, FilamentStandardsSettings,
    FilamentStandardsSnapshot,
};
use crate::backend::{filament_database::FilamentDatabase, filament_standards::normalize_currency};
use crate::companion_models::DEFAULT_PURCHASE_CURRENCY_CAPABILITY;
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::library_sync_blocking_executor::run_library_sync_blocking;
use crate::library_sync_command_support::{
    library_sync_host_input, prepare_library_sync_host_write_for_generation,
    require_host_filament_price_standards_capability,
};
use crate::library_sync_host_client::get_library_sync_host_json_authenticated_for_target as host_get;
use crate::library_sync_target_guard::LibraryReadTarget;
use crate::state::AppState;

#[tauri::command]
pub(crate) async fn get_default_purchase_currency(
    state: tauri::State<'_, AppState>,
    target: LibraryReadTarget,
) -> Result<Option<String>, String> {
    let state = state.inner().clone();
    run_library_sync_blocking(move || default_purchase_currency_blocking(&state, target)).await
}

pub(crate) fn default_purchase_currency_blocking(
    state: &AppState,
    target: LibraryReadTarget,
) -> Result<Option<String>, String> {
    let Some(url) = target.base_url.as_deref() else {
        return target.with_database(state, FilamentDatabase::default_purchase_currency);
    };
    if target.expected_library_id.trim().is_empty() {
        return Err(crate::app_error::coded_command_error(
            "common.invalid_request",
        ));
    }
    let input = library_sync_host_input(url, Some(&target.expected_library_id));
    let (_, health, peer) = prepare_library_sync_host_write_for_generation(
        state,
        &input,
        Some(target.target_generation),
    )?;
    let currency = if health
        .capabilities
        .iter()
        .any(|c| c == DEFAULT_PURCHASE_CURRENCY_CAPABILITY)
    {
        host_get(state, "/api/v1/library/default-purchase-currency", &peer)?
    } else {
        // Older Hosts carry the preference alongside every price group. Deserialize
        // just the requested field and return the scalar across the native bridge.
        #[derive(serde::Deserialize)]
        struct LegacyStandards {
            settings: LegacySettings,
        }
        #[derive(serde::Deserialize)]
        struct LegacySettings {
            default_purchase_currency: Option<String>,
        }
        require_host_filament_price_standards_capability(&health.capabilities, true)?;
        host_get::<LegacyStandards>(state, "/api/v1/library/filament-standards", &peer)?
            .settings
            .default_purchase_currency
    };
    Ok(currency.and_then(|raw| normalize_currency(raw).ok()))
}

#[tauri::command]
pub(crate) fn get_filament_standards(
    state: tauri::State<'_, AppState>,
) -> Result<FilamentStandardsSnapshot, String> {
    companion_service(&state)
        .get_filament_standards()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn save_filament_standards(
    state: tauri::State<'_, AppState>,
    settings: FilamentStandardsSettings,
) -> Result<FilamentStandardsSnapshot, String> {
    companion_service(&state)
        .save_filament_standards(settings)
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn apply_filament_price_batch(
    state: tauri::State<'_, AppState>,
    input: FilamentPriceBatchInput,
) -> Result<FilamentPriceBatchReceipt, String> {
    companion_service(&state)
        .apply_filament_price_batch(input)
        .map_err(inventory_error_to_string)
}
