use crate::backend::database_printer_usage_sessions::{
    LiveUsageDeltaInput, LiveUsageDeltaResult, LiveUsageObservedWeightCorrectionInput,
    LiveUsageRecentCompletedDeltaInput, LiveUsageRecentCompletedSessionInput,
    LiveUsageSessionInput, LIVE_USAGE_PROVISIONAL_SESSION_KEY,
};
use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveObservedStateRow, BambuLiveObservedTrayRow, FilamentDatabase, PrinterOverviewRow,
};
use crate::backend::printer_slot_live_mapping::bambu_live_slot_matches_tray;
use crate::bambu_live_matching::{
    live_color_matches_swatch, live_identity_text, live_tray_identity_text,
};
use crate::bambu_live_observation::{
    is_credible_finished_print_state, is_probable_completed_carried_print_state,
    observed_field_is_fresh, observed_recorded_field_is_recent, parse_flexible_timestamp,
    tray_exist_bits_slot_present,
};
use crate::bambu_thermal::{
    is_below_extrusion_temp, is_print_capable_temp, nozzle_thermal_state_name,
};
use serde_json::json;
use time::{Duration as TimeDuration, OffsetDateTime};

const LIVE_WEIGHT_MIN_SANE_DROP_G: i64 = 80;
const LIVE_WEIGHT_MAX_SANE_DROP_RATIO_DIVISOR: i64 = 10;
const LIVE_WEIGHT_MAX_CONTEXTUAL_JOB_DROP_G: i64 = 200;
const LIVE_USAGE_WARMUP_PROGRESS_PERCENT: i64 = 10;
const LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS: i64 = 15 * 60;
const LIVE_WEIGHT_MIN_USAGE_CORRECTION_G: i64 = 20;
const LIVE_WEIGHT_NEAR_FINISH_PROGRESS_PERCENT: i64 = 90;
const LIVE_WEIGHT_NEAR_FINISH_MAX_REMAINING_MINUTES: i64 = 10;
const LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G: i64 = 10;
const LIVE_WEIGHT_NEAR_FINISH_MIN_RECORDED_USAGE_G: i64 = 50;
const LIVE_WEIGHT_RECENT_COMPLETED_TAIL_SYNC_SECS: i64 = 10 * 60;
const LIVE_USAGE_RECENT_PRINT_CAPABLE_NOZZLE_SECS: i64 = 2 * 60 * 60;

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

pub(crate) fn sync_observed_usage(
    db: &FilamentDatabase,
    overview: &PrinterOverviewRow,
    observed: &BambuLiveObservedStateRow,
) -> Result<(), InventoryError> {
    let usage_context = live_print_usage_context(observed);
    let recent_completed_context = match usage_context.as_ref() {
        Some(context) if context.should_use_recent_completed_session() => {
            live_usage_session_recently_completed_successfully(db, &overview.printer.id, context)?
        }
        _ => false,
    };
    let stale_recent_completed_context = usage_context.as_ref().is_some_and(|context| {
        context.finished_success.is_none()
            && context.is_near_finish_tail_signal()
            && recent_completed_context
    });
    if let Some(context) = usage_context.as_ref()
        && context.should_track_running_usage_session()
        && !stale_recent_completed_context
    {
        db.touch_live_usage_session(LiveUsageSessionInput {
            printer_id: &overview.printer.id,
            session_key: &context.session_key,
            job_name: context.job_name.as_deref(),
            print_type: context.print_type.as_deref(),
            observed_at: context.observed_at.as_deref(),
        })?;
    }
    let slot_usage_context = match usage_context.as_ref() {
        Some(context) if context.finished_success.is_some() => {
            let active =
                db.live_usage_session_is_active(&overview.printer.id, &context.session_key)?;
            (active || recent_completed_context).then_some(context)
        }
        Some(context) if stale_recent_completed_context => Some(context),
        other => other,
    };
    auto_sync_live_slots(db, overview, observed, slot_usage_context)?;
    if let Some(context) = usage_context.as_ref()
        && let Some(success) = context.finished_success
    {
        db.finish_live_usage_session(
            &overview.printer.id,
            &context.session_key,
            context.observed_at.as_deref(),
            success,
        )?;
    }
    Ok(())
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
        let slot = overview.slots.iter().find(|slot| {
            bambu_live_slot_matches_tray(
                &slot.ams_id,
                slot.slot_index,
                tray.ams_index,
                tray.tray_index,
            )
        });

        let slot_present_from_exist_bits = tray_auto_clear_presence_from_state(observed, tray);
        let auto_clear_empty_signal =
            should_auto_clear_live_slot(tray, slot_present_from_exist_bits);
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
            if let Some(slot) = slot
                && slot.spool_id.is_some()
            {
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
                        "tray_exist_bits": observed.ams_exist_bits.as_deref(),
                        "slot_present_from_exist_bits": slot_present_from_exist_bits,
                    }),
                )?;
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

fn tray_auto_clear_presence_from_state(
    observed: &BambuLiveObservedStateRow,
    tray: &BambuLiveObservedTrayRow,
) -> Option<bool> {
    if tray.ams_index.is_some() {
        return None;
    }
    tray_exist_bits_slot_present(observed.ams_exist_bits.as_deref(), tray.tray_index)
}

pub(crate) fn should_auto_clear_live_slot(
    tray: &BambuLiveObservedTrayRow,
    slot_present_from_exist_bits: Option<bool>,
) -> bool {
    if slot_present_from_exist_bits == Some(true) {
        return false;
    }
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
    let Some(observed_tray_uuid) = live_tray_identity_text(tray) else {
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
    if live_tray_identity_text(tray).is_some() {
        return false;
    }
    let Some(observed_color_hex) = live_identity_text(tray.color_hex.as_deref()) else {
        return false;
    };
    let Some(previous_color_hex) = live_identity_text(previous_live_color_hex) else {
        return false;
    };
    !previous_color_hex.eq_ignore_ascii_case(observed_color_hex)
        && !live_color_matches_swatch(Some(observed_color_hex), slot.spool_hex_color.as_deref())
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
        && (override_color_hex.eq_ignore_ascii_case(observed_color_hex)
            || live_color_matches_swatch(Some(observed_color_hex), slot.spool_hex_color.as_deref()))
}

fn live_tray_has_physical_roll_signal(tray: &BambuLiveObservedTrayRow) -> bool {
    tray.loaded
        || live_identity_text(tray.observed_rfid_tag.as_deref()).is_some()
        || live_identity_text(tray.tray_uuid.as_deref()).is_some()
        || live_identity_text(tray.chip_id.as_deref()).is_some()
}

fn live_weight_spool_status(remaining_grams: i64, tray: &BambuLiveObservedTrayRow) -> &'static str {
    if remaining_grams == 0 && !live_tray_has_physical_roll_signal(tray) {
        "EMPTY"
    } else {
        "ASSIGNED"
    }
}

fn should_rebase_live_weight_from_loaded_zero(
    current_grams: i64,
    remaining_grams: i64,
    tray: &BambuLiveObservedTrayRow,
) -> bool {
    current_grams == 0 && remaining_grams > 0 && live_tray_has_physical_roll_signal(tray)
}

fn sync_live_weight(
    db: &FilamentDatabase,
    printer_id: &str,
    spool_id: &str,
    remaining_grams: i64,
    tray: &BambuLiveObservedTrayRow,
    usage_context: Option<&LivePrintUsageContext>,
) -> Result<(), InventoryError> {
    // Keep the read/classify/write sequence indivisible from an explicit AMS
    // acceptance so a poll classified from the old weight cannot overwrite it.
    db.with_write_transaction(|db| {
        sync_live_weight_in_transaction(
            db,
            printer_id,
            spool_id,
            remaining_grams,
            tray,
            usage_context,
        )
    })
}

fn sync_live_weight_in_transaction(
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
    let decision = contextualize_live_weight_decision(
        classify_live_weight_update(current, remaining_grams),
        usage_context,
    );
    match decision {
        LiveWeightDecision::IgnoreUnchanged => return Ok(()),
        LiveWeightDecision::IgnoreIncrease { increase_grams } => {
            if let Some(current_grams) = current {
                if should_rebase_live_weight_from_loaded_zero(current_grams, remaining_grams, tray)
                {
                    rebase_live_weight_from_observed_increase(
                        db,
                        LiveWeightRebaseInput {
                            printer_id,
                            spool_id,
                            previous_grams: current_grams,
                            remaining_grams,
                            increase_grams,
                            accepted_decision: "loaded_zero_rebase",
                            reason: "live_loaded_zero_rebound",
                            tray,
                            usage_context,
                        },
                    )?;
                    return Ok(());
                }
                if should_rebase_live_weight_before_usage(
                    db,
                    printer_id,
                    spool_id,
                    current_grams,
                    remaining_grams,
                    usage_context,
                )? {
                    rebase_live_weight_from_observed_increase(
                        db,
                        LiveWeightRebaseInput {
                            printer_id,
                            spool_id,
                            previous_grams: current_grams,
                            remaining_grams,
                            increase_grams,
                            accepted_decision: "pre_usage_rebase",
                            reason: "pre_usage_ams_rebase",
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
                    "nozzle_temp_c": usage_context.and_then(|context| context.nozzle_temp_c),
                    "nozzle_temp_fresh": usage_context.map(|context| context.nozzle_temp_fresh),
                    "recent_print_capable_nozzle": usage_context.map(|context| context.recent_print_capable_nozzle),
                    "progress_percent_fresh": usage_context.map(|context| context.progress_percent_fresh),
                    "remaining_minutes_fresh": usage_context.map(|context| context.remaining_minutes_fresh),
                    "thermal_state": usage_context.and_then(|context| context.thermal_state_name()),
                }),
                &dedupe_key,
                LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
            )?;
            if let Some(context) = usage_context
                && let Some(correction) = db.correct_live_usage_for_observed_weight_increase(
                    LiveUsageObservedWeightCorrectionInput {
                        printer_id,
                        session_key: &context.session_key,
                        spool_id,
                        observed_grams: remaining_grams,
                        observed_at: context.observed_at.as_deref(),
                        min_correction_grams: LIVE_WEIGHT_MIN_USAGE_CORRECTION_G,
                    },
                )?
            {
                let next_status = live_weight_spool_status(remaining_grams, tray);
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
                        "nozzle_temp_c": context.nozzle_temp_c,
                        "nozzle_temp_fresh": context.nozzle_temp_fresh,
                        "recent_print_capable_nozzle": context.recent_print_capable_nozzle,
                        "progress_percent_fresh": context.progress_percent_fresh,
                        "remaining_minutes_fresh": context.remaining_minutes_fresh,
                        "thermal_state": context.thermal_state_name(),
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
                    "nozzle_temp_c": usage_context.and_then(|context| context.nozzle_temp_c),
                    "nozzle_temp_fresh": usage_context.map(|context| context.nozzle_temp_fresh),
                    "recent_print_capable_nozzle": usage_context.map(|context| context.recent_print_capable_nozzle),
                    "progress_percent_fresh": usage_context.map(|context| context.progress_percent_fresh),
                    "remaining_minutes_fresh": usage_context.map(|context| context.remaining_minutes_fresh),
                    "thermal_state": usage_context.and_then(|context| context.thermal_state_name()),
                }),
            )?;
            return Ok(());
        }
        LiveWeightDecision::AcceptBaseline | LiveWeightDecision::AcceptDecrease { .. } => {}
    }

    if let (LiveWeightDecision::AcceptDecrease { used_grams }, Some(context)) =
        (&decision, usage_context)
        && should_ignore_near_finish_small_decrease(db, printer_id, spool_id, *used_grams, context)?
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
                "nozzle_temp_c": context.nozzle_temp_c,
                "nozzle_temp_fresh": context.nozzle_temp_fresh,
                "recent_print_capable_nozzle": context.recent_print_capable_nozzle,
                "progress_percent_fresh": context.progress_percent_fresh,
                "remaining_minutes_fresh": context.remaining_minutes_fresh,
                "thermal_state": context.thermal_state_name(),
            }),
            &dedupe_key,
            LIVE_WEIGHT_IGNORED_DEDUPE_WINDOW_SECS,
        )?;
        return Ok(());
    }

    let next_status = live_weight_spool_status(remaining_grams, tray);
    db.update_spool_weight(spool_id, Some(remaining_grams), Some(remaining_grams))?;
    db.update_spool_status(spool_id, next_status)?;
    db.ensure_scale("bambu-ams", "Bambu AMS", "VIRTUAL")?;
    db.insert_weight_reading("bambu-ams", spool_id, remaining_grams, "BAMBU_AMS")?;
    let mut usage_attached_to_recent_completed_session = false;
    let mut usage_ignored_recent_completed_tail = false;
    let mut usage_ignored_cold_nozzle = false;
    let usage_record = match (&decision, usage_context) {
        (LiveWeightDecision::AcceptDecrease { used_grams }, Some(context))
            if context.nozzle_blocks_weight_delta(*used_grams) =>
        {
            usage_ignored_cold_nozzle = true;
            None
        }
        (LiveWeightDecision::AcceptDecrease { used_grams }, Some(context)) => {
            let active_session =
                db.live_usage_session_is_active(printer_id, &context.session_key)?;
            let use_recent_completed_session =
                context.should_use_recent_completed_session() && !active_session;
            if use_recent_completed_session {
                let record = if *used_grams <= LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G {
                    record_recent_completed_live_usage_delta(
                        db,
                        RecentCompletedUsageDeltaInput {
                            printer_id,
                            session_key: Some(&context.session_key),
                            spool_id,
                            used_grams: *used_grams,
                            observed_at: context.observed_at.as_deref(),
                        },
                    )?
                } else {
                    None
                };
                usage_attached_to_recent_completed_session = record.is_some();
                usage_ignored_recent_completed_tail = record.is_none();
                record
            } else {
                Some(db.record_live_usage_delta(LiveUsageDeltaInput {
                    printer_id,
                    session_key: &context.session_key,
                    job_name: context.job_name.as_deref(),
                    print_type: context.print_type.as_deref(),
                    spool_id,
                    used_grams: *used_grams,
                    observed_at: context.observed_at.as_deref(),
                    defer_initial_delta: context.defer_initial_weight_delta(*used_grams),
                })?)
            }
        }
        (LiveWeightDecision::AcceptDecrease { used_grams }, None) => {
            let record = if *used_grams <= LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G {
                record_recent_completed_live_usage_delta(
                    db,
                    RecentCompletedUsageDeltaInput {
                        printer_id,
                        session_key: None,
                        spool_id,
                        used_grams: *used_grams,
                        observed_at: tray.last_identity_seen_at.as_deref(),
                    },
                )?
            } else {
                None
            };
            usage_attached_to_recent_completed_session = record.is_some();
            usage_ignored_recent_completed_tail = record.is_none();
            record
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
            "usage_attached_to_recent_completed_session": usage_attached_to_recent_completed_session,
            "usage_ignored_recent_completed_tail": usage_ignored_recent_completed_tail,
            "usage_ignored_cold_nozzle": usage_ignored_cold_nozzle,
            "usage_session_id": usage_record.as_ref().map(|record| record.session_id.as_str()),
            "usage_session_key": usage_context.map(|context| context.session_key.as_str()),
            "nozzle_temp_c": usage_context.and_then(|context| context.nozzle_temp_c),
            "nozzle_temp_fresh": usage_context.map(|context| context.nozzle_temp_fresh),
            "recent_print_capable_nozzle": usage_context.map(|context| context.recent_print_capable_nozzle),
            "progress_percent_fresh": usage_context.map(|context| context.progress_percent_fresh),
            "remaining_minutes_fresh": usage_context.map(|context| context.remaining_minutes_fresh),
            "thermal_state": usage_context.and_then(|context| context.thermal_state_name()),
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
            "usage_attached_to_recent_completed_session": usage_attached_to_recent_completed_session,
            "usage_ignored_recent_completed_tail": usage_ignored_recent_completed_tail,
            "usage_ignored_cold_nozzle": usage_ignored_cold_nozzle,
            "usage_session_id": usage_record.as_ref().map(|record| record.session_id.as_str()),
            "usage_session_key": usage_context.map(|context| context.session_key.as_str()),
            "job_name": usage_context.and_then(|context| context.job_name.as_deref()),
            "print_type": usage_context.and_then(|context| context.print_type.as_deref()),
            "progress_percent": usage_context.and_then(|context| context.progress_percent),
            "remaining_minutes": usage_context.and_then(|context| context.remaining_minutes),
            "finished_success": usage_context.and_then(|context| context.finished_success),
            "nozzle_temp_c": usage_context.and_then(|context| context.nozzle_temp_c),
            "nozzle_temp_fresh": usage_context.map(|context| context.nozzle_temp_fresh),
            "recent_print_capable_nozzle": usage_context.map(|context| context.recent_print_capable_nozzle),
            "progress_percent_fresh": usage_context.map(|context| context.progress_percent_fresh),
            "remaining_minutes_fresh": usage_context.map(|context| context.remaining_minutes_fresh),
            "thermal_state": usage_context.and_then(|context| context.thermal_state_name()),
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
    if !context.progress_percent_fresh || !context.remaining_minutes_fresh {
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

struct RecentCompletedUsageDeltaInput<'a> {
    printer_id: &'a str,
    session_key: Option<&'a str>,
    spool_id: &'a str,
    used_grams: i64,
    observed_at: Option<&'a str>,
}

fn record_recent_completed_live_usage_delta(
    db: &FilamentDatabase,
    input: RecentCompletedUsageDeltaInput<'_>,
) -> Result<Option<LiveUsageDeltaResult>, InventoryError> {
    db.record_recent_completed_live_usage_delta(LiveUsageRecentCompletedDeltaInput {
        printer_id: input.printer_id,
        session_key: input.session_key,
        spool_id: input.spool_id,
        used_grams: input.used_grams,
        observed_at: input.observed_at,
        max_age_seconds: LIVE_WEIGHT_RECENT_COMPLETED_TAIL_SYNC_SECS,
    })
}

fn live_usage_session_recently_completed_successfully(
    db: &FilamentDatabase,
    printer_id: &str,
    context: &LivePrintUsageContext,
) -> Result<bool, InventoryError> {
    db.live_usage_session_recently_completed_successfully(LiveUsageRecentCompletedSessionInput {
        printer_id,
        session_key: &context.session_key,
        observed_at: context.observed_at.as_deref(),
        max_age_seconds: LIVE_WEIGHT_RECENT_COMPLETED_TAIL_SYNC_SECS,
    })
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
    accepted_decision: &'a str,
    reason: &'a str,
    tray: &'a BambuLiveObservedTrayRow,
    usage_context: Option<&'a LivePrintUsageContext>,
}

fn rebase_live_weight_from_observed_increase(
    db: &FilamentDatabase,
    input: LiveWeightRebaseInput<'_>,
) -> Result<(), InventoryError> {
    let next_status = live_weight_spool_status(input.remaining_grams, input.tray);
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
            "accepted_decision": input.accepted_decision,
            "reason": input.reason,
            "usage_session_key": input.usage_context.map(|context| context.session_key.as_str()),
            "nozzle_temp_c": input.usage_context.and_then(|context| context.nozzle_temp_c),
            "nozzle_temp_fresh": input.usage_context.map(|context| context.nozzle_temp_fresh),
            "recent_print_capable_nozzle": input.usage_context.map(|context| context.recent_print_capable_nozzle),
            "progress_percent_fresh": input.usage_context.map(|context| context.progress_percent_fresh),
            "remaining_minutes_fresh": input.usage_context.map(|context| context.remaining_minutes_fresh),
            "thermal_state": input.usage_context.and_then(|context| context.thermal_state_name()),
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
            "accepted_decision": input.accepted_decision,
            "reason": input.reason,
            "usage_session_key": input.usage_context.map(|context| context.session_key.as_str()),
            "job_name": input.usage_context.and_then(|context| context.job_name.as_deref()),
            "print_type": input.usage_context.and_then(|context| context.print_type.as_deref()),
            "progress_percent": input.usage_context.and_then(|context| context.progress_percent),
            "remaining_minutes": input.usage_context.and_then(|context| context.remaining_minutes),
            "finished_success": input.usage_context.and_then(|context| context.finished_success),
            "nozzle_temp_c": input.usage_context.and_then(|context| context.nozzle_temp_c),
            "nozzle_temp_fresh": input.usage_context.map(|context| context.nozzle_temp_fresh),
            "recent_print_capable_nozzle": input.usage_context.map(|context| context.recent_print_capable_nozzle),
            "progress_percent_fresh": input.usage_context.map(|context| context.progress_percent_fresh),
            "remaining_minutes_fresh": input.usage_context.map(|context| context.remaining_minutes_fresh),
            "thermal_state": input.usage_context.and_then(|context| context.thermal_state_name()),
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

fn contextualize_live_weight_decision(
    decision: LiveWeightDecision,
    usage_context: Option<&LivePrintUsageContext>,
) -> LiveWeightDecision {
    let LiveWeightDecision::RejectDropOutlier { drop_grams, .. } = decision else {
        return decision;
    };
    if usage_context.is_some_and(|context| {
        context.can_accept_contextual_job_drop()
            && drop_grams <= LIVE_WEIGHT_MAX_CONTEXTUAL_JOB_DROP_G
    }) {
        return LiveWeightDecision::AcceptDecrease {
            used_grams: drop_grams,
        };
    }
    decision
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
    nozzle_temp_c: Option<f64>,
    nozzle_temp_fresh: bool,
    recent_print_capable_nozzle: bool,
    progress_percent_fresh: bool,
    remaining_minutes_fresh: bool,
}

impl LivePrintUsageContext {
    fn nozzle_blocks_filament_usage(&self) -> bool {
        self.finished_success != Some(true)
            && self.nozzle_temp_fresh
            && self.nozzle_temp_c.is_some_and(is_below_extrusion_temp)
    }

    fn should_track_running_usage_session(&self) -> bool {
        self.finished_success.is_none() && !self.nozzle_blocks_filament_usage()
    }

    fn nozzle_blocks_weight_delta(&self, used_grams: i64) -> bool {
        self.nozzle_blocks_filament_usage()
            && !(self.recent_print_capable_nozzle && used_grams <= LIVE_WEIGHT_MIN_SANE_DROP_G)
    }

    fn can_accept_contextual_job_drop(&self) -> bool {
        self.finished_success.is_none()
            && self.session_key != LIVE_USAGE_PROVISIONAL_SESSION_KEY
            && !self.nozzle_blocks_filament_usage()
    }

    fn thermal_state_name(&self) -> Option<&'static str> {
        if self.nozzle_temp_c.is_some() && !self.nozzle_temp_fresh {
            return Some("stale");
        }
        nozzle_thermal_state_name(self.nozzle_temp_c)
    }

    fn defer_initial_weight_delta(&self, used_grams: i64) -> bool {
        self.finished_success.is_none()
            && used_grams > LIVE_WEIGHT_NEAR_FINISH_SMALL_DROP_G
            && self.progress_percent_fresh
            && self
                .progress_percent
                .is_some_and(|progress| progress <= LIVE_USAGE_WARMUP_PROGRESS_PERCENT)
    }

    fn is_near_finish_tail_signal(&self) -> bool {
        if !self.progress_percent_fresh || !self.remaining_minutes_fresh {
            return false;
        }
        self.progress_percent
            .is_some_and(|progress| progress >= LIVE_WEIGHT_NEAR_FINISH_PROGRESS_PERCENT)
            && self.remaining_minutes.is_some_and(|minutes| {
                (0..=LIVE_WEIGHT_NEAR_FINISH_MAX_REMAINING_MINUTES).contains(&minutes)
            })
    }

    fn should_use_recent_completed_session(&self) -> bool {
        self.finished_success == Some(true) || self.is_near_finish_tail_signal()
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
        nozzle_temp_c: observed.nozzle_temp_c,
        nozzle_temp_fresh: observed.nozzle_temp_c.is_some()
            && observed_field_is_fresh(observed, "nozzle_temper_at"),
        recent_print_capable_nozzle: observed.nozzle_temp_c.is_some_and(is_print_capable_temp)
            || observed_recorded_field_is_recent(
                observed,
                "nozzle_print_capable_at",
                LIVE_USAGE_RECENT_PRINT_CAPABLE_NOZZLE_SECS,
            ),
        progress_percent_fresh: observed.progress_percent.is_some()
            && observed_field_is_fresh(observed, "progress_percent_at"),
        remaining_minutes_fresh: observed.remaining_minutes.is_some()
            && observed_field_is_fresh(observed, "remaining_minutes_at"),
    })
}

fn has_anonymous_live_print_signal(observed: &BambuLiveObservedStateRow) -> bool {
    observed.gcode_state.as_deref().is_some_and(|state| {
        let state = state.trim();
        !state.is_empty() && observed_job_signal_is_current_or_legacy(observed, "gcode_state_at")
    }) || (observed.progress_percent.is_some()
        && observed_job_signal_is_current_or_legacy(observed, "progress_percent_at"))
        || (observed.remaining_minutes.is_some()
            && observed_job_signal_is_current_or_legacy(observed, "remaining_minutes_at"))
        || (observed.prepare_percent.is_some()
            && observed_job_signal_is_current_or_legacy(observed, "prepare_percent_at"))
        || (observed.print_stage.is_some()
            && observed_job_signal_is_current_or_legacy(observed, "print_stage_at"))
        || (observed.active_tray_index.is_some()
            && observed_job_signal_is_current_or_legacy(observed, "active_tray_index_at"))
}

fn observed_job_signal_is_current_or_legacy(
    observed: &BambuLiveObservedStateRow,
    field_key: &str,
) -> bool {
    observed.raw_payload_json.is_none() || observed_field_is_fresh(observed, field_key)
}

fn normalized_print_state(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_uppercase())
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
