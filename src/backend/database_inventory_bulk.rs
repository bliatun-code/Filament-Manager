use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use super::database_events::insert_spool_history_event;
use super::database_inventory_bulk_models::{
    InventoryBulkMutationInput, InventoryBulkMutationResult, InventoryBulkSpoolPrecondition,
};
use super::database_loan_queries::spool_has_active_loan;
use super::database_locations::get_location;
use super::database_result::{InventoryError, InventoryResult};
use super::database_spool_assignment::spool_assigned_to_printer;
use super::inventory_domain::SpoolStatus;

const BULK_SOURCE: &str = "INVENTORY_BULK_ACTION";
type StoredSpoolSnapshot = (String, Option<String>, Option<String>, Option<String>);

#[derive(Clone, Debug)]
enum BulkTarget {
    Move {
        location_id: String,
        location_name: String,
    },
    Status(SpoolStatus),
}

#[derive(Clone, Debug)]
struct ActualSpoolSnapshot {
    spool_id: String,
    status: SpoolStatus,
    location_id: Option<String>,
    home_location_id: Option<String>,
    active_loan: bool,
    assigned_to_printer: bool,
    removed: bool,
    affected: bool,
}

pub(crate) fn execute_inventory_bulk_mutation(
    connection: &Connection,
    input: InventoryBulkMutationInput,
) -> InventoryResult<InventoryBulkMutationResult> {
    let (expected_affected_count, preconditions, target) = match input {
        InventoryBulkMutationInput::Move {
            expected_affected_count,
            spools,
            target_location_id,
        } => (
            expected_affected_count,
            spools,
            validate_move_target(connection, &target_location_id)?,
        ),
        InventoryBulkMutationInput::Status {
            expected_affected_count,
            spools,
            target_status,
        } => (
            expected_affected_count,
            spools,
            validate_status_target(target_status)?,
        ),
    };

    if expected_affected_count < 0 {
        return Err(invalid_bulk_operation(
            "inventory.bulk.invalid_expected_count",
            "Expected affected count cannot be negative.",
        ));
    }
    if preconditions.is_empty() {
        return Err(invalid_bulk_operation(
            "inventory.bulk.empty_selection",
            "Select at least one spool for a bulk mutation.",
        ));
    }

    // This phase is deliberately read-only. Every selection row and every
    // optimistic-concurrency field is reloaded before the first update.
    let mut seen_ids = HashSet::with_capacity(preconditions.len());
    let mut actual_snapshots = Vec::with_capacity(preconditions.len());
    for precondition in &preconditions {
        let spool_id = precondition.spool_id.trim();
        if spool_id.is_empty() {
            return Err(invalid_bulk_operation(
                "inventory.bulk.blank_spool_id",
                "Bulk spool ids cannot be blank.",
            ));
        }
        if !seen_ids.insert(spool_id.to_string()) {
            return Err(invalid_bulk_operation(
                "inventory.bulk.duplicate_spool_id",
                format!("Spool '{spool_id}' appears more than once in the bulk request."),
            ));
        }

        let mut actual = load_actual_snapshot(connection, spool_id)?.ok_or_else(|| {
            invalid_bulk_operation(
                "inventory.bulk.stale_snapshot",
                format!("Spool '{spool_id}' no longer exists."),
            )
        })?;
        validate_snapshot_preconditions(precondition, &actual)?;
        actual.affected = is_affected(&actual, &target);
        if actual.affected {
            validate_affected_spool(&actual)?;
        }
        actual_snapshots.push(actual);
    }

    let affected_count = actual_snapshots
        .iter()
        .filter(|snapshot| snapshot.affected)
        .count() as i64;
    if affected_count != expected_affected_count {
        return Err(invalid_bulk_operation(
            "inventory.bulk.affected_count_mismatch",
            format!(
                "Bulk review expected {expected_affected_count} affected spools, but the verified snapshot has {affected_count}."
            ),
        ));
    }

    let mut history_spool_count = 0_i64;
    for snapshot in actual_snapshots.iter().filter(|snapshot| snapshot.affected) {
        match &target {
            BulkTarget::Move {
                location_id,
                location_name,
            } => apply_move(connection, snapshot, location_id, location_name)?,
            BulkTarget::Status(status) => apply_status(connection, snapshot, *status)?,
        }
        history_spool_count += 1;
    }

    Ok(InventoryBulkMutationResult {
        affected_count,
        committed: true,
        history_spool_count,
    })
}

fn validate_move_target(connection: &Connection, raw_id: &str) -> InventoryResult<BulkTarget> {
    let location_id = raw_id.trim();
    if location_id.is_empty() {
        return Err(invalid_bulk_operation(
            "inventory.bulk.invalid_location_target",
            "A target location id is required for a bulk move.",
        ));
    }
    let location = get_location(connection, location_id)?.ok_or_else(|| {
        invalid_bulk_operation(
            "inventory.bulk.invalid_location_target",
            format!("Location '{location_id}' does not exist."),
        )
    })?;
    if location.is_system_owned() {
        return Err(invalid_bulk_operation(
            "inventory.bulk.invalid_location_target",
            "Bulk move targets must be generic inventory locations.",
        ));
    }
    if location.is_archived() {
        return Err(invalid_bulk_operation(
            "inventory.bulk.invalid_location_target",
            "Archived locations cannot be used for a bulk move.",
        ));
    }
    Ok(BulkTarget::Move {
        location_id: location.id,
        location_name: location.name,
    })
}

fn validate_status_target(status: SpoolStatus) -> InventoryResult<BulkTarget> {
    match status {
        SpoolStatus::InStock | SpoolStatus::Empty | SpoolStatus::Lost => {
            Ok(BulkTarget::Status(status))
        }
        _ => Err(invalid_bulk_operation(
            "inventory.bulk.invalid_status_target",
            "Bulk status can only be set to IN_STOCK, EMPTY, or LOST.",
        )),
    }
}

fn load_actual_snapshot(
    connection: &Connection,
    spool_id: &str,
) -> InventoryResult<Option<ActualSpoolSnapshot>> {
    let stored: Option<StoredSpoolSnapshot> = connection
        .query_row(
            "SELECT status, location_id, home_location_id, deleted_at
             FROM filament_spools
             WHERE id = ?1
             LIMIT 1",
            params![spool_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    let Some((raw_status, location_id, home_location_id, deleted_at)) = stored else {
        return Ok(None);
    };
    let status = SpoolStatus::from_raw(Some(&raw_status));
    Ok(Some(ActualSpoolSnapshot {
        spool_id: spool_id.to_string(),
        status,
        location_id,
        home_location_id,
        active_loan: spool_has_active_loan(connection, spool_id)?,
        assigned_to_printer: spool_assigned_to_printer(connection, spool_id)?,
        removed: deleted_at.is_some()
            || matches!(status, SpoolStatus::Missing | SpoolStatus::Deleted),
        affected: false,
    }))
}

fn validate_snapshot_preconditions(
    expected: &InventoryBulkSpoolPrecondition,
    actual: &ActualSpoolSnapshot,
) -> InventoryResult<()> {
    let expected_location_id = normalize_optional_id(expected.expected_location_id.as_deref());
    let expected_home_location_id =
        normalize_optional_id(expected.expected_home_location_id.as_deref());
    let mut stale_fields = Vec::new();
    if expected.expected_status != actual.status {
        stale_fields.push("status");
    }
    if expected_location_id != actual.location_id {
        stale_fields.push("current location");
    }
    if expected_home_location_id != actual.home_location_id {
        stale_fields.push("home location");
    }
    if expected.expected_active_loan != actual.active_loan {
        stale_fields.push("active loan");
    }
    if expected.expected_assigned_to_printer != actual.assigned_to_printer {
        stale_fields.push("printer slot");
    }
    if stale_fields.is_empty() {
        return Ok(());
    }
    Err(invalid_bulk_operation(
        "inventory.bulk.stale_snapshot",
        format!(
            "Spool '{}' changed after review ({}). Review the bulk action again.",
            actual.spool_id,
            stale_fields.join(", ")
        ),
    ))
}

fn normalize_optional_id(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn is_affected(snapshot: &ActualSpoolSnapshot, target: &BulkTarget) -> bool {
    match target {
        BulkTarget::Move { location_id, .. } => {
            snapshot.location_id.as_deref() != Some(location_id.as_str())
                || snapshot.home_location_id.as_deref() != Some(location_id.as_str())
        }
        BulkTarget::Status(status) => snapshot.status != *status,
    }
}

fn validate_affected_spool(snapshot: &ActualSpoolSnapshot) -> InventoryResult<()> {
    if snapshot.removed {
        return Err(invalid_bulk_operation(
            "inventory.bulk.removed_spool",
            format!(
                "Spool '{}' is removed and cannot be changed by a bulk action.",
                snapshot.spool_id
            ),
        ));
    }
    if snapshot.assigned_to_printer || snapshot.status == SpoolStatus::Assigned {
        return Err(invalid_bulk_operation(
            "inventory.bulk.printer_slot_controlled",
            format!(
                "Spool '{}' is controlled by a printer slot and cannot be changed manually.",
                snapshot.spool_id
            ),
        ));
    }
    if snapshot.active_loan || snapshot.status == SpoolStatus::Borrowed {
        return Err(invalid_bulk_operation(
            "inventory.bulk.active_loan",
            format!(
                "Spool '{}' has an active loan and cannot be changed manually.",
                snapshot.spool_id
            ),
        ));
    }
    Ok(())
}

fn apply_move(
    connection: &Connection,
    snapshot: &ActualSpoolSnapshot,
    target_location_id: &str,
    target_location_name: &str,
) -> InventoryResult<()> {
    let affected = connection.execute(
        "UPDATE filament_spools
         SET location_id = ?1,
             home_location_id = ?1,
             updated_at = datetime('now')
         WHERE id = ?2",
        params![target_location_id, snapshot.spool_id],
    )?;
    require_single_write(affected, &snapshot.spool_id)?;
    insert_json_history(
        connection,
        &snapshot.spool_id,
        "LOCATION_UPDATED",
        json!({
            "bulk_action": "MOVE",
            "source": BULK_SOURCE,
            "previous_location_id": snapshot.location_id,
            "previous_home_location_id": snapshot.home_location_id,
            "location": target_location_id,
            "home_location": target_location_id,
            "target_location_id": target_location_id,
            "target_location_name": target_location_name,
        }),
    )
}

fn apply_status(
    connection: &Connection,
    snapshot: &ActualSpoolSnapshot,
    target_status: SpoolStatus,
) -> InventoryResult<()> {
    let affected = connection.execute(
        "UPDATE filament_spools
         SET status = ?1,
             updated_at = datetime('now')
         WHERE id = ?2",
        params![target_status.as_str(), snapshot.spool_id],
    )?;
    require_single_write(affected, &snapshot.spool_id)?;
    insert_json_history(
        connection,
        &snapshot.spool_id,
        "STATUS_UPDATED",
        json!({
            "bulk_action": "STATUS",
            "source": BULK_SOURCE,
            "previous_status": snapshot.status.as_str(),
            "status": target_status.as_str(),
        }),
    )?;
    if target_status == SpoolStatus::Empty {
        insert_json_history(
            connection,
            &snapshot.spool_id,
            "USED_UP",
            json!({
                "bulk_action": "STATUS",
                "source": BULK_SOURCE,
                "status": target_status.as_str(),
            }),
        )?;
    }
    Ok(())
}

fn require_single_write(affected: usize, spool_id: &str) -> InventoryResult<()> {
    if affected == 1 {
        return Ok(());
    }
    Err(invalid_bulk_operation(
        "inventory.bulk.write_conflict",
        format!("Spool '{spool_id}' disappeared while the bulk transaction was being applied."),
    ))
}

fn insert_json_history(
    connection: &Connection,
    spool_id: &str,
    event_type: &str,
    payload: serde_json::Value,
) -> InventoryResult<()> {
    let serialized =
        serde_json::to_string(&payload).map_err(|error| InventoryError::Db(error.to_string()))?;
    insert_spool_history_event(connection, spool_id, event_type, &serialized)
}

fn invalid_bulk_operation(code: &'static str, message: impl Into<String>) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.into(),
    }
}

#[cfg(test)]
#[path = "database_inventory_bulk_tests.rs"]
mod tests;
