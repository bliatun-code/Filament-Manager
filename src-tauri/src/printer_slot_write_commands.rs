use crate::backend::inventory_engine::AssignPrinterSlotInput;
use crate::printer_command_support::companion_service;
use crate::state::AppState;

#[tauri::command]
pub(crate) fn assign_printer_slot(
    state: tauri::State<'_, AppState>,
    input: AssignPrinterSlotInput,
) -> Result<(), String> {
    companion_service(&state)
        .assign_printer_slot(
            input.printer_id.trim(),
            input.slot_id.trim(),
            input
                .spool_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_tray_uuid
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input
                .rfid_override_color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty()),
            input.clear_live_cache_before_next_refresh.unwrap_or(false),
        )
        .map_err(|error| error.to_string())
}
