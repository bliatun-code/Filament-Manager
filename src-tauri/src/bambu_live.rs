use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveIntegrationRow, BambuLiveObservedStateRow,
    BambuLiveObservedTrayRow, FilamentDatabase, InventoryError, PrinterOverviewRow,
    SpoolWithMasterRow,
};
use crate::state::AppState;
use native_tls::TlsConnector;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

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
    if previous.is_none() {
        return next;
    }

    let previous = previous.expect("checked is_some above");
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

fn count_review_trays(trays: &[BambuLiveObservedTrayRow]) -> usize {
    trays
        .iter()
        .filter(|tray| {
            !matches!(
                tray.match_status.as_deref(),
                None | Some("clear_match") | Some("unknown_from_printer")
            )
        })
        .count()
}

fn enrich_with_match_status(
    db: &FilamentDatabase,
    printer_id: &str,
    mut observed: BambuLiveObservedStateRow,
) -> Result<BambuLiveObservedStateRow, InventoryError> {
    let printer_overview = db
        .list_printer_overview()?
        .into_iter()
        .find(|row| row.printer.id == printer_id);
    let all_spools = db.list_spools_with_master(5000, 0)?;

    let overview = match printer_overview {
        Some(value) => value,
        None => return Ok(observed),
    };

    for tray in &mut observed.trays {
        apply_tray_match_status(tray, &overview, &all_spools);
    }
    auto_sync_live_slots(db, &overview, &observed)?;
    Ok(observed)
}

fn apply_tray_match_status(
    tray: &mut BambuLiveObservedTrayRow,
    overview: &PrinterOverviewRow,
    all_spools: &[SpoolWithMasterRow],
) {
    tray.matched_inventory_spool_id = None;
    tray.matched_inventory_mode = None;
    let has_live_unknown_rfid =
        tray.loaded && live_identity_text(tray.tray_uuid.as_deref()).is_some();

    if let Some(observed_rfid) = tray.tray_uuid.as_deref() {
        let exact_matches: Vec<_> = all_spools
            .iter()
            .filter(|row| eq_ignore_case(Some(observed_rfid), row.spool.rfid_tag.as_deref()))
            .collect();
        if exact_matches.len() == 1 {
            let spool = exact_matches[0];
            tray.matched_inventory_spool_id = Some(spool.spool.id.clone());
            tray.matched_inventory_mode = Some("exact_rfid".to_string());
            tray.match_status = Some("clear_match".to_string());
            tray.match_note = Some("Exact tray identity match against inventory.".to_string());
            return;
        }
        if exact_matches.len() > 1 {
            tray.match_status = Some("ambiguous".to_string());
            tray.match_note =
                Some("Multiple inventory rolls share this saved tray identity.".to_string());
            return;
        }
    }

    if !tray.loaded {
        tray.match_status = Some("unknown_from_printer".to_string());
        tray.match_note = Some(
            "Showing last known good tray identity until a stronger update arrives.".to_string(),
        );
        return;
    }

    let matching_slots: Vec<_> = overview
        .slots
        .iter()
        .filter(|slot| !slot.ams_id.ends_with("_ext") && slot.slot_index == tray.tray_index + 1)
        .collect();

    if matching_slots.len() > 1 {
        tray.match_status = Some("ambiguous".to_string());
        tray.match_note = Some("Multiple configured slots share this tray index.".to_string());
        return;
    }

    if let Some(slot) = matching_slots.first() {
        if slot.spool_id.is_some() {
            let material_match = eq_ignore_case(
                tray.filament_type.as_deref(),
                slot.spool_material.as_deref(),
            );
            let name_match = eq_ignore_case(
                tray.filament_name.as_deref(),
                slot.spool_filament_name.as_deref(),
            );
            let color_match =
                eq_ignore_case(tray.color_hex.as_deref(), slot.spool_hex_color.as_deref());
            let score = [material_match, name_match, color_match]
                .into_iter()
                .filter(|value| *value)
                .count();
            if score >= 2 {
                tray.matched_inventory_spool_id = slot.spool_id.clone();
                tray.matched_inventory_mode = Some("configured_metadata".to_string());
                if has_live_unknown_rfid {
                    tray.match_status = Some("unknown_rfid".to_string());
                    tray.match_note = Some(
                        "AMS reported a tray identity that is not registered in inventory."
                            .to_string(),
                    );
                } else {
                    tray.match_status = Some("clear_match".to_string());
                    tray.match_note = None;
                }
                return;
            }
            tray.match_status = Some(
                if has_live_unknown_rfid {
                    "unknown_rfid"
                } else {
                    "no_clear_match"
                }
                .to_string(),
            );
            tray.match_note = Some(
                if has_live_unknown_rfid {
                    "AMS reported a tray identity that is not registered in inventory."
                } else {
                    "Last known tray identity does not map cleanly to the currently configured spool."
                }
                .to_string(),
            );
            return;
        }
    }

    let candidates = find_inventory_candidates(tray, all_spools);
    tray.match_status = Some(if has_live_unknown_rfid {
        "unknown_rfid".to_string()
    } else {
        match candidates.len() {
            0 => "no_clear_match",
            1 => "possible_match",
            _ => "ambiguous",
        }
        .to_string()
    });
    if candidates.len() == 1 {
        tray.matched_inventory_spool_id = Some(candidates[0].spool.id.clone());
        tray.matched_inventory_mode = Some("inventory_metadata".to_string());
    }
    tray.match_note = Some(if has_live_unknown_rfid {
        "AMS reported a tray identity that is not registered in inventory.".to_string()
    } else {
        match candidates.len() {
            0 => "No clear stored spool matches this last known tray identity.".to_string(),
            1 => "One likely stored spool matches this last known tray identity.".to_string(),
            _ => "Multiple stored spools could match this live tray.".to_string(),
        }
    });
}

fn find_inventory_candidates<'a>(
    tray: &BambuLiveObservedTrayRow,
    all_spools: &'a [SpoolWithMasterRow],
) -> Vec<&'a SpoolWithMasterRow> {
    all_spools
        .iter()
        .filter(|row| {
            let material_match =
                eq_ignore_case(tray.filament_type.as_deref(), Some(&row.master.material));
            let name_match = eq_ignore_case(
                tray.filament_name.as_deref(),
                Some(&row.master.filament_name),
            );
            let color_match =
                eq_ignore_case(tray.color_hex.as_deref(), row.master.hex_color.as_deref());
            [material_match, name_match, color_match]
                .into_iter()
                .filter(|value| *value)
                .count()
                >= 2
        })
        .collect()
}

fn auto_sync_live_slots(
    db: &FilamentDatabase,
    overview: &PrinterOverviewRow,
    observed: &BambuLiveObservedStateRow,
) -> Result<(), InventoryError> {
    if observed
        .ams_reading_bits
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "0")
        .is_some()
    {
        return Ok(());
    }

    for tray in &observed.trays {
        let slot = overview
            .slots
            .iter()
            .find(|slot| !slot.ams_id.ends_with("_ext") && slot.slot_index == tray.tray_index + 1);

        let auto_clear_empty_signal = should_auto_clear_live_slot(tray);
        let auto_clear_unknown_replacement = slot
            .map(|configured_slot| should_auto_clear_live_unknown_replacement(tray, configured_slot))
            .unwrap_or(false);
        let auto_clear_color_replacement = slot
            .map(|configured_slot| {
                should_auto_clear_live_color_replacement(
                    tray,
                    configured_slot.live_color_hex.as_deref(),
                    configured_slot,
                )
            })
            .unwrap_or(false);

        if auto_clear_empty_signal || auto_clear_unknown_replacement || auto_clear_color_replacement
        {
            if let Some(slot) = slot {
                if slot.spool_id.is_some() {
                    db.assign_spool_to_ams_slot(
                        &overview.printer.id,
                        &slot.slot_id,
                        None,
                        None,
                        None,
                        false,
                    )?;
                    db.insert_printer_live_event(
                        &overview.printer.id,
                        "LIVE_AUTO_SLOT_EMPTIED",
                        &json!({
                            "slot_id": slot.slot_id,
                            "slot_index": slot.slot_index,
                            "reason": if auto_clear_empty_signal {
                                "empty_signal"
                            } else if auto_clear_color_replacement {
                                "color_replacement_without_rfid"
                            } else {
                                "unknown_rfid_replacement"
                            },
                            "observed_tray_uuid": tray.tray_uuid,
                            "observed_color_hex": tray.color_hex,
                            "observed_at": if auto_clear_empty_signal {
                                tray.last_empty_seen_at.clone()
                            } else {
                                tray.last_identity_seen_at.clone()
                            },
                            "empty_observation_count": tray.empty_observation_count,
                        }),
                    )?;
                }
            }
            continue;
        }

        let Some(spool_id) = tray.matched_inventory_spool_id.as_deref() else {
            continue;
        };
        if tray.matched_inventory_mode.as_deref() != Some("exact_rfid") {
            continue;
        }
        if !identity_is_recent(tray.last_identity_seen_at.as_deref(), 10) {
            continue;
        }
        let Some(slot) = slot else {
            continue;
        };
        if live_identity_is_blocked_by_manual_clear(
            tray.last_identity_seen_at.as_deref(),
            slot.live_cache_cleared_at.as_deref(),
        ) {
            continue;
        }
        if slot.spool_id.as_deref() != Some(spool_id) {
            db.assign_spool_to_ams_slot(
                &overview.printer.id,
                &slot.slot_id,
                Some(spool_id),
                None,
                None,
                false,
            )?;
            db.insert_printer_live_event(
                &overview.printer.id,
                "LIVE_AUTO_SLOT_MATCHED",
                &json!({
                    "slot_id": slot.slot_id,
                    "slot_index": slot.slot_index,
                    "spool_id": spool_id,
                    "rfid_tag": tray.observed_rfid_tag,
                    "observed_at": tray.last_identity_seen_at,
                }),
            )?;
        }

        if let Some(remaining_grams) = tray.remaining_grams {
            sync_live_weight(db, &overview.printer.id, spool_id, remaining_grams, tray)?;
        }
    }

    Ok(())
}

fn should_auto_clear_live_slot(tray: &BambuLiveObservedTrayRow) -> bool {
    !tray.loaded
        && tray.observed_rfid_tag.is_none()
        && tray.tray_uuid.is_none()
        && tray.chip_id.is_none()
        && tray.empty_observation_count.unwrap_or(0) >= 1
}

fn should_auto_clear_live_unknown_replacement(
    tray: &BambuLiveObservedTrayRow,
    slot: &crate::backend::filament_database::PrinterAmsSlotRow,
) -> bool {
    if slot.spool_id.is_none()
        || !tray.loaded
        || tray.match_status.as_deref() != Some("unknown_rfid")
    {
        return false;
    }
    let Some(observed_tray_uuid) = live_identity_text(tray.tray_uuid.as_deref()) else {
        return false;
    };
    let Some(observed_color_hex) = live_identity_text(tray.color_hex.as_deref()) else {
        return false;
    };
    if slot_override_matches_live_unknown(slot, observed_tray_uuid, observed_color_hex) {
        return false;
    }
    if let Some(saved_rfid) = live_identity_text(slot.spool_rfid_tag.as_deref()) {
        return !saved_rfid.eq_ignore_ascii_case(observed_tray_uuid);
    }
    true
}

fn should_auto_clear_live_color_replacement(
    tray: &BambuLiveObservedTrayRow,
    previous_live_color_hex: Option<&str>,
    slot: &crate::backend::filament_database::PrinterAmsSlotRow,
) -> bool {
    if slot.spool_id.is_none() || !tray.loaded {
        return false;
    }
    if live_identity_text(tray.tray_uuid.as_deref()).is_some() {
        return false;
    }
    let Some(observed_color_hex) = live_identity_text(tray.color_hex.as_deref()) else {
        return false;
    };
    let Some(previous_color_hex) = live_identity_text(previous_live_color_hex) else {
        return false;
    };
    !previous_color_hex.eq_ignore_ascii_case(observed_color_hex)
}

fn slot_override_matches_live_unknown(
    slot: &crate::backend::filament_database::PrinterAmsSlotRow,
    observed_tray_uuid: &str,
    observed_color_hex: &str,
) -> bool {
    let Some(override_tray_uuid) = live_identity_text(slot.rfid_override_tray_uuid.as_deref())
    else {
        return false;
    };
    let Some(override_color_hex) = live_identity_text(slot.rfid_override_color_hex.as_deref())
    else {
        return false;
    };
    override_tray_uuid.eq_ignore_ascii_case(observed_tray_uuid)
        && override_color_hex.eq_ignore_ascii_case(observed_color_hex)
}

fn live_identity_text(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn sync_live_weight(
    db: &FilamentDatabase,
    printer_id: &str,
    spool_id: &str,
    remaining_grams: i64,
    tray: &BambuLiveObservedTrayRow,
) -> Result<(), InventoryError> {
    let Some(spool) = db.get_spool_by_id(spool_id)? else {
        return Ok(());
    };
    let current = spool.current_weight_g.or(spool.remaining_g);
    if current == Some(remaining_grams) {
        return Ok(());
    }

    let next_status = if remaining_grams == 0 {
        "EMPTY"
    } else {
        "ASSIGNED"
    };
    db.update_spool_weight(spool_id, Some(remaining_grams), Some(remaining_grams))?;
    db.update_spool_status(spool_id, next_status)?;
    db.ensure_scale("bambu-ams", "Bambu AMS", "VIRTUAL")?;
    db.insert_weight_reading("bambu-ams", spool_id, remaining_grams, "BAMBU_AMS")?;
    db.insert_spool_history_event(
        spool_id,
        "WEIGHT_UPDATED",
        &json!({
            "grams": remaining_grams,
            "previous_grams": current,
            "remaining_percent": tray.remaining_percent,
            "tray_weight_g": tray.tray_weight_g,
            "source": "BAMBU_AMS",
            "printer_id": printer_id,
            "observed_at": tray.last_identity_seen_at,
        })
        .to_string(),
    )?;
    db.insert_printer_live_event(
        printer_id,
        "LIVE_AUTO_WEIGHT_SYNC",
        &json!({
            "spool_id": spool_id,
            "remaining_grams": remaining_grams,
            "remaining_percent": tray.remaining_percent,
            "tray_weight_g": tray.tray_weight_g,
            "observed_at": tray.last_identity_seen_at,
        }),
    )?;
    Ok(())
}

fn eq_ignore_case(left: Option<&str>, right: Option<&str>) -> bool {
    let Some(left) = left.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(right) = right.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    left.eq_ignore_ascii_case(right)
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

fn build_connect_packet(client_id: &str, username: &str, password: &str) -> Vec<u8> {
    let mut variable_header = Vec::new();
    push_mqtt_string(&mut variable_header, "MQTT");
    variable_header.push(4);
    variable_header.push(0x02 | 0x80 | 0x40);
    variable_header.extend_from_slice(&30_u16.to_be_bytes());

    let mut payload = Vec::new();
    push_mqtt_string(&mut payload, client_id);
    push_mqtt_string(&mut payload, username);
    push_mqtt_string(&mut payload, password);

    let mut packet = vec![0x10];
    packet.extend(encode_varint(variable_header.len() + payload.len()));
    packet.extend(variable_header);
    packet.extend(payload);
    packet
}

fn build_subscribe_packet(topic: &str) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&1_u16.to_be_bytes());
    push_mqtt_string(&mut payload, topic);
    payload.push(0);

    let mut packet = vec![0x82];
    packet.extend(encode_varint(payload.len()));
    packet.extend(payload);
    packet
}

fn push_mqtt_string(buffer: &mut Vec<u8>, value: &str) {
    let bytes = value.as_bytes();
    buffer.extend_from_slice(&(bytes.len() as u16).to_be_bytes());
    buffer.extend_from_slice(bytes);
}

fn encode_varint(mut value: usize) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value % 128) as u8;
        value /= 128;
        if value > 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
    out
}

fn read_mqtt_packet(stream: &mut impl Read) -> Result<(u8, Vec<u8>), String> {
    let mut fixed_header = [0_u8; 1];
    stream.read_exact(&mut fixed_header).map_err(|error| {
        if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) {
            format!("failed to read MQTT fixed header: timed out waiting for MQTT data ({error})")
        } else {
            format!("failed to read MQTT fixed header: {error}")
        }
    })?;

    let mut multiplier = 1_usize;
    let mut remaining_length = 0_usize;
    loop {
        let mut encoded = [0_u8; 1];
        stream
            .read_exact(&mut encoded)
            .map_err(|error| format!("failed to read MQTT remaining length: {error}"))?;
        remaining_length += ((encoded[0] & 0x7F) as usize) * multiplier;
        if encoded[0] & 0x80 == 0 {
            break;
        }
        multiplier *= 128;
    }

    let mut payload = vec![0_u8; remaining_length];
    stream
        .read_exact(&mut payload)
        .map_err(|error| format!("failed to read MQTT payload: {error}"))?;
    Ok((fixed_header[0], payload))
}

fn parse_publish_payload(payload: &[u8]) -> Result<Option<Value>, String> {
    if payload.len() < 2 {
        return Ok(None);
    }
    let topic_length = u16::from_be_bytes([payload[0], payload[1]]) as usize;
    if payload.len() < topic_length + 2 {
        return Ok(None);
    }
    let message_bytes = &payload[(2 + topic_length)..];
    serde_json::from_slice::<Value>(message_bytes)
        .map(Some)
        .map_err(|error| format!("failed to parse live MQTT JSON payload: {error}"))
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
    let metadata_replacement_signal = previous.is_some() && substantive_tray_metadata_changed(
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

fn identity_is_recent(raw: Option<&str>, max_age_minutes: i64) -> bool {
    let Some(observed_at) = parse_flexible_timestamp(raw) else {
        return false;
    };
    let age = OffsetDateTime::now_utc() - observed_at;
    age >= TimeDuration::ZERO && age <= TimeDuration::minutes(max_age_minutes)
}

fn live_identity_is_blocked_by_manual_clear(
    observed_at: Option<&str>,
    cleared_at: Option<&str>,
) -> bool {
    let Some(cleared_at) = parse_flexible_timestamp(cleared_at) else {
        return false;
    };
    let Some(observed_at) = parse_flexible_timestamp(observed_at) else {
        return true;
    };
    observed_at <= cleared_at
}

fn parse_flexible_timestamp(raw: Option<&str>) -> Option<OffsetDateTime> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }
    OffsetDateTime::parse(raw, &Rfc3339).ok().or_else(|| {
        let normalized = raw.replace(' ', "T");
        let with_timezone = if normalized.ends_with('Z')
            || normalized.contains('+')
            || normalized
                .rfind('-')
                .map(|index| index > 10)
                .unwrap_or(false)
        {
            normalized
        } else {
            format!("{normalized}Z")
        };
        OffsetDateTime::parse(&with_timezone, &Rfc3339).ok()
    })
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
mod tests {
    use super::{
        apply_tray_match_status, merge_tray_payload, should_auto_clear_live_color_replacement,
        should_auto_clear_live_unknown_replacement, slot_override_matches_live_unknown,
    };
    use crate::backend::filament_database::{
        BambuLiveObservedTrayRow, FilamentMasterSummary, PrinterAmsSlotRow, PrinterOverviewRow,
        PrinterRow, PrinterUsageRow, SpoolRow, SpoolWithMasterRow,
    };

    fn make_slot() -> PrinterAmsSlotRow {
        PrinterAmsSlotRow {
            slot_id: "slot_1".to_string(),
            ams_id: "printer_1_ams_1".to_string(),
            slot_index: 1,
            spool_id: Some("spool_1".to_string()),
            spool_status: Some("ASSIGNED".to_string()),
            spool_ownership_type: Some("OWNED".to_string()),
            spool_owner_name: None,
            spool_remaining_g: Some(700),
            spool_rfid_tag: None,
            spool_material: Some("PLA".to_string()),
            spool_filament_name: Some("Basic".to_string()),
            spool_color_name: Some("Red".to_string()),
            spool_hex_color: Some("#FF0000".to_string()),
            rfid_override_tray_uuid: None,
            rfid_override_color_hex: None,
            live_cache_cleared_at: None,
            live_loaded: None,
            live_observed_rfid_tag: None,
            live_tray_uuid: None,
            live_chip_id: None,
            live_tray_info_idx: None,
            live_tray_id_name: None,
            live_filament_type: None,
            live_filament_name: None,
            live_color_hex: None,
            live_tray_weight_g: None,
            live_remaining_percent: None,
            live_last_identity_seen_at: None,
            live_match_status: None,
            live_match_note: None,
            live_matched_inventory_spool_id: None,
            live_matched_inventory_mode: None,
            live_is_active: None,
            live_printer_last_seen_at: None,
            live_mqtt_connected: None,
            live_ams_read_done_bits: None,
            live_ams_bambu_bits: None,
        }
    }

    fn make_tray() -> BambuLiveObservedTrayRow {
        BambuLiveObservedTrayRow {
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#00FF00".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(80),
            remaining_grams: Some(800),
            observed_rfid_tag: Some("legacy".to_string()),
            tray_uuid: Some("tray-uuid-unknown".to_string()),
            chip_id: Some("chip".to_string()),
            tray_info_idx: None,
            tray_id_name: None,
            last_identity_seen_at: Some("2026-04-15T10:00:00Z".to_string()),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }
    }

    fn make_overview(slot: PrinterAmsSlotRow) -> PrinterOverviewRow {
        PrinterOverviewRow {
            printer: PrinterRow {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Printer 1".to_string(),
                created_at: "2026-04-15 10:00:00".to_string(),
                updated_at: "2026-04-15 10:00:00".to_string(),
            },
            usage: PrinterUsageRow {
                total_jobs: 0,
                successful_jobs: 0,
                failed_jobs: 0,
                total_used_g: 0,
                last_job_at: None,
            },
            slots: vec![slot],
        }
    }

    fn make_inventory_spool(id: &str, rfid_tag: Option<&str>) -> SpoolWithMasterRow {
        SpoolWithMasterRow {
            spool: SpoolRow {
                id: id.to_string(),
                master_id: "master_1".to_string(),
                qr_code: None,
                rfid_tag: rfid_tag.map(str::to_string),
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            },
            master: FilamentMasterSummary {
                id: "master_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Red".to_string(),
                hex_color: Some("#FF0000".to_string()),
                product_url: None,
                default_weight: 1000,
                vendor: "Generic".to_string(),
            },
        }
    }

    #[test]
    fn apply_tray_match_status_marks_loaded_unknown_rfid_even_with_metadata_match() {
        let slot = make_slot();
        let overview = make_overview(slot);
        let mut tray = make_tray();

        apply_tray_match_status(
            &mut tray,
            &overview,
            &[make_inventory_spool("spool_1", None)],
        );

        assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
        assert_eq!(
            tray.matched_inventory_mode.as_deref(),
            Some("configured_metadata")
        );
        assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
    }

    #[test]
    fn unknown_rfid_replacement_clears_on_new_unknown_identity_and_respects_override() {
        let mut slot = make_slot();
        let tray = BambuLiveObservedTrayRow {
            match_status: Some("unknown_rfid".to_string()),
            ..make_tray()
        };

        assert!(should_auto_clear_live_unknown_replacement(&tray, &slot));

        slot.rfid_override_tray_uuid = Some("tray-uuid-unknown".to_string());
        slot.rfid_override_color_hex = Some("#00FF00".to_string());

        assert!(slot_override_matches_live_unknown(
            &slot,
            "tray-uuid-unknown",
            "#00FF00"
        ));
        assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));
    }

    #[test]
    fn unknown_rfid_replacement_does_not_clear_same_identity_or_missing_color_signal() {
        let mut slot = make_slot();
        let tray = BambuLiveObservedTrayRow {
            match_status: Some("unknown_rfid".to_string()),
            ..make_tray()
        };

        slot.spool_rfid_tag = Some("tray-uuid-unknown".to_string());
        assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));

        let missing_color = BambuLiveObservedTrayRow {
            color_hex: None,
            ..tray
        };
        let mut different_unknown_without_saved_rfid = make_slot();
        different_unknown_without_saved_rfid.spool_rfid_tag = None;
        assert!(!should_auto_clear_live_unknown_replacement(
            &missing_color,
            &different_unknown_without_saved_rfid
        ));
    }

    #[test]
    fn color_replacement_without_rfid_clears_when_new_color_arrives() {
        let slot = make_slot();
        let tray = BambuLiveObservedTrayRow {
            observed_rfid_tag: None,
            tray_uuid: None,
            color_hex: Some("#FFFF00".to_string()),
            match_status: Some("no_clear_match".to_string()),
            ..make_tray()
        };
        assert!(should_auto_clear_live_color_replacement(
            &tray,
            Some("#00FF00"),
            &slot
        ));
    }

    #[test]
    fn color_replacement_without_rfid_does_not_clear_same_missing_or_rfid_color() {
        let slot = make_slot();
        let same_color_tray = BambuLiveObservedTrayRow {
            observed_rfid_tag: None,
            tray_uuid: None,
            color_hex: Some("#FF0000".to_string()),
            ..make_tray()
        };
        assert!(!should_auto_clear_live_color_replacement(
            &same_color_tray,
            Some("#FF0000"),
            &slot
        ));

        let missing_color_tray = BambuLiveObservedTrayRow {
            observed_rfid_tag: None,
            tray_uuid: None,
            color_hex: None,
            ..make_tray()
        };
        assert!(!should_auto_clear_live_color_replacement(
            &missing_color_tray,
            Some("#FF0000"),
            &slot
        ));

        let rfid_tray = BambuLiveObservedTrayRow {
            tray_uuid: Some("real-rfid".to_string()),
            color_hex: Some("#FFFF00".to_string()),
            ..make_tray()
        };
        assert!(!should_auto_clear_live_color_replacement(
            &rfid_tray,
            Some("#FF0000"),
            &slot
        ));

        assert!(!should_auto_clear_live_color_replacement(
            &same_color_tray,
            None,
            &slot
        ));
    }

    #[test]
    fn manual_clear_blocks_stale_live_identity_until_newer_mqtt_arrives() {
        assert!(super::live_identity_is_blocked_by_manual_clear(
            Some("2026-04-15T10:00:00Z"),
            Some("2026-04-15 10:00:00")
        ));
        assert!(super::live_identity_is_blocked_by_manual_clear(
            None,
            Some("2026-04-15 10:00:00")
        ));
        assert!(!super::live_identity_is_blocked_by_manual_clear(
            Some("2026-04-15T10:00:01Z"),
            Some("2026-04-15 10:00:00")
        ));
    }

    #[test]
    fn id_only_tray_payload_marks_empty_and_clears_on_first_observation() {
        let previous = make_tray();
        let payload = serde_json::json!({
            "id": "2"
        });

        let merged = merge_tray_payload(Some(&previous), 2, &payload, "2026-04-16T15:14:10Z");

        assert!(!merged.loaded);
        assert!(merged.tray_uuid.is_none());
        assert!(merged.observed_rfid_tag.is_none());
        assert_eq!(merged.empty_observation_count, Some(1));
        assert!(super::should_auto_clear_live_slot(&merged));
    }

    #[test]
    fn id_only_tray_payload_clears_stale_live_metadata() {
        let previous = make_tray();
        let payload = serde_json::json!({
            "id": "2"
        });

        let merged = merge_tray_payload(Some(&previous), 2, &payload, "2026-04-16T15:14:10Z");

        assert!(merged.color_hex.is_none());
        assert!(merged.filament_type.is_none());
        assert!(merged.filament_name.is_none());
    }

    #[test]
    fn merge_print_payload_accepts_top_level_ams_payload() {
        let mut state = super::default_offline_state();
        state.online = true;
        state.mqtt_connected = true;
        state.last_seen_at = Some("2026-04-16T17:29:03Z".to_string());
        let payload = serde_json::json!({
            "ams": {
                "ams": [
                    {
                        "id": "0",
                        "tray": [
                            { "id": "0" },
                            {
                                "id": "1",
                                "tray_color": "F7E6DEFF",
                                "tray_weight": "1000",
                                "tray_type": "PLA",
                                "tray_sub_brands": "PLA Basic",
                                "tray_uuid": "F5993C11FBCC470BBACFCBA4344280B5"
                            }
                        ]
                    }
                ]
            },
            "bed_temper": 22.6875,
            "command": "push_status",
            "msg": 1,
            "sequence_id": "57491"
        });

        super::merge_print_payload(&mut state, &payload);

        assert_eq!(state.bed_temp_c, Some(22.6875));
        assert_eq!(state.trays.len(), 2);
        assert!(!state.trays[0].loaded);
        assert_eq!(state.trays[1].tray_uuid.as_deref(), Some("F5993C11FBCC470BBACFCBA4344280B5"));
        assert_eq!(state.trays[1].tray_weight_g, Some(1000));
    }

    #[test]
    fn merge_tray_payload_derives_remaining_grams_from_tray_weight() {
        let previous = make_tray();
        let payload = serde_json::json!({
            "id": 0,
            "tray_type": "PLA",
            "tray_sub_brands": "Support for PLA",
            "tray_color": "FFFFFFFF",
            "tray_weight": "250",
            "remain": 33
        });

        let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:05:00Z");

        assert_eq!(merged.tray_weight_g, Some(250));
        assert_eq!(merged.remaining_percent, Some(33));
        assert_eq!(merged.remaining_grams, Some(83));
    }

    #[test]
    fn merge_tray_payload_clears_stale_rfid_identity_on_new_non_rfid_observation() {
        let previous = make_tray();
        let payload = serde_json::json!({
            "id": 0,
            "tray_type": "PLA",
            "tray_sub_brands": "eSUN PLA+"
        });

        let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:00:00Z");

        assert!(merged.loaded);
        assert_eq!(merged.filament_name.as_deref(), Some("eSUN PLA+"));
        assert!(merged.tray_uuid.is_none());
        assert!(merged.observed_rfid_tag.is_none());
        assert!(merged.last_identity_seen_at.is_none());
        assert!(merged.matched_inventory_spool_id.is_none());
        assert!(merged.matched_inventory_mode.is_none());
        assert!(merged.match_status.is_none());
    }

    #[test]
    fn merge_tray_payload_keeps_exact_rfid_identity_on_partial_same_metadata_update() {
        let previous = make_tray();
        let payload = serde_json::json!({
            "id": 0,
            "tray_type": "PLA",
            "tray_sub_brands": "Basic",
            "tray_color": "00FF00FF"
        });

        let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:05:00Z");

        assert!(merged.loaded);
        assert_eq!(merged.tray_uuid.as_deref(), Some("tray-uuid-unknown"));
        assert_eq!(
            merged.last_identity_seen_at.as_deref(),
            previous.last_identity_seen_at.as_deref()
        );
    }

    #[test]
    fn merge_tray_snapshots_allows_empty_update_to_clear_loaded_state() {
        let previous = make_tray();
        let next = BambuLiveObservedTrayRow {
            loaded: false,
            observed_rfid_tag: None,
            tray_uuid: None,
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            last_identity_seen_at: None,
            last_empty_seen_at: Some("2026-04-16T14:10:00Z".to_string()),
            empty_observation_count: Some(2),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
            ..make_tray()
        };

        let merged = super::merge_tray_snapshots(&[previous], &[next]);

        assert_eq!(merged.len(), 1);
        assert!(!merged[0].loaded);
        assert!(merged[0].tray_uuid.is_none());
    }
}
