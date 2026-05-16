use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveObservedTrayRow, FilamentDatabase,
};
use crate::backend::database_result::InventoryError;
use crate::bambu_live_sync::{count_review_trays, enrich_with_match_status};
use crate::bambu_mqtt::{
    build_connect_packet, build_subscribe_packet, parse_publish_payload, read_mqtt_packet,
};
use crate::state::AppState;
use native_tls::TlsConnector;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::Write;
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

const BAMBU_MQTT_PORT: u16 = 8883;
const OBSERVER_INTERVAL_SECS: u64 = 20;
const MQTT_TIMEOUT_SECS: u64 = 8;

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
        active_tray_index: None,
        nozzle_temp_c: None,
        bed_temp_c: None,
        ams_humidity_index: None,
        ams_temperature_c: None,
        ams_reading_bits: None,
        ams_read_done_bits: None,
        ams_bambu_bits: None,
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

    next.last_seen_at = next.last_seen_at.or_else(|| previous.last_seen_at.clone());
    next.progress_percent = next.progress_percent.or(previous.progress_percent);
    next.remaining_minutes = next.remaining_minutes.or(previous.remaining_minutes);
    next.active_tray_index = next.active_tray_index.or(previous.active_tray_index);
    next.nozzle_temp_c = next.nozzle_temp_c.or(previous.nozzle_temp_c);
    next.bed_temp_c = next.bed_temp_c.or(previous.bed_temp_c);
    next.ams_humidity_index = next.ams_humidity_index.or(previous.ams_humidity_index);
    next.ams_temperature_c = next.ams_temperature_c.or(previous.ams_temperature_c);
    next.ams_reading_bits = next
        .ams_reading_bits
        .or_else(|| previous.ams_reading_bits.clone());
    next.ams_read_done_bits = next
        .ams_read_done_bits
        .or_else(|| previous.ams_read_done_bits.clone());
    next.ams_bambu_bits = next
        .ams_bambu_bits
        .or_else(|| previous.ams_bambu_bits.clone());
    if next.raw_payload_json.is_none() {
        next.raw_payload_json = previous.raw_payload_json.clone();
    }
    next.trays = merge_tray_snapshots(&previous.trays, &next.trays);
    if next.raw_status_note.is_none() {
        next.raw_status_note = previous.raw_status_note.clone();
    }
    next
}

fn merge_tray_snapshots(
    previous_trays: &[BambuLiveObservedTrayRow],
    next_trays: &[BambuLiveObservedTrayRow],
) -> Vec<BambuLiveObservedTrayRow> {
    if next_trays.is_empty() {
        return previous_trays.to_vec();
    }

    let previous_by_index: HashMap<i64, &BambuLiveObservedTrayRow> = previous_trays
        .iter()
        .map(|tray| (tray.tray_index, tray))
        .collect();

    next_trays
        .iter()
        .map(|next| {
            let Some(previous) = previous_by_index.get(&next.tray_index) else {
                return next.clone();
            };
            let carry_forward_observed_identity =
                !next.loaded && next.empty_observation_count == previous.empty_observation_count;
            BambuLiveObservedTrayRow {
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
                    carry_forward_observed_identity
                        .then(|| previous.observed_rfid_tag.clone())
                        .flatten()
                }),
                tray_uuid: next.tray_uuid.clone().or_else(|| {
                    carry_forward_observed_identity
                        .then(|| previous.tray_uuid.clone())
                        .flatten()
                }),
                chip_id: next.chip_id.clone(),
                tray_info_idx: next.tray_info_idx.clone(),
                tray_id_name: next.tray_id_name.clone(),
                last_identity_seen_at: next.last_identity_seen_at.clone().or_else(|| {
                    carry_forward_observed_identity
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

    let was_printing = previous
        .map(|state| state.progress_percent.is_some() || state.remaining_minutes.is_some())
        .unwrap_or(false);
    let is_printing = next.progress_percent.is_some() || next.remaining_minutes.is_some();
    if !was_printing && is_printing {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_PRINT_STARTED",
            &json!({
                "progress_percent": next.progress_percent,
                "remaining_minutes": next.remaining_minutes,
                "active_tray_index": next.active_tray_index,
            }),
        )?;
    } else if was_printing && !is_printing {
        db.insert_printer_live_event(
            printer_id,
            "LIVE_PRINT_FINISHED",
            &json!({
                "last_seen_at": next.last_seen_at,
                "active_tray_index": next.active_tray_index,
            }),
        )?;
    }

    let previous_tray = previous.and_then(|state| state.active_tray_index);
    if previous_tray != next.active_tray_index {
        if let Some(active_tray_index) = next.active_tray_index {
            db.insert_printer_live_event(
                printer_id,
                "LIVE_ACTIVE_TRAY_CHANGED",
                &json!({"active_tray_index": active_tray_index}),
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

fn observe_printer_state(
    host: &str,
    access_code: &str,
    printer_serial: &str,
) -> Result<BambuLiveObservedStateRow, String> {
    let address = (host, BAMBU_MQTT_PORT)
        .to_socket_addrs()
        .map_err(|error| format!("failed to resolve printer host: {error}"))?
        .next()
        .ok_or_else(|| "no printer address resolved".to_string())?;
    let tcp_stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))
        .map_err(|error| format!("failed to connect to printer MQTT: {error}"))?;
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

    while started.elapsed() < Duration::from_secs(MQTT_TIMEOUT_SECS) {
        let (packet_type, payload) = match read_mqtt_packet(&mut stream) {
            Ok(packet) => packet,
            Err(error) if is_mqtt_read_timeout(&error) => {
                merged.raw_status_note =
                    Some("Connected, waiting for the next MQTT status burst.".to_string());
                break;
            }
            Err(error) => return Err(error),
        };
        if packet_type >> 4 != 3 {
            continue;
        }
        if let Some(message) = parse_publish_payload(&payload)? {
            merge_print_payload(&mut merged, &message);
            merged.last_seen_at = Some(now_iso_string());
            if !merged.trays.is_empty()
                || merged.progress_percent.is_some()
                || merged.remaining_minutes.is_some()
                || merged.nozzle_temp_c.is_some()
            {
                break;
            }
        }
    }

    if merged.last_seen_at.is_none() {
        merged.raw_status_note =
            Some("Connected, but no live MQTT status arrived during this poll.".to_string());
    }
    Ok(merged)
}

fn is_mqtt_read_timeout(error: &str) -> bool {
    error.contains("os error 35")
        || error.contains("timed out")
        || error.contains("Resource temporarily unavailable")
}

fn merge_print_payload(state: &mut BambuLiveObservedStateRow, message: &Value) {
    let print = message.get("print").unwrap_or(message);
    let has_supported_live_fields = print.get("ams").is_some()
        || print.get("mc_percent").is_some()
        || print.get("mc_remaining_time").is_some()
        || print.get("nozzle_temper").is_some()
        || print.get("bed_temper").is_some();
    if !has_supported_live_fields {
        return;
    }

    state.raw_payload_json = Some(print.clone());

    state.progress_percent = as_i64(print.get("mc_percent")).or(state.progress_percent);
    state.remaining_minutes = as_i64(print.get("mc_remaining_time")).or(state.remaining_minutes);
    state.active_tray_index = as_i64(print.pointer("/ams/tray_now")).or(state.active_tray_index);
    state.nozzle_temp_c = as_f64(print.get("nozzle_temper")).or(state.nozzle_temp_c);
    state.bed_temp_c = as_f64(print.get("bed_temper")).or(state.bed_temp_c);
    state.ams_humidity_index =
        as_i64(print.pointer("/ams/ams/0/humidity")).or(state.ams_humidity_index);
    state.ams_temperature_c = as_f64(print.pointer("/ams/ams/0/temp")).or(state.ams_temperature_c);
    state.ams_reading_bits = as_string(print.pointer("/ams/tray_reading_bits"));
    state.ams_read_done_bits = as_string(print.pointer("/ams/tray_read_done_bits"));
    state.ams_bambu_bits = as_string(print.pointer("/ams/tray_is_bbl_bits"));

    if let Some(ams_trays) = print.pointer("/ams/ams/0/tray").and_then(Value::as_array) {
        let observed_at = state.last_seen_at.clone().unwrap_or_else(now_iso_string);
        let previous_by_index: HashMap<i64, BambuLiveObservedTrayRow> = state
            .trays
            .iter()
            .cloned()
            .map(|tray| (tray.tray_index, tray))
            .collect();
        let mut merged_trays = Vec::new();
        for tray in ams_trays {
            let tray_index = as_i64(tray.get("id")).unwrap_or_default();
            let previous = previous_by_index.get(&tray_index);
            merged_trays.push(merge_tray_payload(previous, tray_index, tray, &observed_at));
        }
        state.trays = merged_trays;
    }
}

fn merge_tray_payload(
    previous: Option<&BambuLiveObservedTrayRow>,
    tray_index: i64,
    tray: &Value,
    observed_at: &str,
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
    let filament_type = as_string(tray.get("tray_type"));
    let filament_name = as_string(tray.get("tray_sub_brands"));
    let color_hex = normalize_color(as_string(tray.get("tray_color")));
    let tray_weight_g = normalize_tray_weight(as_i64(tray.get("tray_weight")));
    let remaining_percent = normalize_remaining_percent(as_i64(tray.get("remain")));
    let has_rfid_identity_signal = tray_uuid.is_some();
    let has_live_observation_signal = observed_rfid_tag.is_some()
        || tray_uuid.is_some()
        || chip_id.is_some()
        || tray_info_idx.is_some()
        || tray_id_name.is_some();
    let empty_observation = !substantive_fields && !has_live_observation_signal;
    let metadata_replacement_signal = previous.is_some()
        && substantive_tray_metadata_changed(
            previous,
            filament_type.as_deref(),
            filament_name.as_deref(),
            color_hex.as_deref(),
        );
    let should_reset_observed_identity = empty_observation || metadata_replacement_signal;

    let previous_loaded = previous.map(|value| value.loaded).unwrap_or(false);
    let loaded = if substantive_fields || has_live_observation_signal {
        true
    } else if empty_observation {
        false
    } else {
        previous_loaded
    };

    BambuLiveObservedTrayRow {
        tray_index,
        loaded,
        filament_type: if empty_observation {
            filament_type
        } else {
            filament_type.or_else(|| previous.and_then(|value| value.filament_type.clone()))
        },
        filament_name: if empty_observation {
            filament_name
        } else {
            filament_name.or_else(|| previous.and_then(|value| value.filament_name.clone()))
        },
        color_hex: if empty_observation {
            color_hex
        } else {
            color_hex.or_else(|| previous.and_then(|value| value.color_hex.clone()))
        },
        tray_weight_g: if empty_observation {
            tray_weight_g
        } else {
            tray_weight_g.or_else(|| previous.and_then(|value| value.tray_weight_g))
        },
        remaining_percent: remaining_percent
            .or_else(|| previous.and_then(|value| value.remaining_percent)),
        remaining_grams: remaining_percent
            .zip(tray_weight_g.or_else(|| previous.and_then(|value| value.tray_weight_g)))
            .and_then(|(percent, tray_weight_g)| percent_to_grams(percent, tray_weight_g))
            .or_else(|| previous.and_then(|value| value.remaining_grams)),
        observed_rfid_tag: if should_reset_observed_identity {
            observed_rfid_tag
        } else {
            observed_rfid_tag.or_else(|| previous.and_then(|value| value.observed_rfid_tag.clone()))
        },
        tray_uuid: if should_reset_observed_identity {
            tray_uuid
        } else {
            tray_uuid.or_else(|| previous.and_then(|value| value.tray_uuid.clone()))
        },
        chip_id: if should_reset_observed_identity {
            chip_id
        } else {
            chip_id.or_else(|| previous.and_then(|value| value.chip_id.clone()))
        },
        tray_info_idx: if should_reset_observed_identity {
            tray_info_idx
        } else {
            tray_info_idx.or_else(|| previous.and_then(|value| value.tray_info_idx.clone()))
        },
        tray_id_name: if should_reset_observed_identity {
            tray_id_name
        } else {
            tray_id_name.or_else(|| previous.and_then(|value| value.tray_id_name.clone()))
        },
        last_identity_seen_at: if has_rfid_identity_signal {
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
