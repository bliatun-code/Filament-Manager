use crate::backend::database_printer_usage_sessions::{
    LiveUsageDeltaInput, LiveUsageObservedWeightCorrectionInput, LiveUsageSessionInput,
    LIVE_USAGE_PROVISIONAL_SESSION_KEY,
};
use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveObservedStateRow, BambuLiveObservedTrayRow, FilamentDatabase, PrinterOverviewRow,
    SpoolWithMasterRow,
};
use serde_json::{json, Value};
use time::{format_description::well_known::Rfc3339, Duration as TimeDuration, OffsetDateTime};

const LIVE_WEIGHT_MIN_SANE_DROP_G: i64 = 80;
const LIVE_WEIGHT_MAX_SANE_DROP_RATIO_DIVISOR: i64 = 10;
const LIVE_USAGE_WARMUP_PROGRESS_PERCENT: i64 = 10;
const LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS: i64 = 15 * 60;
const LIVE_WEIGHT_MIN_USAGE_CORRECTION_G: i64 = 20;
const LIVE_USAGE_AUTO_COMPLETE_PROGRESS_PERCENT: i64 = 99;
const LIVE_USAGE_AUTO_COMPLETE_MAX_REMAINING_MINUTES: i64 = 10;
const LIVE_USAGE_CARRIED_COMPLETE_PROGRESS_PERCENT: i64 = 98;
const LIVE_USAGE_CARRIED_COMPLETE_MAX_REMAINING_MINUTES: i64 = 1;
const LIVE_USAGE_CARRIED_LOST_JOB_COMPLETE_PROGRESS_PERCENT: i64 = 90;
const LIVE_USAGE_CARRIED_LOST_JOB_COMPLETE_MAX_REMAINING_MINUTES: i64 = 10;
const LIVE_WEIGHT_NEAR_FINISH_PROGRESS_PERCENT: i64 = 90;
const LIVE_WEIGHT_NEAR_FINISH_MAX_REMAINING_MINUTES: i64 = 10;
const LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G: i64 = 10;
const LIVE_WEIGHT_NEAR_FINISH_MIN_RECORDED_USAGE_G: i64 = 50;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum LiveWeightDecision {
    IgnoreUnchanged,
    AcceptBaseline,
    AcceptDecrease {
        used_grams: i64,
    },
    IgnoreIncrease {
        increase_grams: i64,
    },
    RejectDropOutlier {
        drop_grams: i64,
        max_sane_drop_grams: i64,
    },
}

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
    let usage_context = live_print_usage_context(&observed);
    if let Some(context) = usage_context.as_ref() {
        if context.finished_success.is_none() {
            db.touch_live_usage_session(LiveUsageSessionInput {
                printer_id: &overview.printer.id,
                session_key: &context.session_key,
                job_name: context.job_name.as_deref(),
                print_type: context.print_type.as_deref(),
                observed_at: context.observed_at.as_deref(),
            })?;
        }
    }
    let slot_usage_context = match usage_context.as_ref() {
        Some(context) if context.finished_success.is_some() => db
            .live_usage_session_is_active(&overview.printer.id, &context.session_key)?
            .then_some(context),
        other => other,
    };
    auto_sync_live_slots(db, &overview, &observed, slot_usage_context)?;
    if let Some(context) = usage_context.as_ref() {
        if let Some(success) = context.finished_success {
            db.finish_live_usage_session(
                &overview.printer.id,
                &context.session_key,
                context.observed_at.as_deref(),
                success,
            )?;
        }
    }
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
    usage_context: Option<&LivePrintUsageContext>,
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
            sync_live_weight(
                db,
                &overview.printer.id,
                spool_id,
                remaining_grams,
                tray,
                usage_context,
            )?;
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
    usage_context: Option<&LivePrintUsageContext>,
) -> Result<(), InventoryError> {
    let Some(spool) = db.get_spool_by_id(spool_id)? else {
        return Ok(());
    };
    let current = spool.current_weight_g.or(spool.remaining_g);
    let decision = classify_live_weight_update(current, remaining_grams);
    match decision {
        LiveWeightDecision::IgnoreUnchanged => return Ok(()),
        LiveWeightDecision::IgnoreIncrease { increase_grams } => {
            if let Some(current_grams) = current {
                if should_rebase_live_weight_before_usage(
                    db,
                    printer_id,
                    spool_id,
                    current_grams,
                    remaining_grams,
                    usage_context,
                )? {
                    rebase_live_weight_before_usage(
                        db,
                        LiveWeightRebaseInput {
                            printer_id,
                            spool_id,
                            previous_grams: current_grams,
                            remaining_grams,
                            increase_grams,
                            tray,
                            usage_context,
                        },
                    )?;
                    return Ok(());
                }
            }

            let usage_session_key = usage_context.map(|context| context.session_key.as_str());
            let dedupe_key = live_weight_ignored_dedupe_key(
                spool_id,
                usage_session_key,
                tray.tray_index,
                current,
                remaining_grams,
                increase_grams,
            );
            db.insert_printer_live_event_unless_recent_duplicate(
                printer_id,
                "LIVE_AUTO_WEIGHT_IGNORED",
                &json!({
                    "dedupe_key": dedupe_key.as_str(),
                    "dedupe_window_seconds": LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
                    "spool_id": spool_id,
                    "reason": "increase",
                    "current_grams": current,
                    "remaining_grams": remaining_grams,
                    "increase_grams": increase_grams,
                    "tray_index": tray.tray_index,
                    "tray_uuid": tray.tray_uuid.as_deref(),
                    "match_status": tray.match_status.as_deref(),
                    "matched_inventory_mode": tray.matched_inventory_mode.as_deref(),
                    "remaining_percent": tray.remaining_percent,
                    "tray_weight_g": tray.tray_weight_g,
                    "observed_at": tray.last_identity_seen_at,
                    "usage_session_key": usage_session_key,
                    "job_name": usage_context.and_then(|context| context.job_name.as_deref()),
                    "print_type": usage_context.and_then(|context| context.print_type.as_deref()),
                    "progress_percent": usage_context.and_then(|context| context.progress_percent),
                    "remaining_minutes": usage_context.and_then(|context| context.remaining_minutes),
                    "finished_success": usage_context.and_then(|context| context.finished_success),
                }),
                &dedupe_key,
                LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
            )?;
            if let Some(context) = usage_context {
                if let Some(correction) = db.correct_live_usage_for_observed_weight_increase(
                    LiveUsageObservedWeightCorrectionInput {
                        printer_id,
                        session_key: &context.session_key,
                        spool_id,
                        observed_grams: remaining_grams,
                        observed_at: context.observed_at.as_deref(),
                        min_correction_grams: LIVE_WEIGHT_MIN_USAGE_CORRECTION_G,
                    },
                )? {
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
                        "WEIGHT_CORRECTED",
                        &json!({
                            "grams": remaining_grams,
                            "previous_grams": current,
                            "baseline_grams": correction.baseline_grams,
                            "previous_used_grams": correction.previous_used_grams,
                            "corrected_used_grams": correction.corrected_used_grams,
                            "correction_grams": correction.correction_grams,
                            "usage_session_id": correction.session_id.as_str(),
                            "usage_session_key": context.session_key.as_str(),
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
                        "LIVE_AUTO_WEIGHT_CORRECTED",
                        &json!({
                            "spool_id": spool_id,
                            "remaining_grams": remaining_grams,
                            "previous_grams": current,
                            "baseline_grams": correction.baseline_grams,
                            "previous_used_grams": correction.previous_used_grams,
                            "corrected_used_grams": correction.corrected_used_grams,
                            "correction_grams": correction.correction_grams,
                            "usage_session_id": correction.session_id.as_str(),
                            "usage_session_key": context.session_key.as_str(),
                            "job_name": context.job_name.as_deref(),
                            "print_type": context.print_type.as_deref(),
                            "progress_percent": context.progress_percent,
                            "remaining_minutes": context.remaining_minutes,
                            "finished_success": context.finished_success,
                            "tray_index": tray.tray_index,
                            "tray_uuid": tray.tray_uuid.as_deref(),
                            "match_status": tray.match_status.as_deref(),
                            "matched_inventory_mode": tray.matched_inventory_mode.as_deref(),
                            "remaining_percent": tray.remaining_percent,
                            "tray_weight_g": tray.tray_weight_g,
                            "observed_at": tray.last_identity_seen_at,
                        }),
                    )?;
                }
            }
            return Ok(());
        }
        LiveWeightDecision::RejectDropOutlier {
            drop_grams,
            max_sane_drop_grams,
        } => {
            db.insert_printer_live_event(
                printer_id,
                "LIVE_AUTO_WEIGHT_REJECTED",
                &json!({
                    "spool_id": spool_id,
                    "reason": "drop_outlier",
                    "current_grams": current,
                    "remaining_grams": remaining_grams,
                    "drop_grams": drop_grams,
                    "max_sane_drop_grams": max_sane_drop_grams,
                    "tray_index": tray.tray_index,
                    "tray_uuid": tray.tray_uuid.as_deref(),
                    "match_status": tray.match_status.as_deref(),
                    "matched_inventory_mode": tray.matched_inventory_mode.as_deref(),
                    "remaining_percent": tray.remaining_percent,
                    "tray_weight_g": tray.tray_weight_g,
                    "observed_at": tray.last_identity_seen_at,
                    "usage_session_key": usage_context.map(|context| context.session_key.as_str()),
                    "job_name": usage_context.and_then(|context| context.job_name.as_deref()),
                    "print_type": usage_context.and_then(|context| context.print_type.as_deref()),
                    "progress_percent": usage_context.and_then(|context| context.progress_percent),
                    "remaining_minutes": usage_context.and_then(|context| context.remaining_minutes),
                    "finished_success": usage_context.and_then(|context| context.finished_success),
                }),
            )?;
            return Ok(());
        }
        LiveWeightDecision::AcceptBaseline | LiveWeightDecision::AcceptDecrease { .. } => {}
    }

    if let (LiveWeightDecision::AcceptDecrease { used_grams }, Some(context)) =
        (&decision, usage_context)
    {
        if should_ignore_near_finish_small_decrease(db, printer_id, spool_id, *used_grams, context)?
        {
            let dedupe_key = live_weight_near_finish_drop_dedupe_key(
                spool_id,
                &context.session_key,
                tray.tray_index,
                current,
                remaining_grams,
                *used_grams,
            );
            db.insert_printer_live_event_unless_recent_duplicate(
                printer_id,
                "LIVE_AUTO_WEIGHT_IGNORED",
                &json!({
                    "dedupe_key": dedupe_key.as_str(),
                    "dedupe_window_seconds": LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
                    "spool_id": spool_id,
                    "reason": "near_finish_small_decrease",
                    "current_grams": current,
                    "remaining_grams": remaining_grams,
                    "drop_grams": used_grams,
                    "tray_index": tray.tray_index,
                    "tray_uuid": tray.tray_uuid.as_deref(),
                    "match_status": tray.match_status.as_deref(),
                    "matched_inventory_mode": tray.matched_inventory_mode.as_deref(),
                    "remaining_percent": tray.remaining_percent,
                    "tray_weight_g": tray.tray_weight_g,
                    "observed_at": tray.last_identity_seen_at,
                    "usage_session_key": context.session_key.as_str(),
                    "job_name": context.job_name.as_deref(),
                    "print_type": context.print_type.as_deref(),
                    "progress_percent": context.progress_percent,
                    "remaining_minutes": context.remaining_minutes,
                    "finished_success": context.finished_success,
                }),
                &dedupe_key,
                LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
            )?;
            return Ok(());
        }
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
    let usage_record = match (&decision, usage_context) {
        (LiveWeightDecision::AcceptDecrease { used_grams }, Some(context)) => {
            Some(db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id,
                session_key: &context.session_key,
                job_name: context.job_name.as_deref(),
                print_type: context.print_type.as_deref(),
                spool_id,
                used_grams: *used_grams,
                observed_at: context.observed_at.as_deref(),
                defer_initial_delta: context.defer_initial_weight_delta(),
            })?)
        }
        _ => None,
    };
    db.insert_spool_history_event(
        spool_id,
        "WEIGHT_UPDATED",
        &json!({
            "grams": remaining_grams,
            "previous_grams": current,
            "accepted_decision": live_weight_decision_name(&decision),
            "used_grams": live_weight_decision_used_grams(&decision),
            "usage_recorded_grams": usage_record.as_ref().map(|record| record.recorded_used_grams),
            "usage_deferred_initial_delta": usage_record
                .as_ref()
                .map(|record| record.deferred_initial_delta)
                .unwrap_or(false),
            "usage_session_id": usage_record.as_ref().map(|record| record.session_id.as_str()),
            "usage_session_key": usage_context.map(|context| context.session_key.as_str()),
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
            "previous_grams": current,
            "accepted_decision": live_weight_decision_name(&decision),
            "used_grams": live_weight_decision_used_grams(&decision),
            "usage_recorded_grams": usage_record.as_ref().map(|record| record.recorded_used_grams),
            "usage_deferred_initial_delta": usage_record
                .as_ref()
                .map(|record| record.deferred_initial_delta)
                .unwrap_or(false),
            "usage_session_id": usage_record.as_ref().map(|record| record.session_id.as_str()),
            "usage_session_key": usage_context.map(|context| context.session_key.as_str()),
            "job_name": usage_context.and_then(|context| context.job_name.as_deref()),
            "print_type": usage_context.and_then(|context| context.print_type.as_deref()),
            "progress_percent": usage_context.and_then(|context| context.progress_percent),
            "remaining_minutes": usage_context.and_then(|context| context.remaining_minutes),
            "finished_success": usage_context.and_then(|context| context.finished_success),
            "tray_index": tray.tray_index,
            "tray_uuid": tray.tray_uuid.as_deref(),
            "match_status": tray.match_status.as_deref(),
            "matched_inventory_mode": tray.matched_inventory_mode.as_deref(),
            "remaining_percent": tray.remaining_percent,
            "tray_weight_g": tray.tray_weight_g,
            "observed_at": tray.last_identity_seen_at,
        }),
    )?;
    Ok(())
}

fn should_ignore_near_finish_small_decrease(
    db: &FilamentDatabase,
    printer_id: &str,
    spool_id: &str,
    used_grams: i64,
    context: &LivePrintUsageContext,
) -> Result<bool, InventoryError> {
    if used_grams <= 0 || used_grams > LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G {
        return Ok(false);
    }
    if context
        .progress_percent
        .is_none_or(|progress| progress < LIVE_WEIGHT_NEAR_FINISH_PROGRESS_PERCENT)
    {
        return Ok(false);
    }
    if !context.remaining_minutes.is_some_and(|minutes| {
        (0..=LIVE_WEIGHT_NEAR_FINISH_MAX_REMAINING_MINUTES).contains(&minutes)
    }) {
        return Ok(false);
    }

    let recorded_used_g = db
        .live_usage_session_spool_used_g(printer_id, &context.session_key, spool_id)?
        .unwrap_or(0);
    Ok(recorded_used_g >= LIVE_WEIGHT_NEAR_FINISH_MIN_RECORDED_USAGE_G)
}

fn should_rebase_live_weight_before_usage(
    db: &FilamentDatabase,
    printer_id: &str,
    spool_id: &str,
    current_grams: i64,
    remaining_grams: i64,
    usage_context: Option<&LivePrintUsageContext>,
) -> Result<bool, InventoryError> {
    let Some(context) = usage_context else {
        return Ok(false);
    };
    if context.session_key != LIVE_USAGE_PROVISIONAL_SESSION_KEY
        || context.finished_success.is_some()
        || remaining_grams <= current_grams
    {
        return Ok(false);
    }
    let increase_grams = remaining_grams - current_grams;
    if increase_grams > max_sane_live_weight_drop(current_grams) {
        return Ok(false);
    }

    Ok(!db.live_usage_session_has_spool_usage(printer_id, &context.session_key, spool_id)?)
}

struct LiveWeightRebaseInput<'a> {
    printer_id: &'a str,
    spool_id: &'a str,
    previous_grams: i64,
    remaining_grams: i64,
    increase_grams: i64,
    tray: &'a BambuLiveObservedTrayRow,
    usage_context: Option<&'a LivePrintUsageContext>,
}

fn rebase_live_weight_before_usage(
    db: &FilamentDatabase,
    input: LiveWeightRebaseInput<'_>,
) -> Result<(), InventoryError> {
    let next_status = if input.remaining_grams == 0 {
        "EMPTY"
    } else {
        "ASSIGNED"
    };
    db.update_spool_weight(
        input.spool_id,
        Some(input.remaining_grams),
        Some(input.remaining_grams),
    )?;
    db.update_spool_status(input.spool_id, next_status)?;
    db.ensure_scale("bambu-ams", "Bambu AMS", "VIRTUAL")?;
    db.insert_weight_reading(
        "bambu-ams",
        input.spool_id,
        input.remaining_grams,
        "BAMBU_AMS",
    )?;

    db.insert_spool_history_event(
        input.spool_id,
        "WEIGHT_CORRECTED",
        &json!({
            "grams": input.remaining_grams,
            "previous_grams": input.previous_grams,
            "correction_grams": input.increase_grams,
            "accepted_decision": "pre_usage_rebase",
            "reason": "pre_usage_ams_rebase",
            "usage_session_key": input.usage_context.map(|context| context.session_key.as_str()),
            "remaining_percent": input.tray.remaining_percent,
            "tray_weight_g": input.tray.tray_weight_g,
            "source": "BAMBU_AMS",
            "printer_id": input.printer_id,
            "observed_at": input.tray.last_identity_seen_at,
        })
        .to_string(),
    )?;
    db.insert_printer_live_event(
        input.printer_id,
        "LIVE_AUTO_WEIGHT_REBASED",
        &json!({
            "spool_id": input.spool_id,
            "remaining_grams": input.remaining_grams,
            "previous_grams": input.previous_grams,
            "increase_grams": input.increase_grams,
            "accepted_decision": "pre_usage_rebase",
            "reason": "pre_usage_ams_rebase",
            "usage_session_key": input.usage_context.map(|context| context.session_key.as_str()),
            "job_name": input.usage_context.and_then(|context| context.job_name.as_deref()),
            "print_type": input.usage_context.and_then(|context| context.print_type.as_deref()),
            "progress_percent": input.usage_context.and_then(|context| context.progress_percent),
            "remaining_minutes": input.usage_context.and_then(|context| context.remaining_minutes),
            "finished_success": input.usage_context.and_then(|context| context.finished_success),
            "tray_index": input.tray.tray_index,
            "tray_uuid": input.tray.tray_uuid.as_deref(),
            "match_status": input.tray.match_status.as_deref(),
            "matched_inventory_mode": input.tray.matched_inventory_mode.as_deref(),
            "remaining_percent": input.tray.remaining_percent,
            "tray_weight_g": input.tray.tray_weight_g,
            "observed_at": input.tray.last_identity_seen_at,
        }),
    )?;
    Ok(())
}

pub(crate) fn classify_live_weight_update(
    current_grams: Option<i64>,
    next_grams: i64,
) -> LiveWeightDecision {
    let Some(current_grams) = current_grams else {
        return LiveWeightDecision::AcceptBaseline;
    };
    if current_grams == next_grams {
        return LiveWeightDecision::IgnoreUnchanged;
    }
    if next_grams > current_grams {
        return LiveWeightDecision::IgnoreIncrease {
            increase_grams: next_grams - current_grams,
        };
    }

    let drop_grams = current_grams - next_grams;
    let max_sane_drop_grams = max_sane_live_weight_drop(current_grams);
    if drop_grams > max_sane_drop_grams {
        return LiveWeightDecision::RejectDropOutlier {
            drop_grams,
            max_sane_drop_grams,
        };
    }

    LiveWeightDecision::AcceptDecrease {
        used_grams: drop_grams,
    }
}

fn max_sane_live_weight_drop(current_grams: i64) -> i64 {
    LIVE_WEIGHT_MIN_SANE_DROP_G.max(current_grams / LIVE_WEIGHT_MAX_SANE_DROP_RATIO_DIVISOR)
}

fn live_weight_decision_name(decision: &LiveWeightDecision) -> &'static str {
    match decision {
        LiveWeightDecision::AcceptBaseline => "baseline",
        LiveWeightDecision::AcceptDecrease { .. } => "decrease",
        LiveWeightDecision::IgnoreUnchanged => "unchanged",
        LiveWeightDecision::IgnoreIncrease { .. } => "increase",
        LiveWeightDecision::RejectDropOutlier { .. } => "drop_outlier",
    }
}

fn live_weight_decision_used_grams(decision: &LiveWeightDecision) -> Option<i64> {
    match decision {
        LiveWeightDecision::AcceptDecrease { used_grams } => Some(*used_grams),
        _ => None,
    }
}

fn live_weight_ignored_dedupe_key(
    spool_id: &str,
    usage_session_key: Option<&str>,
    tray_index: i64,
    current_grams: Option<i64>,
    remaining_grams: i64,
    increase_grams: i64,
) -> String {
    format!(
        "ams-weight-increase|spool={}|session={}|tray={}|current={}|remaining={remaining_grams}|increase={increase_grams}",
        spool_id.trim(),
        usage_session_key.unwrap_or("none").trim(),
        tray_index,
        current_grams
            .map(|value| value.to_string())
            .unwrap_or_else(|| "none".to_string()),
    )
}

fn live_weight_near_finish_drop_dedupe_key(
    spool_id: &str,
    usage_session_key: &str,
    tray_index: i64,
    current_grams: Option<i64>,
    remaining_grams: i64,
    drop_grams: i64,
) -> String {
    format!(
        "ams-weight-near-finish-drop|spool={}|session={}|tray={}|current={}|remaining={remaining_grams}|drop={drop_grams}",
        spool_id.trim(),
        usage_session_key.trim(),
        tray_index,
        current_grams
            .map(|value| value.to_string())
            .unwrap_or_else(|| "none".to_string()),
    )
}

#[derive(Clone, Debug)]
struct LivePrintUsageContext {
    session_key: String,
    job_name: Option<String>,
    print_type: Option<String>,
    progress_percent: Option<i64>,
    remaining_minutes: Option<i64>,
    observed_at: Option<String>,
    finished_success: Option<bool>,
}

impl LivePrintUsageContext {
    fn defer_initial_weight_delta(&self) -> bool {
        self.finished_success.is_none()
            && self
                .progress_percent
                .is_some_and(|progress| progress <= LIVE_USAGE_WARMUP_PROGRESS_PERCENT)
    }
}

fn live_print_usage_context(observed: &BambuLiveObservedStateRow) -> Option<LivePrintUsageContext> {
    let subtask_id = live_identity_text(observed.subtask_id.as_deref());
    let print_state = normalized_print_state(observed.gcode_state.as_deref());
    let failed = matches!(
        print_state.as_deref(),
        Some("FAILED" | "STOP" | "STOPPED" | "CANCELLED")
    );
    let credible_finished = matches!(print_state.as_deref(), Some("FINISH" | "FINISHED"))
        && is_credible_finished_print_state(observed);
    let finished_success = if credible_finished {
        Some(true)
    } else if failed {
        Some(false)
    } else if is_probable_completed_carried_print_state(observed) {
        Some(true)
    } else {
        None
    };
    let running = matches!(
        print_state.as_deref(),
        Some("RUNNING" | "PAUSE" | "PAUSED" | "PREPARE" | "PREPARING" | "SLICING")
    ) || (finished_success.is_none()
        && !failed
        && (observed.progress_percent.is_some() || observed.remaining_minutes.is_some()));
    if !running && finished_success.is_none() {
        return None;
    }

    let session_key = subtask_id
        .map(|subtask_id| format!("subtask:{subtask_id}"))
        .or_else(|| {
            has_anonymous_live_print_signal(observed)
                .then(|| LIVE_USAGE_PROVISIONAL_SESSION_KEY.to_string())
        })?;

    Some(LivePrintUsageContext {
        session_key,
        job_name: observed.subtask_name.clone(),
        print_type: observed.print_type.clone(),
        progress_percent: observed.progress_percent,
        remaining_minutes: observed.remaining_minutes,
        observed_at: observed.last_seen_at.clone(),
        finished_success,
    })
}

fn has_anonymous_live_print_signal(observed: &BambuLiveObservedStateRow) -> bool {
    observed.gcode_state.as_deref().is_some_and(|state| {
        let state = state.trim();
        !state.is_empty()
    }) || observed.progress_percent.is_some()
        || observed.remaining_minutes.is_some()
        || observed.prepare_percent.is_some()
        || observed.print_stage.is_some()
        || observed.active_tray_index.is_some()
}

pub(crate) fn is_probable_completed_carried_print_state(
    observed: &BambuLiveObservedStateRow,
) -> bool {
    has_carried_completion_progress(observed)
        && observed
            .raw_payload_json
            .as_ref()
            .is_some_and(raw_payload_has_no_current_job_fields)
}

pub(crate) fn is_credible_finished_print_state(observed: &BambuLiveObservedStateRow) -> bool {
    observed
        .progress_percent
        .is_none_or(|progress| progress >= LIVE_USAGE_AUTO_COMPLETE_PROGRESS_PERCENT)
        && observed.remaining_minutes.is_none_or(|minutes| {
            (0..=LIVE_USAGE_AUTO_COMPLETE_MAX_REMAINING_MINUTES).contains(&minutes)
        })
}

fn has_carried_completion_progress(observed: &BambuLiveObservedStateRow) -> bool {
    is_credible_finished_print_state(observed)
        || (observed
            .progress_percent
            .is_some_and(|progress| progress >= LIVE_USAGE_CARRIED_COMPLETE_PROGRESS_PERCENT)
            && observed.remaining_minutes.is_some_and(|minutes| {
                (0..=LIVE_USAGE_CARRIED_COMPLETE_MAX_REMAINING_MINUTES).contains(&minutes)
            }))
        || (observed.progress_percent.is_some_and(|progress| {
            progress >= LIVE_USAGE_CARRIED_LOST_JOB_COMPLETE_PROGRESS_PERCENT
        }) && observed.remaining_minutes.is_some_and(|minutes| {
            (0..=LIVE_USAGE_CARRIED_LOST_JOB_COMPLETE_MAX_REMAINING_MINUTES).contains(&minutes)
        }))
}

fn raw_payload_has_no_current_job_fields(payload: &Value) -> bool {
    let Some(job) = payload.get("_bfm_job").and_then(Value::as_object) else {
        return false;
    };
    [
        "active_tray_index",
        "gcode_state",
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
    .all(|field| value_is_empty(job.get(field)))
}

fn value_is_empty(value: Option<&Value>) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(Value::String(value)) => value.trim().is_empty(),
        _ => false,
    }
}

fn normalized_print_state(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
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
