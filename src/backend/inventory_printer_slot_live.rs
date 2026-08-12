use crate::backend::database_result::InventoryResult;
use crate::backend::filament_database::{
    BambuLiveIntegrationRow, BambuLiveObservedTrayRow, FilamentDatabase,
};
use crate::backend::inventory_engine::{normalize_optional_input_text, AssignPrinterSlotInput};
use crate::backend::printer_slot_live_mapping::bambu_live_slot_matches_tray;

pub(super) fn derive_assign_printer_slot_live_context(
    db: &FilamentDatabase,
    input: &AssignPrinterSlotInput,
) -> InventoryResult<(Option<String>, Option<String>, bool)> {
    let requested_spool_id = normalize_optional_input_text(input.spool_id.as_deref());
    let explicit_override_tray_uuid =
        normalize_optional_input_text(input.rfid_override_tray_uuid.as_deref());
    let explicit_override_color_hex =
        normalize_optional_input_text(input.rfid_override_color_hex.as_deref());
    let explicit_clear = input.clear_live_cache_before_next_refresh.unwrap_or(false);

    let printer = match db
        .list_printer_overview()?
        .into_iter()
        .find(|row| row.printer.id == input.printer_id)
    {
        Some(row) => row,
        None => {
            return Ok((
                explicit_override_tray_uuid,
                explicit_override_color_hex,
                explicit_clear,
            ));
        }
    };

    let slot = match printer
        .slots
        .into_iter()
        .find(|slot| slot.slot_id == input.slot_id)
    {
        Some(slot) => slot,
        None => {
            return Ok((
                explicit_override_tray_uuid,
                explicit_override_color_hex,
                explicit_clear,
            ));
        }
    };

    let current_slot_spool_id = normalize_optional_input_text(slot.spool_id.as_deref());
    let slot_has_spool = current_slot_spool_id.is_some();
    let is_ext_slot = slot.ams_id.ends_with("_ext");
    let effective_clear =
        explicit_clear || (requested_spool_id.is_none() && slot_has_spool && !is_ext_slot);

    if requested_spool_id.is_none() || is_ext_slot {
        return Ok((
            explicit_override_tray_uuid,
            explicit_override_color_hex,
            effective_clear,
        ));
    }

    let mut effective_override_tray_uuid = explicit_override_tray_uuid;
    let mut effective_override_color_hex = explicit_override_color_hex;

    if (effective_override_tray_uuid.is_none() || effective_override_color_hex.is_none())
        && let Some((derived_tray_uuid, derived_color_hex)) =
            resolve_live_unknown_override(db, &input.printer_id, slot.slot_index, &slot.ams_id)?
    {
        if effective_override_tray_uuid.is_none() {
            effective_override_tray_uuid = Some(derived_tray_uuid);
        }
        if effective_override_color_hex.is_none() {
            effective_override_color_hex = Some(derived_color_hex);
        }
    }

    let manual_reassignment_needs_live_suppression = !is_ext_slot
        && requested_spool_id != current_slot_spool_id
        && requested_spool_id.is_some()
        && effective_override_tray_uuid.is_none()
        && effective_override_color_hex.is_none();

    Ok((
        effective_override_tray_uuid,
        effective_override_color_hex,
        effective_clear || manual_reassignment_needs_live_suppression,
    ))
}

fn resolve_live_unknown_override(
    db: &FilamentDatabase,
    printer_id: &str,
    slot_index: i64,
    ams_id: &str,
) -> InventoryResult<Option<(String, String)>> {
    if ams_id.ends_with("_ext") {
        return Ok(None);
    }

    let integration = db
        .list_bambu_live_integrations()?
        .into_iter()
        .find(|entry| entry.printer_id == printer_id)
        .map(|entry| entry.config);

    Ok(integration
        .as_ref()
        .and_then(|config| find_live_unknown_override_for_slot(config, slot_index, ams_id)))
}

fn find_live_unknown_override_for_slot(
    config: &BambuLiveIntegrationRow,
    slot_index: i64,
    ams_id: &str,
) -> Option<(String, String)> {
    let tray = config
        .observed_state
        .as_ref()?
        .trays
        .iter()
        .find(|candidate| {
            bambu_live_slot_matches_tray(
                ams_id,
                slot_index,
                candidate.ams_index,
                candidate.tray_index,
            )
        })?;
    live_unknown_override_from_tray(tray)
}

fn live_unknown_override_from_tray(tray: &BambuLiveObservedTrayRow) -> Option<(String, String)> {
    if !tray.loaded || tray.match_status.as_deref() != Some("unknown_rfid") {
        return None;
    }

    let tray_uuid = normalize_optional_input_text(tray.tray_uuid.as_deref())
        .or_else(|| normalize_optional_input_text(tray.observed_rfid_tag.as_deref()))?;
    let color_hex = normalize_optional_input_text(tray.color_hex.as_deref())?;
    Some((tray_uuid, color_hex))
}

#[cfg(test)]
mod tests {
    use super::live_unknown_override_from_tray;
    use crate::backend::filament_database::BambuLiveObservedTrayRow;

    fn observed_tray() -> BambuLiveObservedTrayRow {
        BambuLiveObservedTrayRow {
            ams_index: Some(0),
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Unknown".to_string()),
            color_hex: Some("#00FF00".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(80),
            remaining_grams: Some(800),
            last_weight_seen_at: None,
            observed_rfid_tag: None,
            tray_uuid: None,
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: None,
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: Some("unknown_rfid".to_string()),
            match_note: None,
        }
    }

    #[test]
    fn unknown_live_tray_prefers_trimmed_tray_uuid() {
        let mut tray = observed_tray();
        tray.tray_uuid = Some("  tray-uuid  ".to_string());
        tray.observed_rfid_tag = Some("fallback-tag".to_string());
        tray.color_hex = Some("  #00FF00  ".to_string());

        assert_eq!(
            live_unknown_override_from_tray(&tray),
            Some(("tray-uuid".to_string(), "#00FF00".to_string()))
        );
    }

    #[test]
    fn unknown_live_tray_falls_back_to_observed_tag() {
        let mut tray = observed_tray();
        tray.tray_uuid = Some("   ".to_string());
        tray.observed_rfid_tag = Some("observed-tag".to_string());

        assert_eq!(
            live_unknown_override_from_tray(&tray),
            Some(("observed-tag".to_string(), "#00FF00".to_string()))
        );
    }

    #[test]
    fn live_tray_requires_loaded_unknown_rfid_with_identity_and_color() {
        let mut tray = observed_tray();
        tray.tray_uuid = Some("tray-uuid".to_string());

        tray.loaded = false;
        assert_eq!(live_unknown_override_from_tray(&tray), None);

        tray.loaded = true;
        tray.match_status = Some("matched".to_string());
        assert_eq!(live_unknown_override_from_tray(&tray), None);

        tray.match_status = Some("unknown_rfid".to_string());
        tray.color_hex = Some("  ".to_string());
        assert_eq!(live_unknown_override_from_tray(&tray), None);
    }
}
