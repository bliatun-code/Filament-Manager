use crate::app_error::coded_command_error;
use crate::backend::inventory_engine::{AssignPrinterSlotInput, PrinterSlotOperationInput};
use crate::optional_update::OptionalUpdate;
use crate::printer_command_support::{companion_service, inventory_error_to_string};
use crate::state::AppState;
use serde::Deserialize;

// The public core DTO remains compatible with existing callers. At the desktop
// boundary omission must never become an intentional empty-slot precondition.
#[derive(Deserialize)]
pub(crate) struct DesktopPrinterSlotOperationInput {
    pub(crate) printer_id: String,
    pub(crate) slot_id: String,
    #[serde(default)]
    pub(crate) expected_current_spool_id: OptionalUpdate<String>,
    #[serde(default)]
    pub(crate) target_spool_id: OptionalUpdate<String>,
    pub(crate) outgoing_measured_total_g: Option<i64>,
    pub(crate) incoming_measured_total_g: Option<i64>,
}

impl DesktopPrinterSlotOperationInput {
    pub(crate) fn into_operation(self) -> Result<PrinterSlotOperationInput, String> {
        let required_nullable = |value: OptionalUpdate<String>| match value {
            OptionalUpdate::Unset => Err(coded_command_error("common.invalid_request")),
            OptionalUpdate::Set(value) => value
                .map(|value| {
                    let value = value.trim();
                    if value.is_empty() {
                        Err(coded_command_error("common.invalid_request"))
                    } else {
                        Ok(value.to_string())
                    }
                })
                .transpose(),
        };
        if self.printer_id.trim().is_empty() || self.slot_id.trim().is_empty() {
            return Err(coded_command_error("common.invalid_request"));
        }
        Ok(PrinterSlotOperationInput {
            printer_id: self.printer_id.trim().into(),
            slot_id: self.slot_id.trim().into(),
            expected_current_spool_id: required_nullable(self.expected_current_spool_id)?,
            target_spool_id: required_nullable(self.target_spool_id)?,
            outgoing_measured_total_g: self.outgoing_measured_total_g,
            incoming_measured_total_g: self.incoming_measured_total_g,
        })
    }
}

#[tauri::command]
pub(crate) fn operate_printer_slot(
    state: tauri::State<'_, AppState>,
    input: DesktopPrinterSlotOperationInput,
) -> Result<(), String> {
    operate_printer_slot_blocking(&state, input)
}

pub(crate) fn operate_printer_slot_blocking(
    state: &AppState,
    input: DesktopPrinterSlotOperationInput,
) -> Result<(), String> {
    companion_service(state)
        .operate_printer_slot(input.into_operation()?)
        .map_err(inventory_error_to_string)
}

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
        .map_err(inventory_error_to_string)
}
