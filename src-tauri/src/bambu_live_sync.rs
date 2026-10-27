use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    BambuLiveIntegrationEntryRow, BambuLiveObservedStateRow, FilamentDatabase,
};
use crate::bambu_live_matching::match_observed_trays;
use crate::bambu_live_usage::sync_observed_usage;

/// Reconcile derived matches with the current inventory on reads. Saving RFID or
/// creating a catalog roll does not change the printer's observation timestamp.
/// This deliberately excludes usage synchronization and automatic slot writes.
pub(crate) fn refresh_inventory_match_status(
    db: &FilamentDatabase,
    integrations: &mut [BambuLiveIntegrationEntryRow],
) -> Result<(), InventoryError> {
    for entry in integrations {
        let Some(observed) = entry.config.observed_state.as_mut() else {
            continue;
        };
        let Some(overview) = db.get_printer_overview(&entry.printer_id)? else {
            continue;
        };
        match_observed_trays(db, &overview, &mut observed.trays)?;
    }
    Ok(())
}

pub(crate) fn enrich_with_match_status(
    db: &FilamentDatabase,
    printer_id: &str,
    mut observed: BambuLiveObservedStateRow,
) -> Result<BambuLiveObservedStateRow, InventoryError> {
    let overview = match db.get_printer_overview(printer_id)? {
        Some(value) => value,
        None => return Ok(observed),
    };

    match_observed_trays(db, &overview, &mut observed.trays)?;
    sync_observed_usage(db, &overview, &observed)?;
    Ok(observed)
}

#[cfg(test)]
pub(crate) use crate::bambu_live_matching::apply_tray_match_status;
#[cfg(test)]
pub(crate) use crate::bambu_live_observation::tray_exist_bits_slot_present;
#[cfg(test)]
pub(crate) use crate::bambu_live_usage::{
    classify_live_weight_update, live_identity_is_blocked_by_manual_clear,
    should_auto_clear_live_color_replacement, should_auto_clear_live_slot,
    should_auto_clear_live_unknown_replacement, slot_override_matches_live_unknown,
    LiveWeightDecision,
};
