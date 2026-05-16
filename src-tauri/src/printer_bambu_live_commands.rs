use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::BambuLiveIntegrationRow;
use crate::state::AppState;
use crate::{with_db, with_inventory};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub(crate) struct SaveBambuLiveIntegrationInput {
    printer_id: String,
    enabled: bool,
    host: Option<String>,
    access_code: Option<String>,
    printer_serial: Option<String>,
}

#[tauri::command]
pub(crate) fn save_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    input: SaveBambuLiveIntegrationInput,
) -> Result<(), String> {
    let printer_id = input.printer_id.trim();
    if printer_id.is_empty() {
        return Err("Printer id is required.".to_string());
    }
    with_inventory(&state, |engine| {
        let exists = engine
            .list_printers()?
            .into_iter()
            .any(|printer| printer.id == printer_id);
        if !exists {
            return Err(InventoryError::NotFound);
        }
        Ok(())
    })?;
    with_db(&state, |db| {
        db.save_bambu_live_integration(
            printer_id,
            &BambuLiveIntegrationRow {
                enabled: input.enabled,
                host: input
                    .host
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                access_code: input
                    .access_code
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                printer_serial: input
                    .printer_serial
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string),
                last_error: None,
                observed_state: None,
            },
        )
    })
}

#[tauri::command]
pub(crate) fn delete_bambu_live_integration(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    with_db(&state, |db| db.delete_bambu_live_integration(&printer_id))
}
