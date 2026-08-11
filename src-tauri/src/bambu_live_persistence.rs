use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, BambuLiveTlsIdentityRow,
    FilamentDatabase,
};
use crate::bambu_live_matching::count_review_trays;
use crate::bambu_live_observation::is_live_print_running;
use crate::bambu_thermal::nozzle_thermal_state_name;
use serde_json::{json, Value};

pub(crate) fn persist_observation(
    db_path: &str,
    entry: &BambuLiveIntegrationEntryRow,
    observed_state: Option<BambuLiveObservedStateRow>,
    last_error: Option<String>,
    observed_tls_identity: Option<&BambuLiveTlsIdentityRow>,
    previous: Option<&BambuLiveObservedStateRow>,
    next: Option<&BambuLiveObservedStateRow>,
) -> Result<(), String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let applied = db
        .update_bambu_live_observation_if_current(
            &entry.printer_id,
            &entry.config,
            observed_state,
            last_error,
            observed_tls_identity,
        )
        .map_err(|error| error.to_string())?;
    if !applied {
        return Ok(());
    }
    if let Some(next_state) = next {
        log_state_changes(&db, &entry.printer_id, previous, next_state)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn log_state_changes(
    db: &FilamentDatabase,
    printer_id: &str,
    previous: Option<&BambuLiveObservedStateRow>,
    next: &BambuLiveObservedStateRow,
) -> Result<(), InventoryError> {
    let was_online = previous.map(|state| state.online).unwrap_or(false);
    if !was_online && next.online {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_ONLINE",
            &json!({"last_seen_at": next.last_seen_at, "mqtt_connected": next.mqtt_connected}),
        )?;
    } else if was_online && !next.online {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_OFFLINE",
            &json!({"last_seen_at": next.last_seen_at, "note": next.raw_status_note}),
        )?;
    }

    let was_printing = previous.map(is_live_print_running).unwrap_or(false);
    let is_printing = is_live_print_running(next);
    if !was_printing && is_printing {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_PRINT_STARTED",
            &live_print_event_payload(next, false),
        )?;
    } else if was_printing && !is_printing {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_PRINT_FINISHED",
            &live_print_event_payload(next, true),
        )?;
    }

    let previous_tray = previous.map(|state| (state.active_ams_index, state.active_tray_index));
    let next_tray = (next.active_ams_index, next.active_tray_index);
    if previous_tray != Some(next_tray)
        && let Some(active_tray_index) = next.active_tray_index
    {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_ACTIVE_TRAY_CHANGED",
            &json!({
                "active_ams_index": next.active_ams_index,
                "active_tray_index": active_tray_index,
            }),
        )?;
    }

    let previous_review_count = previous
        .map(|state| count_review_trays(&state.trays))
        .unwrap_or(0);
    let next_review_count = count_review_trays(&next.trays);
    if next_review_count > 0 && next_review_count != previous_review_count {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_MATCH_REVIEW",
            &json!({"review_trays": next_review_count}),
        )?;
    }

    Ok(())
}

fn live_print_event_payload(
    state: &BambuLiveObservedStateRow,
    include_last_seen_at: bool,
) -> Value {
    let mut payload = json!({
        "progress_percent": state.progress_percent,
        "remaining_minutes": state.remaining_minutes,
        "prepare_percent": state.prepare_percent,
        "print_stage": state.print_stage,
        "print_error_code": state.print_error_code,
        "job_state_code": state.job_state_code,
        "gcode_state": state.gcode_state,
        "print_type": state.print_type,
        "subtask_id": state.subtask_id,
        "subtask_name": state.subtask_name,
        "active_ams_index": state.active_ams_index,
        "active_tray_index": state.active_tray_index,
        "ams_status_code": state.ams_status_code,
        "ams_status_main": state.ams_status_main,
        "ams_status_sub": state.ams_status_sub,
        "nozzle_temp_c": state.nozzle_temp_c,
        "bed_temp_c": state.bed_temp_c,
        "thermal_state": nozzle_thermal_state_name(state.nozzle_temp_c),
    });
    if include_last_seen_at && let Value::Object(fields) = &mut payload {
        fields.insert("last_seen_at".to_string(), json!(state.last_seen_at));
    }
    payload
}
