use crate::backend::filament_database::{
    BambuLiveObservedStateRow, BambuLiveObservedTrayRow, FilamentDatabase, InventoryError,
    PrinterOverviewRow, SpoolWithMasterRow,
};
use serde_json::json;
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

pub(crate) fn count_review_trays(trays: &[BambuLiveObservedTrayRow]) -> usize {
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

pub(crate) fn enrich_with_match_status(
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

pub(crate) fn apply_tray_match_status(
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
            .map(|configured_slot| {
                should_auto_clear_live_unknown_replacement(tray, configured_slot)
            })
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

pub(crate) fn should_auto_clear_live_slot(tray: &BambuLiveObservedTrayRow) -> bool {
    !tray.loaded
        && tray.observed_rfid_tag.is_none()
        && tray.tray_uuid.is_none()
        && tray.chip_id.is_none()
        && tray.empty_observation_count.unwrap_or(0) >= 1
}

pub(crate) fn should_auto_clear_live_unknown_replacement(
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

pub(crate) fn should_auto_clear_live_color_replacement(
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

pub(crate) fn slot_override_matches_live_unknown(
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

fn identity_is_recent(raw: Option<&str>, max_age_minutes: i64) -> bool {
    let Some(observed_at) = parse_flexible_timestamp(raw) else {
        return false;
    };
    let age = OffsetDateTime::now_utc() - observed_at;
    age >= TimeDuration::ZERO && age <= TimeDuration::minutes(max_age_minutes)
}

pub(crate) fn live_identity_is_blocked_by_manual_clear(
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
