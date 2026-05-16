use crate::backend::filament_database::{BambuLiveIntegrationEntryRow, PrinterRow};
use crate::printer_models::supported_printer_models;
use crate::state::AppState;
use crate::{with_db, with_inventory};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub(crate) struct PrinterSettingsSnapshot {
    active_printer_id: Option<String>,
    printers: Vec<PrinterRow>,
    printer_models: Vec<String>,
    bambu_live_integrations: Vec<BambuLiveIntegrationEntryRow>,
}

#[tauri::command]
pub(crate) fn get_printer_settings(
    state: tauri::State<'_, AppState>,
) -> Result<PrinterSettingsSnapshot, String> {
    let bambu_live_integrations = with_db(&state, |db| db.list_bambu_live_integrations())?;
    with_inventory(&state, |engine| {
        Ok(PrinterSettingsSnapshot {
            active_printer_id: engine.get_active_printer()?,
            printers: engine.list_printers()?,
            printer_models: supported_printer_models(),
            bambu_live_integrations,
        })
    })
}
