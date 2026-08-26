use crate::active_library_gateway::with_authoritative_local_library;
use crate::backend::inventory_engine::{AcceptBambuLiveWeightEstimateInput, RecordPrintUsageInput};
use crate::state::AppState;
use crate::with_inventory;

#[tauri::command]
pub(crate) fn record_print_usage(
    state: tauri::State<'_, AppState>,
    input: RecordPrintUsageInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| engine.record_print_usage(input))
    })
}

#[tauri::command]
pub(crate) fn accept_bambu_live_weight_estimate(
    state: tauri::State<'_, AppState>,
    input: AcceptBambuLiveWeightEstimateInput,
) -> Result<(), String> {
    with_authoritative_local_library(&state, || {
        with_inventory(&state, |engine| {
            engine.accept_bambu_live_weight_estimate(input)
        })
    })
}
