use crate::app_services::CompanionService;
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, InventoryError, PrinterOverviewRow,
    PrinterRow,
};
use crate::backend::inventory_engine::{
    AssignPrinterSlotInput, CreatePrinterInput, RecordPrintUsageInput,
};
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

#[derive(Serialize, Deserialize)]
pub(crate) struct SaveBambuLiveIntegrationInput {
    printer_id: String,
    enabled: bool,
    host: Option<String>,
    access_code: Option<String>,
    printer_serial: Option<String>,
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

#[tauri::command]
pub(crate) fn list_printer_overview(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<PrinterOverviewRow>, String> {
    companion_service(&state)
        .list_printer_overview()
        .map_err(inventory_error_to_string)
}

#[tauri::command]
pub(crate) fn create_printer(
    state: tauri::State<'_, AppState>,
    input: CreatePrinterInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.create_printer(input))
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
            return Err(crate::backend::filament_database::InventoryError::NotFound);
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

#[tauri::command]
pub(crate) fn delete_printer(
    state: tauri::State<'_, AppState>,
    printer_id: String,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.delete_printer(&printer_id))
}

#[tauri::command]
pub(crate) fn set_active_printer(
    state: tauri::State<'_, AppState>,
    printer_id: Option<String>,
) -> Result<(), String> {
    with_inventory(&state, |engine| {
        engine.set_active_printer(printer_id.as_deref())
    })
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
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn record_print_usage(
    state: tauri::State<'_, AppState>,
    input: RecordPrintUsageInput,
) -> Result<(), String> {
    with_inventory(&state, |engine| engine.record_print_usage(input))
}

fn supported_printer_models() -> Vec<String> {
    vec![
        "Bambu Lab X1 Carbon",
        "Bambu Lab X1E",
        "Bambu Lab P1S",
        "Bambu Lab P1P",
        "Bambu Lab A1",
        "Bambu Lab A1 mini",
        "Bambu Lab H2D",
        "Prusa CORE One",
        "Prusa CORE One+",
        "Prusa XL",
        "Prusa XL (Single Toolhead)",
        "Prusa XL (Dual Toolhead)",
        "Prusa XL (Five Toolhead)",
        "Prusa MK4S",
        "Prusa MK4",
        "Prusa MK3.9S",
        "Prusa MK3.9",
        "Prusa MK3.5S",
        "Prusa MK3.5",
        "Prusa MINI+",
        "Prusa i3 MK3S+",
        "Creality K1",
        "Creality K1 Max",
        "Anycubic Kobra 2",
        "Custom model",
    ]
    .into_iter()
    .map(String::from)
    .collect()
}

fn companion_service(state: &AppState) -> CompanionService {
    CompanionService::new(state.db_path.clone())
}

fn inventory_error_to_string(error: InventoryError) -> String {
    format!("{error:?}")
}
