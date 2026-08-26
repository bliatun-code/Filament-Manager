use crate::backend::filament_database::{
    FilamentPriceBatchInput, FilamentPriceBatchReceipt, FilamentStandardsSettings,
    FilamentStandardsSnapshot,
};
use crate::inventory_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;

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
