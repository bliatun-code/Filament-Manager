use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveObservedTrayRow, FilamentDatabase, PrinterOverviewRow, SpoolWithMasterRow,
};
use crate::backend::inventory_domain::SpoolStatus;
use crate::backend::printer_slot_live_mapping::bambu_live_slot_matches_tray;

pub(crate) fn match_observed_trays(
    db: &FilamentDatabase,
    overview: &PrinterOverviewRow,
    trays: &mut [BambuLiveObservedTrayRow],
) -> Result<(), InventoryError> {
    let mut all_spools = None;
    for tray in trays {
        reset_tray_inventory_match(tray);
        if let Some(observed_rfid) = live_tray_identity_text(tray) {
            let exact_matches = db.list_spools_with_master_by_rfid(observed_rfid)?;
            if apply_exact_rfid_match_status(tray, &exact_matches) {
                continue;
            }
        }
        if all_spools.is_none() {
            all_spools = Some(db.list_all_spools_with_master()?);
        }
        apply_tray_match_status_after_exact(
            tray,
            overview,
            all_spools.as_deref().unwrap_or_default(),
        );
    }
    Ok(())
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

#[cfg(test)]
pub(crate) fn apply_tray_match_status(
    tray: &mut BambuLiveObservedTrayRow,
    overview: &PrinterOverviewRow,
    all_spools: &[SpoolWithMasterRow],
) {
    reset_tray_inventory_match(tray);
    if apply_exact_rfid_match_status(tray, all_spools) {
        return;
    }
    apply_tray_match_status_after_exact(tray, overview, all_spools);
}

fn reset_tray_inventory_match(tray: &mut BambuLiveObservedTrayRow) {
    tray.matched_inventory_spool_id = None;
    tray.matched_inventory_mode = None;
}

fn apply_exact_rfid_match_status(
    tray: &mut BambuLiveObservedTrayRow,
    exact_match_candidates: &[SpoolWithMasterRow],
) -> bool {
    if let Some(observed_rfid) = live_tray_identity_text(tray) {
        let exact_matches: Vec<_> = exact_match_candidates
            .iter()
            .filter(|row| spool_available_for_exact_live_rfid_match(row))
            .filter(|row| eq_ignore_case(Some(observed_rfid), row.spool.rfid_tag.as_deref()))
            .collect();
        if exact_matches.len() == 1 {
            let spool = exact_matches[0];
            tray.matched_inventory_spool_id = Some(spool.spool.id.clone());
            tray.matched_inventory_mode = Some("exact_rfid".to_string());
            tray.match_status = Some("clear_match".to_string());
            tray.match_note = Some("Exact RFID/AMS identity match against inventory.".to_string());
            return true;
        }
        if exact_matches.len() > 1 {
            tray.match_status = Some("ambiguous".to_string());
            tray.match_note =
                Some("Multiple inventory rolls share this saved RFID/AMS identity.".to_string());
            return true;
        }
    }
    false
}

fn apply_tray_match_status_after_exact(
    tray: &mut BambuLiveObservedTrayRow,
    overview: &PrinterOverviewRow,
    all_spools: &[SpoolWithMasterRow],
) {
    let has_live_unknown_rfid = tray.loaded && live_tray_identity_text(tray).is_some();
    if !tray.loaded {
        tray.match_status = Some("unknown_from_printer".to_string());
        tray.match_note = Some(
            "Showing last known good RFID/AMS identity until a stronger update arrives."
                .to_string(),
        );
        return;
    }

    let matching_slots: Vec<_> = overview
        .slots
        .iter()
        .filter(|slot| {
            bambu_live_slot_matches_tray(
                &slot.ams_id,
                slot.slot_index,
                tray.ams_index,
                tray.tray_index,
            )
        })
        .collect();

    if matching_slots.len() > 1 {
        tray.match_status = Some("ambiguous".to_string());
        tray.match_note = Some("Multiple configured slots share this tray index.".to_string());
        return;
    }

    if let Some(slot) = matching_slots.first()
        && slot.spool_id.is_some()
    {
        let material_match = eq_ignore_case(
            tray.filament_type.as_deref(),
            slot.spool_material.as_deref(),
        );
        let name_match = live_name_matches(
            tray.filament_name.as_deref(),
            slot.spool_filament_name.as_deref(),
        );
        let color_match =
            live_color_matches_swatch(tray.color_hex.as_deref(), slot.spool_hex_color.as_deref());
        let score = [material_match, name_match, color_match]
            .into_iter()
            .filter(|value| *value)
            .count();
        if score >= 2 {
            tray.matched_inventory_spool_id = slot.spool_id.clone();
            tray.matched_inventory_mode = Some("configured_metadata".to_string());
            if has_live_unknown_rfid {
                tray.match_status = Some("unknown_rfid".to_string());
                tray.match_note = Some(match_note_with_preset_signal(
                    "AMS reported an RFID/AMS identity that is not registered in inventory."
                        .to_string(),
                    tray,
                ));
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
        let note = if has_live_unknown_rfid {
            "AMS reported an RFID/AMS identity that is not registered in inventory."
        } else {
            "Last known RFID/AMS identity does not map cleanly to the currently configured spool."
        };
        tray.match_note = Some(match_note_with_preset_signal(note.to_string(), tray));
        return;
    }

    let candidates = find_inventory_candidates(tray, all_spools, has_live_unknown_rfid);
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
    let note = if has_live_unknown_rfid {
        "AMS reported an RFID/AMS identity that is not registered in inventory.".to_string()
    } else {
        match candidates.len() {
            0 => "No clear stored spool matches this last known RFID/AMS identity.".to_string(),
            1 => "One likely stored spool matches this last known RFID/AMS identity.".to_string(),
            _ => "Multiple stored spools could match this live tray.".to_string(),
        }
    };
    tray.match_note = Some(match_note_with_preset_signal(note, tray));
}

fn match_note_with_preset_signal(mut note: String, tray: &BambuLiveObservedTrayRow) -> String {
    if let Some(preset_note) = live_preset_signal_note(tray) {
        note.push(' ');
        note.push_str(&preset_note);
    }
    note
}

fn live_preset_signal_note(tray: &BambuLiveObservedTrayRow) -> Option<String> {
    let tray_info_idx = live_identity_text(tray.tray_info_idx.as_deref())?;
    let preset_display = match live_identity_text(tray.tray_id_name.as_deref()) {
        Some(name) => format!("{tray_info_idx} ({name})"),
        None => tray_info_idx.to_string(),
    };
    Some(format!(
        "Filament settings preset {preset_display} was observed via tray_info_idx; this is a material/settings hint, not a roll identity."
    ))
}

fn find_inventory_candidates<'a>(
    tray: &BambuLiveObservedTrayRow,
    all_spools: &'a [SpoolWithMasterRow],
    require_missing_rfid_tag: bool,
) -> Vec<&'a SpoolWithMasterRow> {
    all_spools
        .iter()
        .filter(|row| spool_available_for_live_metadata_match(row))
        .filter(|row| {
            !require_missing_rfid_tag
                || row
                    .spool
                    .rfid_tag
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .is_none()
        })
        .filter(|row| {
            if require_missing_rfid_tag && !spool_vendor_is_bambu(row) {
                return false;
            }
            let material_match =
                eq_ignore_case(tray.filament_type.as_deref(), Some(&row.master.material));
            let observed_name = tray
                .filament_name
                .as_deref()
                .or(tray.tray_id_name.as_deref());
            let name_match = live_name_matches(observed_name, Some(&row.master.filament_name));
            let color_match = live_color_matches_swatch(
                tray.color_hex.as_deref(),
                row.master.hex_color.as_deref(),
            );
            let has_color_signal = tray
                .color_hex
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_some();
            if require_missing_rfid_tag && has_color_signal {
                return color_match && (material_match || name_match);
            }
            [material_match, name_match, color_match]
                .into_iter()
                .filter(|value| *value)
                .count()
                >= 2
        })
        .collect()
}

fn spool_available_for_exact_live_rfid_match(row: &SpoolWithMasterRow) -> bool {
    !matches!(
        SpoolStatus::from_raw(Some(&row.spool.status)),
        SpoolStatus::Lost | SpoolStatus::Missing | SpoolStatus::Deleted | SpoolStatus::Borrowed
    )
}

fn spool_available_for_live_metadata_match(row: &SpoolWithMasterRow) -> bool {
    !matches!(
        SpoolStatus::from_raw(Some(&row.spool.status)),
        SpoolStatus::Empty
            | SpoolStatus::Lost
            | SpoolStatus::Missing
            | SpoolStatus::Deleted
            | SpoolStatus::Borrowed
    )
}

fn spool_vendor_is_bambu(row: &SpoolWithMasterRow) -> bool {
    row.master
        .vendor
        .trim()
        .to_ascii_lowercase()
        .contains("bambu")
}

pub(crate) fn live_identity_text(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

pub(crate) fn live_tray_identity_text(tray: &BambuLiveObservedTrayRow) -> Option<&str> {
    live_identity_text(tray.tray_uuid.as_deref())
        .or_else(|| live_identity_text(tray.observed_rfid_tag.as_deref()))
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

fn live_name_matches(left: Option<&str>, right: Option<&str>) -> bool {
    let Some(left) = left.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let Some(right) = right.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let left_tokens = live_name_tokens(left);
    let right_tokens = live_name_tokens(right);
    if left_tokens.is_empty() || right_tokens.is_empty() {
        return false;
    }
    if left_tokens == right_tokens {
        return live_name_has_distinctive_token(&left_tokens);
    }
    (live_name_has_distinctive_token(&left_tokens)
        && live_name_tokens_contain_sequence(&right_tokens, &left_tokens))
        || (live_name_has_distinctive_token(&right_tokens)
            && live_name_tokens_contain_sequence(&left_tokens, &right_tokens))
}

fn live_name_tokens(value: &str) -> Vec<String> {
    value
        .split(|character: char| !(character.is_ascii_alphanumeric() || character == '+'))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .collect()
}

fn live_name_has_distinctive_token(tokens: &[String]) -> bool {
    tokens.iter().any(|token| {
        let compact = token.trim_matches('+');
        compact.len() >= 2 && !live_name_token_is_material(compact)
    })
}

fn live_name_token_is_material(token: &str) -> bool {
    matches!(
        token,
        "pla"
            | "petg"
            | "abs"
            | "asa"
            | "tpu"
            | "pc"
            | "pa"
            | "cpe"
            | "hips"
            | "pva"
            | "pet"
            | "pp"
            | "pom"
            | "support"
    )
}

fn live_name_tokens_contain_sequence(haystack: &[String], needle: &[String]) -> bool {
    !needle.is_empty()
        && haystack.len() >= needle.len()
        && haystack
            .windows(needle.len())
            .any(|window| window == needle)
}

pub(crate) fn live_color_matches_swatch(observed: Option<&str>, candidate: Option<&str>) -> bool {
    let Some(observed_colors) = parse_swatch_colors(observed) else {
        return eq_ignore_case(observed, candidate);
    };
    let Some(candidate_colors) = parse_swatch_colors(candidate) else {
        return eq_ignore_case(observed, candidate);
    };
    observed_colors
        .iter()
        .all(|observed_color| candidate_colors.contains(observed_color))
}

fn parse_swatch_colors(value: Option<&str>) -> Option<Vec<String>> {
    let value = value?.trim();
    if value.is_empty() {
        return None;
    }
    let lower = value.to_ascii_lowercase();
    let composite_inner = if lower.starts_with("multi(") && value.ends_with(')') {
        Some(&value[6..value.len() - 1])
    } else if lower.starts_with("gradient(") && value.ends_with(')') {
        Some(&value[9..value.len() - 1])
    } else {
        None
    };
    if let Some(inner) = composite_inner {
        let parts: Vec<_> = inner
            .split([',', ';'])
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .collect();
        if parts.len() < 2 {
            return None;
        }
        return parts.into_iter().map(normalize_hex_color).collect();
    }
    normalize_hex_color(value).map(|color| vec![color])
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let trimmed = value.trim().trim_start_matches('#');
    let rgb = match trimmed.len() {
        8 => &trimmed[..6],
        6 => trimmed,
        _ => return None,
    };
    rgb.chars()
        .all(|value| value.is_ascii_hexdigit())
        .then(|| format!("#{rgb}").to_uppercase())
}
