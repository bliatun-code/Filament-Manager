use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveObservedTrayRow, FilamentDatabase,
};
use crate::backend::printer_slot_live_mapping::decode_bambu_tray_coordinate;
use crate::bambu_live_sync::{
    count_review_trays, enrich_with_match_status, is_credible_finished_print_state,
    is_probable_completed_carried_print_state, tray_exist_bits_slot_present,
};
use crate::bambu_mqtt::{
    build_connect_packet, build_subscribe_packet, parse_publish_payload, read_mqtt_packet,
};
use crate::bambu_thermal::{
    is_below_extrusion_temp, is_print_capable_temp, nozzle_thermal_state_name,
};
use crate::state::AppState;
use native_tls::TlsConnector;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::Write;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;

const BAMBU_MQTT_PORT: u16 = 8883;
const OBSERVER_INTERVAL_SECS: u64 = 20;
const MQTT_TIMEOUT_SECS: u64 = 8;
const MQTT_BURST_SETTLE_MS: u64 = 1_200;

pub async fn run_live_observer(state: AppState) {
    loop {
        let db_path = state.db_path.clone();
        if let Err(error) =
            tauri::async_runtime::spawn_blocking(move || poll_enabled_integrations(&db_path))
                .await
                .unwrap_or_else(|join_error| {
                    Err(format!("live observer join failed: {join_error}"))
                })
        {
            eprintln!("Bambu live observer error: {error}");
        }
        tokio::time::sleep(Duration::from_secs(OBSERVER_INTERVAL_SECS)).await;
    }
}

fn poll_enabled_integrations(db_path: &str) -> Result<(), String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let integrations = db
        .list_bambu_live_integrations()
        .map_err(|error| error.to_string())?;
    for entry in integrations {
        if !entry.config.enabled {
            continue;
        }
        if let Err(error) = poll_single_integration(db_path, entry) {
            eprintln!("Bambu live integration poll failed: {error}");
        }
    }
    Ok(())
}

fn poll_single_integration(
    db_path: &str,
    entry: BambuLiveIntegrationEntryRow,
) -> Result<(), String> {
    let host = entry
        .config
        .host
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing host".to_string())?;
    let access_code = entry
        .config
        .access_code
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing access code".to_string())?;
    let printer_serial = entry
        .config
        .printer_serial
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "missing printer serial".to_string())?;

    let previous_state = entry.config.observed_state.clone();
    let observed = match observe_printer_state(host, access_code, printer_serial) {
        Ok(raw) => {
            let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
            let merged = merge_idle_observation(previous_state.as_ref(), raw);
            enrich_with_match_status(&db, &entry.printer_id, merged)
                .map_err(|error| error.to_string())?
        }
        Err(error) => {
            let mut next = previous_state.unwrap_or_else(default_offline_state);
            next.online = false;
            next.mqtt_connected = false;
            next.raw_status_note = Some(error.clone());
            persist_observation(
                db_path,
                &entry,
                Some(next.clone()),
                Some(error),
                Some(&next),
                None,
            )?;
            return Ok(());
        }
    };

    persist_observation(
        db_path,
        &entry,
        Some(observed.clone()),
        None,
        previous_state.as_ref(),
        Some(&observed),
    )?;
    Ok(())
}

fn persist_observation(
    db_path: &str,
    entry: &BambuLiveIntegrationEntryRow,
    observed_state: Option<BambuLiveObservedStateRow>,
    last_error: Option<String>,
    previous: Option<&BambuLiveObservedStateRow>,
    next: Option<&BambuLiveObservedStateRow>,
) -> Result<(), String> {
    let db = FilamentDatabase::open(db_path).map_err(|error| error.to_string())?;
    let mut next_config: BambuLiveIntegrationRow = entry.config.clone();
    next_config.last_error = last_error;
    next_config.observed_state = observed_state;
    db.save_bambu_live_integration(&entry.printer_id, &next_config)
        .map_err(|error| error.to_string())?;
    if let Some(next_state) = next {
        log_state_changes(&db, &entry.printer_id, previous, next_state)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn default_offline_state() -> BambuLiveObservedStateRow {
    BambuLiveObservedStateRow {
        online: false,
        last_seen_at: None,
        mqtt_connected: false,
        progress_percent: None,
        remaining_minutes: None,
        prepare_percent: None,
        print_stage: None,
        print_error_code: None,
        job_state_code: None,
        gcode_state: None,
        print_type: None,
        subtask_id: None,
        subtask_name: None,
        active_ams_index: None,
        active_tray_index: None,
        nozzle_temp_c: None,
        bed_temp_c: None,
        ams_humidity_index: None,
        ams_temperature_c: None,
        ams_reading_bits: None,
        ams_exist_bits: None,
        ams_read_done_bits: None,
        ams_bambu_bits: None,
        ams_status_code: None,
        ams_status_main: None,
        ams_status_sub: None,
        raw_status_note: None,
        raw_payload_json: None,
        trays: Vec::new(),
    }
}

fn merge_idle_observation(
    previous: Option<&BambuLiveObservedStateRow>,
    mut next: BambuLiveObservedStateRow,
) -> BambuLiveObservedStateRow {
    let Some(previous) = previous else {
        return next;
    };

    let drop_carried_job_identity = should_drop_carried_job_identity(previous, &next);
    let drop_carried_job_progress = should_drop_carried_job_progress(previous, &next);

    next.last_seen_at = next.last_seen_at.or_else(|| previous.last_seen_at.clone());
    if !drop_carried_job_progress {
        next.progress_percent = next.progress_percent.or(previous.progress_percent);
        next.remaining_minutes = next.remaining_minutes.or(previous.remaining_minutes);
        next.prepare_percent = next.prepare_percent.or(previous.prepare_percent);
        next.print_stage = next.print_stage.or(previous.print_stage);
        next.print_error_code = next.print_error_code.or(previous.print_error_code);
        next.job_state_code = next.job_state_code.or(previous.job_state_code);
        next.gcode_state = next.gcode_state.or_else(|| previous.gcode_state.clone());
        next.print_type = next.print_type.or_else(|| previous.print_type.clone());
    }
    if !drop_carried_job_identity {
        next.subtask_id = next.subtask_id.or_else(|| previous.subtask_id.clone());
        next.subtask_name = next.subtask_name.or_else(|| previous.subtask_name.clone());
        if next.active_tray_index.is_none() {
            next.active_ams_index = previous.active_ams_index;
            next.active_tray_index = previous.active_tray_index;
        }
    }
    next.nozzle_temp_c = next.nozzle_temp_c.or(previous.nozzle_temp_c);
    next.bed_temp_c = next.bed_temp_c.or(previous.bed_temp_c);
    next.ams_humidity_index = next.ams_humidity_index.or(previous.ams_humidity_index);
    next.ams_temperature_c = sanitize_ams_temperature_c(next.ams_temperature_c)
        .or_else(|| sanitize_ams_temperature_c(previous.ams_temperature_c));
    next.ams_reading_bits = next
        .ams_reading_bits
        .or_else(|| previous.ams_reading_bits.clone());
    next.ams_exist_bits = next
        .ams_exist_bits
        .or_else(|| previous.ams_exist_bits.clone());
    next.ams_read_done_bits = next
        .ams_read_done_bits
        .or_else(|| previous.ams_read_done_bits.clone());
    next.ams_bambu_bits = next
        .ams_bambu_bits
        .or_else(|| previous.ams_bambu_bits.clone());
    next.ams_status_code = next.ams_status_code.or(previous.ams_status_code);
    next.ams_status_main = next.ams_status_main.or(previous.ams_status_main);
    next.ams_status_sub = next.ams_status_sub.or(previous.ams_status_sub);
    if next.raw_payload_json.is_none() {
        next.raw_payload_json = previous.raw_payload_json.clone();
    }
    next.trays = merge_tray_snapshots(&previous.trays, &next.trays);
    next
}

fn should_drop_carried_job_identity(
    previous: &BambuLiveObservedStateRow,
    next: &BambuLiveObservedStateRow,
) -> bool {
    previous.subtask_id.is_some()
        && previous_looks_near_complete(previous)
        && next_looks_like_new_print_without_identity(next)
}

fn should_drop_carried_job_progress(
    previous: &BambuLiveObservedStateRow,
    next: &BambuLiveObservedStateRow,
) -> bool {
    has_terminal_or_idle_print_state(next)
        || (has_terminal_or_idle_print_state(previous)
            && raw_payload_has_no_current_job_fields(next))
        || next_looks_like_cold_jobless_stop(previous, next)
}

fn next_looks_like_cold_jobless_stop(
    previous: &BambuLiveObservedStateRow,
    next: &BambuLiveObservedStateRow,
) -> bool {
    is_live_print_running(previous)
        && next.nozzle_temp_c.is_some_and(is_below_extrusion_temp)
        && raw_payload_has_no_current_job_fields(next)
}

fn has_terminal_or_idle_print_state(state: &BambuLiveObservedStateRow) -> bool {
    let gcode_state = normalized_carried_print_state(state.gcode_state.as_deref());
    matches!(
        gcode_state.as_deref(),
        Some("IDLE" | "FAILED" | "STOP" | "STOPPED" | "CANCELLED")
    ) || (matches!(gcode_state.as_deref(), Some("FINISH" | "FINISHED"))
        && is_credible_finished_print_state(state))
        || (state
            .print_type
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| value.eq_ignore_ascii_case("idle"))
            && !is_live_print_running(state))
}

fn previous_looks_near_complete(previous: &BambuLiveObservedStateRow) -> bool {
    matches!(
        normalized_carried_print_state(previous.gcode_state.as_deref()).as_deref(),
        Some("FINISH" | "FINISHED")
    ) || previous
        .progress_percent
        .is_some_and(|progress| progress >= 95)
        || previous
            .remaining_minutes
            .is_some_and(|minutes| (0..=2).contains(&minutes))
}

fn next_looks_like_new_print_without_identity(next: &BambuLiveObservedStateRow) -> bool {
    !raw_payload_has_explicit_job_identity(next)
        && (next.prepare_percent.is_some()
            || next.progress_percent.is_some_and(|progress| progress <= 10)
            || next.nozzle_temp_c.is_some_and(is_print_capable_temp)
            || matches!(
                normalized_carried_print_state(next.gcode_state.as_deref()).as_deref(),
                Some("PREPARE" | "PREPARING" | "RUNNING" | "SLICING")
            ))
}

fn normalized_carried_print_state(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
}

fn raw_payload_has_explicit_job_identity(state: &BambuLiveObservedStateRow) -> bool {
    if state
        .subtask_id
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return true;
    }
    state
        .raw_payload_json
        .as_ref()
        .and_then(|payload| payload.pointer("/_bfm_last_message/has_job_identity"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

fn raw_payload_has_no_current_job_fields(state: &BambuLiveObservedStateRow) -> bool {
    let Some(job) = state
        .raw_payload_json
        .as_ref()
        .and_then(|payload| payload.get("_bfm_job"))
        .and_then(Value::as_object)
    else {
        return false;
    };

    [
        "active_tray_index",
        "gcode_state",
        "job_state_code",
        "print_type",
        "progress_percent",
        "prepare_percent",
        "print_stage",
        "print_error_code",
        "remaining_minutes",
        "session_key",
        "subtask_id",
        "subtask_name",
    ]
    .into_iter()
    .all(|key| job.get(key).is_none_or(Value::is_null))
}

fn merge_tray_snapshots(
    previous_trays: &[BambuLiveObservedTrayRow],
    next_trays: &[BambuLiveObservedTrayRow],
) -> Vec<BambuLiveObservedTrayRow> {
    if next_trays.is_empty() {
        return previous_trays.to_vec();
    }

    let previous_by_position: HashMap<(Option<i64>, i64), &BambuLiveObservedTrayRow> =
        previous_trays
            .iter()
            .map(|tray| ((tray.ams_index, tray.tray_index), tray))
            .collect();
    let previous_legacy_by_index: HashMap<i64, &BambuLiveObservedTrayRow> = previous_trays
        .iter()
        .map(|tray| (tray.tray_index, tray))
        .collect();

    next_trays
        .iter()
        .map(|next| {
            let previous = previous_by_position
                .get(&(next.ams_index, next.tray_index))
                .or_else(|| {
                    (next.ams_index == Some(0))
                        .then(|| previous_legacy_by_index.get(&next.tray_index))
                        .flatten()
                });
            let Some(previous) = previous else {
                return next.clone();
            };
            let carry_forward_observed_identity =
                !next.loaded && next.empty_observation_count == previous.empty_observation_count;
            let same_loaded_metadata = next.loaded
                && !substantive_tray_metadata_changed(
                    Some(previous),
                    next.filament_type.as_deref(),
                    next.filament_name.as_deref(),
                    next.color_hex.as_deref(),
                );
            let should_carry_previous_identity =
                same_loaded_metadata || carry_forward_observed_identity;
            BambuLiveObservedTrayRow {
                ams_index: next.ams_index,
                tray_index: next.tray_index,
                loaded: next.loaded,
                filament_type: next
                    .filament_type
                    .clone()
                    .or_else(|| previous.filament_type.clone()),
                filament_name: next
                    .filament_name
                    .clone()
                    .or_else(|| previous.filament_name.clone()),
                color_hex: next
                    .color_hex
                    .clone()
                    .or_else(|| previous.color_hex.clone()),
                tray_weight_g: next.tray_weight_g.or(previous.tray_weight_g),
                remaining_percent: next.remaining_percent.or(previous.remaining_percent),
                remaining_grams: next.remaining_grams.or(previous.remaining_grams),
                observed_rfid_tag: next.observed_rfid_tag.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.observed_rfid_tag.clone())
                        .flatten()
                }),
                tray_uuid: next.tray_uuid.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.tray_uuid.clone())
                        .flatten()
                }),
                chip_id: next.chip_id.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.chip_id.clone())
                        .flatten()
                }),
                tray_info_idx: next.tray_info_idx.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.tray_info_idx.clone())
                        .flatten()
                }),
                tray_id_name: next.tray_id_name.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.tray_id_name.clone())
                        .flatten()
                }),
                nozzle_temp_min_c: next.nozzle_temp_min_c.or(previous.nozzle_temp_min_c),
                nozzle_temp_max_c: next.nozzle_temp_max_c.or(previous.nozzle_temp_max_c),
                last_identity_seen_at: next.last_identity_seen_at.clone().or_else(|| {
                    should_carry_previous_identity
                        .then(|| previous.last_identity_seen_at.clone())
                        .flatten()
                }),
                last_empty_seen_at: next
                    .last_empty_seen_at
                    .clone()
                    .or_else(|| previous.last_empty_seen_at.clone()),
                empty_observation_count: next
                    .empty_observation_count
                    .or(previous.empty_observation_count),
                matched_inventory_spool_id: next.matched_inventory_spool_id.clone(),
                matched_inventory_mode: next.matched_inventory_mode.clone(),
                match_status: next.match_status.clone(),
                match_note: next.match_note.clone(),
            }
        })
        .collect()
}

fn log_state_changes(
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
    if previous_tray != Some(next_tray) {
        if let Some(active_tray_index) = next.active_tray_index {
            db.insert_printer_live_event(
                printer_id,
                "LIVE_ACTIVE_TRAY_CHANGED",
                &json!({
                    "active_ams_index": next.active_ams_index,
                    "active_tray_index": active_tray_index,
                }),
            )?;
        }
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
    if include_last_seen_at {
        if let Value::Object(fields) = &mut payload {
            fields.insert("last_seen_at".to_string(), json!(state.last_seen_at));
        }
    }
    payload
}

pub(crate) fn is_live_print_running(state: &BambuLiveObservedStateRow) -> bool {
    if is_probable_completed_carried_print_state(state) {
        return false;
    }

    match normalized_gcode_state(state.gcode_state.as_deref()).as_deref() {
        Some("RUNNING" | "PAUSE" | "PAUSED" | "PREPARE" | "PREPARING" | "SLICING") => true,
        Some("FINISH" | "FINISHED") => {
            !is_credible_finished_print_state(state)
                && (state.progress_percent.is_some() || state.remaining_minutes.is_some())
        }
        Some("IDLE" | "FAILED" | "STOP" | "STOPPED" | "CANCELLED") => false,
        _ if state
            .print_type
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| value.eq_ignore_ascii_case("idle")) =>
        {
            false
        }
        _ => state.progress_percent.is_some() || state.remaining_minutes.is_some(),
    }
}

fn normalized_gcode_state(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
}

fn observe_printer_state(
    host: &str,
    access_code: &str,
    printer_serial: &str,
) -> Result<BambuLiveObservedStateRow, String> {
    let tcp_stream = connect_printer_mqtt_tcp(host)?;
    tcp_stream
        .set_read_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set MQTT read timeout: {error}"))?;
    tcp_stream
        .set_write_timeout(Some(Duration::from_secs(MQTT_TIMEOUT_SECS)))
        .map_err(|error| format!("failed to set MQTT write timeout: {error}"))?;

    let connector = TlsConnector::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .map_err(|error| format!("failed to prepare TLS connector: {error}"))?;
    let mut stream = connector
        .connect(host, tcp_stream)
        .map_err(|error| format!("failed to establish TLS session: {error}"))?;

    let client_id = format!("bfm-{}", std::process::id());
    let connect_packet = build_connect_packet(&client_id, "bblp", access_code);
    stream
        .write_all(&connect_packet)
        .map_err(|error| format!("failed to send MQTT connect packet: {error}"))?;
    let (packet_type, packet_payload) = read_mqtt_packet(&mut stream)?;
    if packet_type != 0x20 || packet_payload.len() < 2 || packet_payload[1] != 0x00 {
        return Err("printer rejected MQTT connection".to_string());
    }

    let topic = format!("device/{printer_serial}/report");
    let subscribe_packet = build_subscribe_packet(&topic);
    stream
        .write_all(&subscribe_packet)
        .map_err(|error| format!("failed to send MQTT subscribe packet: {error}"))?;
    let (packet_type, _) = read_mqtt_packet(&mut stream)?;
    if packet_type != 0x90 {
        return Err("printer rejected MQTT subscription".to_string());
    }

    let started = std::time::Instant::now();
    let mut merged = default_offline_state();
    merged.online = true;
    merged.mqtt_connected = true;
    let mut received_live_payload = false;
    let mut supported_message_count = 0_i64;
    let mut first_payload_at: Option<String> = None;
    let mut last_payload_at: Option<String> = None;

    while started.elapsed() < Duration::from_secs(MQTT_TIMEOUT_SECS) {
        let (packet_type, payload) = match read_mqtt_packet(&mut stream) {
            Ok(packet) => packet,
            Err(error) if is_mqtt_read_timeout(&error) => {
                if !received_live_payload {
                    merged.raw_status_note =
                        Some("Connected, waiting for the next MQTT status burst.".to_string());
                }
                break;
            }
            Err(error) => return Err(error),
        };
        if packet_type >> 4 != 3 {
            continue;
        }
        if let Some(message) = parse_publish_payload(&payload)? {
            let received_at = now_iso_string();
            let previous_last_seen_at = merged.last_seen_at.clone();
            merged.last_seen_at = Some(received_at.clone());
            if merge_print_payload(&mut merged, &message) {
                supported_message_count += 1;
                if first_payload_at.is_none() {
                    first_payload_at = Some(received_at.clone());
                }
                last_payload_at = Some(received_at);
                if has_live_observation(&merged) && !received_live_payload {
                    received_live_payload = true;
                    stream
                        .get_ref()
                        .set_read_timeout(Some(Duration::from_millis(MQTT_BURST_SETTLE_MS)))
                        .map_err(|error| {
                            format!("failed to set MQTT burst settle timeout: {error}")
                        })?;
                }
            } else {
                merged.last_seen_at = previous_last_seen_at;
            }
        }
    }

    if merged.last_seen_at.is_none() {
        merged.raw_status_note =
            Some("Connected, but no live MQTT status arrived during this poll.".to_string());
    }
    annotate_capture_poll_metadata(
        &mut merged,
        supported_message_count,
        first_payload_at.as_deref(),
        last_payload_at.as_deref(),
        started.elapsed().as_millis().min(i64::MAX as u128) as i64,
    );
    Ok(merged)
}

fn connect_printer_mqtt_tcp(host: &str) -> Result<TcpStream, String> {
    let addresses = resolve_printer_mqtt_addresses(host)?;
    let mut attempts = Vec::new();

    for address in addresses {
        match TcpStream::connect_timeout(&address, Duration::from_secs(5)) {
            Ok(stream) => return Ok(stream),
            Err(error) => attempts.push((address, error)),
        }
    }

    Err(format_mqtt_connect_errors(&attempts))
}

fn resolve_printer_mqtt_addresses(host: &str) -> Result<Vec<SocketAddr>, String> {
    let addresses = (host, BAMBU_MQTT_PORT)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve printer host: {error}"))?
        .collect::<Vec<_>>();

    if addresses.is_empty() {
        return Err("no printer address resolved".to_string());
    }

    Ok(addresses)
}

fn format_mqtt_connect_errors(attempts: &[(SocketAddr, std::io::Error)]) -> String {
    format_mqtt_connect_errors_for_platform(attempts, cfg!(target_os = "macos"))
}

fn format_mqtt_connect_errors_for_platform(
    attempts: &[(SocketAddr, std::io::Error)],
    is_macos: bool,
) -> String {
    let base = match attempts {
        [] => "failed to connect to printer MQTT: no printer address resolved".to_string(),
        [(address, error)] => format!("failed to connect to printer MQTT at {address}: {error}"),
        _ => {
            let details = attempts
                .iter()
                .map(|(address, error)| format!("{address}: {error}"))
                .collect::<Vec<_>>()
                .join("; ");
            format!(
                "failed to connect to printer MQTT on all {} resolved addresses: {details}",
                attempts.len()
            )
        }
    };

    if is_macos
        && !attempts.is_empty()
        && attempts
            .iter()
            .all(|(_, error)| looks_like_macos_local_network_block(error))
    {
        return format!(
            "{base}. macOS may be blocking Filament Manager's Local Network access. Allow Filament Manager in System Settings > Privacy & Security > Local Network, then restart the app. If it is not listed, launch the app from Applications and retry the printer connection."
        );
    }
    base
}

fn looks_like_macos_local_network_block(error: &std::io::Error) -> bool {
    matches!(error.raw_os_error(), Some(51 | 65))
        || error
            .to_string()
            .to_lowercase()
            .contains("no route to host")
}

fn has_live_observation(state: &BambuLiveObservedStateRow) -> bool {
    !state.trays.is_empty()
        || state.gcode_state.is_some()
        || state.print_type.is_some()
        || state.subtask_id.is_some()
        || state.subtask_name.is_some()
        || state.progress_percent.is_some()
        || state.remaining_minutes.is_some()
        || state.prepare_percent.is_some()
        || state.print_stage.is_some()
        || state.print_error_code.is_some()
        || state.job_state_code.is_some()
        || state.nozzle_temp_c.is_some()
        || state.bed_temp_c.is_some()
        || state.active_ams_index.is_some()
        || state.active_tray_index.is_some()
        || state.ams_reading_bits.is_some()
        || state.ams_exist_bits.is_some()
        || state.ams_read_done_bits.is_some()
        || state.ams_bambu_bits.is_some()
        || state.ams_status_code.is_some()
}

fn is_mqtt_read_timeout(error: &str) -> bool {
    error.contains("os error 35")
        || error.contains("timed out")
        || error.contains("Resource temporarily unavailable")
}

fn merge_print_payload(state: &mut BambuLiveObservedStateRow, message: &Value) -> bool {
    let print = message.get("print").unwrap_or(message);
    let job_state_signal = first_value_ref([
        print.pointer("/job/job_state"),
        message.pointer("/job/job_state"),
        print.get("job_state"),
        message.get("job_state"),
    ]);
    let ams_status_signal = first_value_ref([
        print.pointer("/ams/ams_status"),
        message.pointer("/ams/ams_status"),
        print.get("ams_status"),
        message.get("ams_status"),
    ]);
    let has_supported_live_fields = print.get("ams").is_some()
        || print.get("mc_percent").is_some()
        || print.get("mc_remaining_time").is_some()
        || print.get("gcode_file_prepare_percent").is_some()
        || print.get("mc_print_stage").is_some()
        || print.get("print_error").is_some()
        || print.get("gcode_state").is_some()
        || print.get("print_type").is_some()
        || print.get("subtask_id").is_some()
        || print.get("subtask_name").is_some()
        || message.get("subtask_id").is_some()
        || message.get("subtask_name").is_some()
        || print.get("nozzle_temper").is_some()
        || print.get("bed_temper").is_some()
        || job_state_signal.is_some()
        || ams_status_signal.is_some()
        || print.pointer("/ams/tray_exist_bits").is_some();
    if !has_supported_live_fields {
        return false;
    }

    state.progress_percent = as_i64(print.get("mc_percent")).or(state.progress_percent);
    state.remaining_minutes = as_i64(print.get("mc_remaining_time")).or(state.remaining_minutes);
    state.prepare_percent =
        as_i64(print.get("gcode_file_prepare_percent")).or(state.prepare_percent);
    state.print_stage = as_i64(print.get("mc_print_stage")).or(state.print_stage);
    state.print_error_code = as_i64(print.get("print_error")).or(state.print_error_code);
    state.job_state_code = as_i64(job_state_signal).or(state.job_state_code);
    state.gcode_state =
        as_value_string(print.get("gcode_state")).or_else(|| state.gcode_state.clone());
    state.print_type = first_value_string([
        print.get("print_type"),
        message.get("print_type"),
        message.get("job_type"),
    ])
    .or_else(|| state.print_type.clone());
    state.subtask_id = first_value_string([
        print.get("subtask_id"),
        message.get("subtask_id"),
        message.get("project_id"),
        message.get("task_id"),
        message.get("job_id"),
    ])
    .or_else(|| state.subtask_id.clone());
    state.subtask_name =
        first_value_string([print.get("subtask_name"), message.get("subtask_name")])
            .or_else(|| state.subtask_name.clone());
    if let Some(raw_tray_now) = as_i64(print.pointer("/ams/tray_now")) {
        let (active_ams_index, active_tray_index) = decode_bambu_tray_coordinate(raw_tray_now);
        state.active_ams_index = active_ams_index;
        state.active_tray_index = active_tray_index;
    }
    state.nozzle_temp_c = as_f64(print.get("nozzle_temper")).or(state.nozzle_temp_c);
    state.bed_temp_c = as_f64(print.get("bed_temper")).or(state.bed_temp_c);
    state.ams_humidity_index =
        as_i64(print.pointer("/ams/ams/0/humidity")).or(state.ams_humidity_index);
    if let Some(ams_temperature_c) = as_f64(print.pointer("/ams/ams/0/temp")) {
        state.ams_temperature_c = sanitize_ams_temperature_c(Some(ams_temperature_c));
    }
    state.ams_reading_bits = as_string(print.pointer("/ams/tray_reading_bits"))
        .or_else(|| state.ams_reading_bits.clone());
    state.ams_exist_bits =
        as_string(print.pointer("/ams/tray_exist_bits")).or_else(|| state.ams_exist_bits.clone());
    state.ams_read_done_bits = as_string(print.pointer("/ams/tray_read_done_bits"))
        .or_else(|| state.ams_read_done_bits.clone());
    state.ams_bambu_bits =
        as_string(print.pointer("/ams/tray_is_bbl_bits")).or_else(|| state.ams_bambu_bits.clone());
    if let Some(status_code) = as_i64(ams_status_signal) {
        state.ams_status_code = Some(status_code);
        if let Some((status_main, status_sub)) = split_ams_status_code(status_code) {
            state.ams_status_main = Some(status_main);
            state.ams_status_sub = Some(status_sub);
        }
    }

    if let Some(ams_units) = print.pointer("/ams/ams").and_then(Value::as_array) {
        let observed_at = state.last_seen_at.clone().unwrap_or_else(now_iso_string);
        let previous_by_position: HashMap<(Option<i64>, i64), BambuLiveObservedTrayRow> = state
            .trays
            .iter()
            .cloned()
            .map(|tray| ((tray.ams_index, tray.tray_index), tray))
            .collect();
        let previous_legacy_by_index: HashMap<i64, BambuLiveObservedTrayRow> = state
            .trays
            .iter()
            .filter(|tray| tray.ams_index.is_none())
            .cloned()
            .map(|tray| (tray.tray_index, tray))
            .collect();
        let mut merged_trays = Vec::new();
        for (ams_position, ams) in ams_units.iter().enumerate() {
            let ams_index = as_i64(ams.get("id")).or_else(|| i64::try_from(ams_position).ok());
            let slot_presence_bits =
                as_string(ams.get("tray_exist_bits")).or_else(|| state.ams_exist_bits.clone());
            let Some(ams_trays) = ams.get("tray").and_then(Value::as_array) else {
                continue;
            };
            for tray in ams_trays {
                let tray_index = as_i64(tray.get("id")).unwrap_or_default();
                let previous = previous_by_position
                    .get(&(ams_index, tray_index))
                    .or_else(|| {
                        (ams_index == Some(0))
                            .then(|| previous_legacy_by_index.get(&tray_index))
                            .flatten()
                    });
                let slot_present_from_exist_bits =
                    tray_exist_bits_slot_present(slot_presence_bits.as_deref(), tray_index);
                merged_trays.push(merge_tray_payload(
                    previous,
                    ams_index,
                    tray_index,
                    tray,
                    &observed_at,
                    slot_present_from_exist_bits,
                ));
            }
        }
        state.trays = merged_trays;
    }
    merge_raw_payload_snapshot(state, print, message);
    true
}

fn merge_raw_payload_snapshot(
    state: &mut BambuLiveObservedStateRow,
    print: &Value,
    message: &Value,
) {
    let job_state_signal = first_value_ref([
        print.pointer("/job/job_state"),
        message.pointer("/job/job_state"),
        print.get("job_state"),
        message.get("job_state"),
    ]);
    let ams_status_signal = first_value_ref([
        print.pointer("/ams/ams_status"),
        message.pointer("/ams/ams_status"),
        print.get("ams_status"),
        message.get("ams_status"),
    ]);
    let mut merged = state
        .raw_payload_json
        .take()
        .unwrap_or_else(|| Value::Object(Map::new()));
    merge_json_object(&mut merged, print);

    if let Some(object) = merged.as_object_mut() {
        object.insert(
            "_bfm_job".to_string(),
            json!({
                "gcode_state": state.gcode_state.as_deref(),
                "print_type": state.print_type.as_deref(),
                "subtask_id": state.subtask_id.as_deref(),
                "subtask_name": state.subtask_name.as_deref(),
                "session_key": state.subtask_id.as_ref().map(|subtask_id| format!("subtask:{subtask_id}")),
                "progress_percent": state.progress_percent,
                "remaining_minutes": state.remaining_minutes,
                "prepare_percent": state.prepare_percent,
                "print_stage": state.print_stage,
                "print_error_code": state.print_error_code,
                "job_state_code": state.job_state_code,
                "active_ams_index": state.active_ams_index,
                "active_tray_index": state.active_tray_index,
            }),
        );
        object.insert(
            "_bfm_ams_status".to_string(),
            json!({
                "ams_status_code": state.ams_status_code,
                "ams_status_main": state.ams_status_main,
                "ams_status_sub": state.ams_status_sub,
            }),
        );
        let mut observed_fields = object
            .get("_bfm_observed_fields")
            .cloned()
            .unwrap_or_else(|| Value::Object(Map::new()));
        if let Some(fields) = observed_fields.as_object_mut() {
            record_observed_field_time(
                fields,
                "gcode_state_at",
                print.get("gcode_state"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "progress_percent_at",
                print.get("mc_percent"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "prepare_percent_at",
                print.get("gcode_file_prepare_percent"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "print_stage_at",
                print.get("mc_print_stage"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "job_state_at",
                job_state_signal,
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "remaining_minutes_at",
                print.get("mc_remaining_time"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "nozzle_temper_at",
                print.get("nozzle_temper"),
                state.last_seen_at.as_deref(),
            );
            if as_f64(print.get("nozzle_temper")).is_some_and(is_print_capable_temp) {
                fields.insert(
                    "nozzle_print_capable_at".to_string(),
                    state
                        .last_seen_at
                        .as_deref()
                        .map(|value| Value::String(value.to_string()))
                        .unwrap_or(Value::Null),
                );
            }
            record_observed_field_time(
                fields,
                "active_tray_index_at",
                print.pointer("/ams/tray_now"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "ams_exist_bits_at",
                print.pointer("/ams/tray_exist_bits"),
                state.last_seen_at.as_deref(),
            );
            record_observed_field_time(
                fields,
                "ams_status_at",
                ams_status_signal,
                state.last_seen_at.as_deref(),
            );
            if print.get("subtask_id").is_some()
                || message.get("subtask_id").is_some()
                || message.get("project_id").is_some()
                || message.get("task_id").is_some()
                || message.get("job_id").is_some()
                || print.get("subtask_name").is_some()
                || message.get("subtask_name").is_some()
            {
                fields.insert(
                    "job_identity_at".to_string(),
                    state
                        .last_seen_at
                        .as_deref()
                        .map(|value| Value::String(value.to_string()))
                        .unwrap_or(Value::Null),
                );
            }
        }
        object.insert("_bfm_observed_fields".to_string(), observed_fields);
        object.insert(
            "_bfm_last_message".to_string(),
            json!({
                "sequence_id": first_value_string([print.get("sequence_id"), message.get("sequence_id")]),
                "command": first_value_string([print.get("command"), message.get("command")]),
                "msg": first_value_string([print.get("msg"), message.get("msg")]),
                "has_ams": print.get("ams").is_some(),
                "has_trays": print.pointer("/ams/ams/0/tray").is_some(),
                "has_job_identity": state.subtask_id.is_some(),
                "has_job_state": job_state_signal.is_some(),
                "has_ams_status": ams_status_signal.is_some(),
                "has_ams_exist_bits": print.pointer("/ams/tray_exist_bits").is_some(),
                "has_nozzle_temp": print.get("nozzle_temper").is_some(),
                "has_progress": print.get("mc_percent").is_some(),
                "has_remaining_time": print.get("mc_remaining_time").is_some(),
            }),
        );
    }
    state.raw_payload_json = Some(merged);
}

fn record_observed_field_time(
    fields: &mut Map<String, Value>,
    key: &str,
    signal: Option<&Value>,
    observed_at: Option<&str>,
) {
    if signal.is_some() {
        fields.insert(
            key.to_string(),
            observed_at
                .map(|value| Value::String(value.to_string()))
                .unwrap_or(Value::Null),
        );
    }
}

fn merge_json_object(target: &mut Value, source: &Value) {
    match (target, source) {
        (Value::Object(target), Value::Object(source)) => {
            for (key, source_value) in source {
                if key.starts_with("_bfm_") {
                    continue;
                }
                match target.get_mut(key) {
                    Some(target_value) => merge_json_object(target_value, source_value),
                    None => {
                        target.insert(key.clone(), source_value.clone());
                    }
                }
            }
        }
        (target, source) => {
            *target = source.clone();
        }
    }
}

fn annotate_capture_poll_metadata(
    state: &mut BambuLiveObservedStateRow,
    supported_message_count: i64,
    first_payload_at: Option<&str>,
    last_payload_at: Option<&str>,
    elapsed_ms: i64,
) {
    let Some(object) = state
        .raw_payload_json
        .as_mut()
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    let tray_count = state.trays.len();
    let loaded_tray_count = state.trays.iter().filter(|tray| tray.loaded).count();
    let tracked_weight_tray_count = state
        .trays
        .iter()
        .filter(|tray| tray.remaining_grams.is_some())
        .count();
    object.insert(
        "_bfm_capture".to_string(),
        json!({
            "schema": "bambu-live-capture-v2",
            "snapshot_kind": "merged_mqtt_poll",
            "poll_timeout_secs": MQTT_TIMEOUT_SECS,
            "burst_settle_ms": MQTT_BURST_SETTLE_MS,
            "poll_elapsed_ms": elapsed_ms,
            "supported_message_count": supported_message_count,
            "first_payload_at": first_payload_at,
            "last_payload_at": last_payload_at,
            "last_seen_at": state.last_seen_at.as_deref(),
            "merged_tray_count": tray_count,
            "loaded_tray_count": loaded_tray_count,
            "tracked_weight_tray_count": tracked_weight_tray_count,
            "note": "Supported MQTT publish payloads are merged into this diagnostic snapshot for capture/export.",
        }),
    );
}

fn merge_tray_payload(
    previous: Option<&BambuLiveObservedTrayRow>,
    ams_index: Option<i64>,
    tray_index: i64,
    tray: &Value,
    observed_at: &str,
    slot_present_from_exist_bits: Option<bool>,
) -> BambuLiveObservedTrayRow {
    let substantive_fields = tray
        .as_object()
        .map(has_substantive_tray_fields)
        .unwrap_or(false);
    let observed_rfid_tag = normalize_identity_text(as_string(tray.get("tag_uid")));
    let tray_uuid = normalize_identity_text(as_string(tray.get("tray_uuid")));
    let chip_id = normalize_identity_text(as_string(tray.pointer("/chip_id")));
    let tray_info_idx = normalize_identity_text(as_string(tray.get("tray_info_idx")));
    let tray_id_name = normalize_identity_text(as_string(tray.get("tray_id_name")));
    let nozzle_temp_min_c = normalize_nozzle_setting_temp(as_f64(tray.get("nozzle_temp_min")));
    let nozzle_temp_max_c = normalize_nozzle_setting_temp(as_f64(tray.get("nozzle_temp_max")));
    let filament_type = as_string(tray.get("tray_type"));
    let filament_name = as_string(tray.get("tray_sub_brands"));
    let color_hex = normalize_color(as_string(tray.get("tray_color")));
    let tray_weight_g = normalize_tray_weight(as_i64(tray.get("tray_weight")));
    let remaining_percent = normalize_remaining_percent(as_i64(tray.get("remain")));
    let has_rfid_identity_signal = tray_uuid.is_some() || observed_rfid_tag.is_some();
    let has_live_observation_signal = observed_rfid_tag.is_some()
        || tray_uuid.is_some()
        || chip_id.is_some()
        || tray_info_idx.is_some()
        || tray_id_name.is_some();
    let present_by_exist_bits = slot_present_from_exist_bits == Some(true);
    let empty_by_exist_bits = slot_present_from_exist_bits == Some(false);
    let empty_observation = empty_by_exist_bits
        || (!present_by_exist_bits && !substantive_fields && !has_live_observation_signal);
    let metadata_replacement_signal = previous.is_some()
        && substantive_tray_metadata_changed(
            previous,
            filament_type.as_deref(),
            filament_name.as_deref(),
            color_hex.as_deref(),
        );
    let should_reset_observed_identity = empty_observation || metadata_replacement_signal;

    let previous_loaded = previous.map(|value| value.loaded).unwrap_or(false);
    let loaded = if empty_observation {
        false
    } else if present_by_exist_bits || substantive_fields || has_live_observation_signal {
        true
    } else {
        previous_loaded
    };

    BambuLiveObservedTrayRow {
        ams_index,
        tray_index,
        loaded,
        filament_type: if empty_by_exist_bits {
            None
        } else if empty_observation {
            filament_type
        } else {
            filament_type.or_else(|| previous.and_then(|value| value.filament_type.clone()))
        },
        filament_name: if empty_by_exist_bits {
            None
        } else if empty_observation {
            filament_name
        } else {
            filament_name.or_else(|| previous.and_then(|value| value.filament_name.clone()))
        },
        color_hex: if empty_by_exist_bits {
            None
        } else if empty_observation {
            color_hex
        } else {
            color_hex.or_else(|| previous.and_then(|value| value.color_hex.clone()))
        },
        tray_weight_g: if empty_by_exist_bits {
            None
        } else if empty_observation {
            tray_weight_g
        } else {
            tray_weight_g.or_else(|| previous.and_then(|value| value.tray_weight_g))
        },
        remaining_percent: if empty_by_exist_bits {
            None
        } else {
            remaining_percent.or_else(|| previous.and_then(|value| value.remaining_percent))
        },
        remaining_grams: if empty_by_exist_bits {
            None
        } else {
            remaining_percent
                .zip(tray_weight_g.or_else(|| previous.and_then(|value| value.tray_weight_g)))
                .and_then(|(percent, tray_weight_g)| percent_to_grams(percent, tray_weight_g))
                .or_else(|| previous.and_then(|value| value.remaining_grams))
        },
        observed_rfid_tag: if empty_by_exist_bits {
            None
        } else if should_reset_observed_identity {
            observed_rfid_tag
        } else {
            observed_rfid_tag.or_else(|| previous.and_then(|value| value.observed_rfid_tag.clone()))
        },
        tray_uuid: if empty_by_exist_bits {
            None
        } else if should_reset_observed_identity {
            tray_uuid
        } else {
            tray_uuid.or_else(|| previous.and_then(|value| value.tray_uuid.clone()))
        },
        chip_id: if empty_by_exist_bits {
            None
        } else if should_reset_observed_identity {
            chip_id
        } else {
            chip_id.or_else(|| previous.and_then(|value| value.chip_id.clone()))
        },
        tray_info_idx: if empty_by_exist_bits {
            None
        } else if should_reset_observed_identity {
            tray_info_idx
        } else {
            tray_info_idx.or_else(|| previous.and_then(|value| value.tray_info_idx.clone()))
        },
        tray_id_name: if empty_by_exist_bits {
            None
        } else if should_reset_observed_identity {
            tray_id_name
        } else {
            tray_id_name.or_else(|| previous.and_then(|value| value.tray_id_name.clone()))
        },
        nozzle_temp_min_c: if empty_by_exist_bits {
            None
        } else {
            nozzle_temp_min_c.or_else(|| previous.and_then(|value| value.nozzle_temp_min_c))
        },
        nozzle_temp_max_c: if empty_by_exist_bits {
            None
        } else {
            nozzle_temp_max_c.or_else(|| previous.and_then(|value| value.nozzle_temp_max_c))
        },
        last_identity_seen_at: if empty_by_exist_bits {
            None
        } else if has_rfid_identity_signal {
            Some(observed_at.to_string())
        } else if should_reset_observed_identity {
            None
        } else {
            previous.and_then(|value| value.last_identity_seen_at.clone())
        },
        last_empty_seen_at: if empty_observation {
            Some(observed_at.to_string())
        } else {
            previous.and_then(|value| value.last_empty_seen_at.clone())
        },
        empty_observation_count: if empty_observation {
            Some(
                previous
                    .and_then(|value| value.empty_observation_count)
                    .unwrap_or(0)
                    + 1,
            )
        } else if loaded {
            Some(0)
        } else {
            previous.and_then(|value| value.empty_observation_count)
        },
        matched_inventory_spool_id: if should_reset_observed_identity {
            None
        } else {
            previous.and_then(|value| value.matched_inventory_spool_id.clone())
        },
        matched_inventory_mode: if should_reset_observed_identity {
            None
        } else {
            previous.and_then(|value| value.matched_inventory_mode.clone())
        },
        match_status: if should_reset_observed_identity {
            None
        } else {
            previous.and_then(|value| value.match_status.clone())
        },
        match_note: if should_reset_observed_identity {
            None
        } else {
            previous.and_then(|value| value.match_note.clone())
        },
    }
}

fn substantive_tray_metadata_changed(
    previous: Option<&BambuLiveObservedTrayRow>,
    filament_type: Option<&str>,
    filament_name: Option<&str>,
    color_hex: Option<&str>,
) -> bool {
    let Some(previous) = previous else {
        return false;
    };
    substantive_value_changed(filament_type, previous.filament_type.as_deref())
        || substantive_value_changed(filament_name, previous.filament_name.as_deref())
        || substantive_value_changed(color_hex, previous.color_hex.as_deref())
}

fn substantive_value_changed(next: Option<&str>, previous: Option<&str>) -> bool {
    let Some(next) = next.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(previous) = previous.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    !next.eq_ignore_ascii_case(previous)
}

fn has_substantive_tray_fields(object: &Map<String, Value>) -> bool {
    object.iter().any(|(key, value)| {
        key != "id"
            && !matches!(value, Value::Null)
            && !matches!(value, Value::String(text) if text.trim().is_empty())
    })
}

fn normalize_identity_text(value: Option<String>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.chars().all(|character| character == '0') {
        return None;
    }
    Some(trimmed.to_string())
}

fn normalize_remaining_percent(value: Option<i64>) -> Option<i64> {
    let value = value?;
    if !(0..=100).contains(&value) {
        return None;
    }
    Some(value)
}

fn normalize_tray_weight(value: Option<i64>) -> Option<i64> {
    let value = value?;
    if value <= 0 {
        return None;
    }
    Some(value)
}

fn normalize_nozzle_setting_temp(value: Option<f64>) -> Option<f64> {
    let value = value?;
    if value <= 0.0 || value > 400.0 {
        return None;
    }
    Some(value)
}

fn percent_to_grams(value: i64, tray_weight_g: i64) -> Option<i64> {
    if !(0..=100).contains(&value) || tray_weight_g <= 0 {
        return None;
    }
    Some(((tray_weight_g * value) + 50) / 100)
}

fn as_i64(value: Option<&Value>) -> Option<i64> {
    match value {
        Some(Value::Number(number)) => number.as_i64(),
        Some(Value::String(raw)) => raw.trim().parse::<i64>().ok(),
        _ => None,
    }
}

fn sanitize_ams_temperature_c(value: Option<f64>) -> Option<f64> {
    let value = value?;
    if !value.is_finite() {
        return None;
    }
    // Plain AMS units are not heated, while newer drying-capable AMS units still stay
    // far below nozzle/bed temperatures. Values above this are not trustworthy air temp.
    if (-20.0..=80.0).contains(&value) {
        Some(value)
    } else {
        None
    }
}

fn as_f64(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(number)) => number.as_f64(),
        Some(Value::String(raw)) => raw.trim().parse::<f64>().ok(),
        _ => None,
    }
}

fn as_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(raw)) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => None,
    }
}

fn as_value_string(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(raw)) => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        Some(Value::Number(number)) => Some(number.to_string()),
        _ => None,
    }
}

fn first_value_string<const N: usize>(values: [Option<&Value>; N]) -> Option<String> {
    values.into_iter().find_map(as_value_string)
}

fn first_value_ref<const N: usize>(values: [Option<&Value>; N]) -> Option<&Value> {
    values.into_iter().flatten().next()
}

fn split_ams_status_code(status_code: i64) -> Option<(i64, i64)> {
    if status_code < 0 {
        return None;
    }
    Some((status_code >> 8, status_code & 0xff))
}

fn normalize_color(value: Option<String>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim().trim_start_matches('#');
    if trimmed.len() == 8 {
        Some(format!("#{}", &trimmed[..6]).to_uppercase())
    } else if trimmed.len() == 6 {
        Some(format!("#{trimmed}").to_uppercase())
    } else {
        Some(value)
    }
}

fn now_iso_string() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    chrono_like_utc(timestamp)
}

fn chrono_like_utc(timestamp: u64) -> String {
    let seconds = timestamp as i64;
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;

    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

#[cfg(test)]
#[path = "bambu_live_tests.rs"]
mod tests;
