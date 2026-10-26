use rusqlite::{params, Connection};
use serde_json::Value;

use super::database_ids::new_id;
use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn insert_printer_live_event(
    conn: &Connection,
    printer_id: &str,
    event_type: &str,
    payload_json: &Value,
) -> InventoryResult<()> {
    let (normalized_printer_id, normalized_event_type) =
        normalize_live_event_identity(printer_id, event_type)?;

    let payload = serde_json::to_string(payload_json)
        .map_err(|error| InventoryError::Db(error.to_string()))?;
    conn.execute(
        "INSERT INTO printer_live_events (id, printer_id, event_type, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'))",
        params![
            new_id(),
            normalized_printer_id,
            normalized_event_type,
            payload
        ],
    )?;
    Ok(())
}

pub(crate) fn insert_printer_live_event_unless_recent_duplicate(
    conn: &Connection,
    printer_id: &str,
    event_type: &str,
    payload_json: &Value,
    dedupe_key: &str,
    dedupe_window_seconds: i64,
) -> InventoryResult<bool> {
    let (normalized_printer_id, normalized_event_type) =
        normalize_live_event_identity(printer_id, event_type)?;
    let normalized_dedupe_key = dedupe_key.trim();
    if normalized_dedupe_key.is_empty() {
        insert_printer_live_event(conn, printer_id, event_type, payload_json)?;
        return Ok(true);
    }

    let window_seconds = dedupe_window_seconds.max(1);
    let window_modifier = format!("-{window_seconds} seconds");
    let mut stmt = conn.prepare(
        "SELECT payload_json
         FROM printer_live_events
         WHERE printer_id = ?1
           AND event_type = ?2
           AND created_at >= datetime('now', ?3)
         ORDER BY created_at DESC
         LIMIT 50",
    )?;
    let recent_payloads = stmt.query_map(
        params![
            normalized_printer_id,
            normalized_event_type,
            window_modifier
        ],
        |row| row.get::<_, String>(0),
    )?;

    for payload in recent_payloads {
        let payload = payload?;
        let Ok(value) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        if value
            .get("dedupe_key")
            .and_then(Value::as_str)
            .is_some_and(|value| value == normalized_dedupe_key)
        {
            return Ok(false);
        }
    }

    insert_printer_live_event(conn, printer_id, event_type, payload_json)?;
    Ok(true)
}

fn normalize_live_event_identity<'a>(
    printer_id: &'a str,
    event_type: &'a str,
) -> InventoryResult<(&'a str, &'a str)> {
    let normalized_printer_id = printer_id.trim();
    let normalized_event_type = event_type.trim();
    if normalized_printer_id.is_empty() || normalized_event_type.is_empty() {
        return Err(InventoryError::Db(
            "printer id and event type are required for printer live events".to_string(),
        ));
    }
    Ok((normalized_printer_id, normalized_event_type))
}

/// Count independent, recent rejected AMS samples, never repeated reads of a
/// carried observation. This is advisory only; it does not relax auto-weighing.
pub(crate) fn stable_live_weight_rejection_count(
    conn: &Connection,
    printer_id: &str,
    slot: &super::database_printer_models::PrinterAmsSlotRow,
) -> InventoryResult<Option<i64>> {
    let (Some(spool_id), Some(current), Some(remaining), Some(weight_at)) = (
        slot.spool_id.as_deref(),
        slot.spool_remaining_g,
        slot.live_remaining_grams,
        slot.live_weight_seen_at.as_deref(),
    ) else {
        return Ok(None);
    };
    if slot.live_loaded != Some(true)
        || slot.live_mqtt_connected != Some(true)
        || slot.live_matched_inventory_mode.as_deref() != Some("exact_rfid")
        || slot.live_match_status.as_deref() != Some("clear_match")
        || slot.live_matched_inventory_spool_id.as_deref() != Some(spool_id)
        || remaining < 0
        || current - remaining <= 80.max(current / 10)
    {
        return Ok(None);
    }
    let mut stmt = conn.prepare(
        "SELECT e.payload_json,
                unixepoch(COALESCE(json_extract(e.payload_json, '$.weight_observed_at'), json_extract(e.payload_json, '$.observed_at')))
         FROM printer_live_events e JOIN filament_spools s ON s.id = ?2
         WHERE e.printer_id = ?1 AND e.event_type = 'LIVE_AUTO_WEIGHT_REJECTED'
           AND e.created_at >= datetime('now', '-30 minutes')
           AND json_extract(e.payload_json, '$.spool_id') = ?2
           AND json_extract(e.payload_json, '$.reason') = 'drop_outlier'
           AND julianday(COALESCE(json_extract(e.payload_json, '$.weight_observed_at'), json_extract(e.payload_json, '$.observed_at'))) >= julianday(s.updated_at)
           AND julianday(?3) BETWEEN julianday('now', '-10 minutes') AND julianday('now', '+5 seconds')
           AND julianday(COALESCE(json_extract(e.payload_json, '$.weight_observed_at'), json_extract(e.payload_json, '$.observed_at'))) BETWEEN julianday('now', '-30 minutes') AND julianday(?3)
           AND (?4 IS NULL OR julianday(?5) > julianday(?4))
         ORDER BY 2 DESC, e.created_at DESC LIMIT 200",
    )?;
    let rows = stmt.query_map(
        params![
            printer_id,
            spool_id,
            weight_at,
            slot.live_cache_cleared_at,
            slot.live_last_identity_seen_at
        ],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<i64>>(1)?)),
    )?;
    let mut seen = std::collections::BTreeSet::new();
    let mut min = remaining;
    let mut max = remaining;
    for row in rows {
        let (payload, at) = row?;
        let Some(at) = at else {
            continue;
        };
        if seen.contains(&at) {
            continue;
        }
        let Ok(payload) = serde_json::from_str::<Value>(&payload) else {
            continue;
        };
        if payload.get("current_grams").and_then(Value::as_i64) != Some(current) {
            break;
        }
        let Some(value) = payload.get("remaining_grams").and_then(Value::as_i64) else {
            break;
        };
        if value < 0
            || payload.get("tray_uuid").and_then(Value::as_str) != slot.live_tray_uuid.as_deref()
        {
            break;
        }
        min = min.min(value);
        max = max.max(value);
        // 20 g allows two 1% AMS steps on a 1 kg roll, without treating
        // wildly alternating estimates as confirmation.
        if max - min > 20 {
            break;
        }
        seen.insert(at);
    }
    Ok(
        (seen.len() >= 3 && seen.last().unwrap_or(&0) - seen.first().unwrap_or(&0) >= 30)
            .then_some(seen.len() as i64),
    )
}

#[cfg(test)]
mod weight_review_tests {
    use super::super::database_printer_models::PrinterAmsSlotRow;
    use super::*;

    #[test]
    fn stable_rejections_require_independent_recent_consistent_samples_and_reset_after_correction()
    {
        let db = super::super::database_core::FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        db.upsert_printer_with_ams("printer", "Bambu Lab P1S", "Printer", 1, 4)
            .unwrap();
        let conn = db.connection();
        conn.execute_batch(
            "INSERT INTO filament_master_list(id, material, filament_name, color_name)
            VALUES('master', 'PLA', 'PLA Basic', 'Black');
            INSERT INTO filament_spools(id, master_id, status, updated_at)
            VALUES('roll', 'master', 'ASSIGNED', datetime('now', '-1 hour'));",
        )
        .unwrap();
        let now: String = conn
            .query_row("SELECT datetime('now')", [], |r| r.get(0))
            .unwrap();
        let mut slot: PrinterAmsSlotRow = serde_json::from_value(serde_json::json!({
            "slot_id":"slot", "ams_id":"ams1", "slot_index":1, "spool_id":"roll",
            "spool_remaining_g":1000, "live_remaining_grams":600, "live_weight_seen_at":now,
            "live_last_identity_seen_at":now, "live_tray_uuid":"RFID", "live_loaded":true,
            "live_mqtt_connected":true, "live_match_status":"clear_match",
            "live_matched_inventory_mode":"exact_rfid", "live_matched_inventory_spool_id":"roll",
        }))
        .unwrap();
        let insert = |age: i64, grams: i64| {
            let at: String = conn
                .query_row(
                    "SELECT datetime('now', ?1)",
                    [format!("-{age} seconds")],
                    |r| r.get(0),
                )
                .unwrap();
            let payload = serde_json::json!({"spool_id":"roll", "reason":"drop_outlier", "current_grams":1000,
                "remaining_grams":grams, "tray_uuid":"RFID", "weight_observed_at":at});
            insert_printer_live_event(conn, "printer", "LIVE_AUTO_WEIGHT_REJECTED", &payload)
                .unwrap();
        };
        insert(0, 600);
        insert(0, 600);
        insert(0, 600);
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "replayed snapshots are not independent samples"
        );
        insert(60, 610);
        insert(30, 600);
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            Some(3)
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM printer_live_events", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            5,
            "reads add no events"
        );
        slot.live_match_status = Some("ambiguous".into());
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None
        );
        slot.live_match_status = Some("clear_match".into());
        slot.spool_remaining_g = Some(600);
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "corrected weight dismisses warning"
        );
        slot.spool_remaining_g = Some(1000);
        slot.live_weight_seen_at = Some("2000-01-01T00:00:00Z".into());
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "cached estimates do not warn"
        );
        slot.live_weight_seen_at = Some(now.clone());
        slot.live_cache_cleared_at = Some(now.clone());
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "manual clear suppresses carried identity"
        );
        slot.live_cache_cleared_at = None;
        conn.execute("UPDATE filament_spools SET updated_at=datetime('now')", [])
            .unwrap();
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "manual edits reset the sample window"
        );
        conn.execute(
            "UPDATE filament_spools SET updated_at=datetime('now','-1 hour')",
            [],
        )
        .unwrap();
        conn.execute("DELETE FROM printer_live_events", []).unwrap();
        insert(60, 600);
        insert(30, 300);
        insert(0, 600);
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "alternating large estimates are not stable"
        );
        conn.execute("DELETE FROM printer_live_events", []).unwrap();
        insert(3, 600);
        insert(2, 600);
        insert(0, 600);
        assert_eq!(
            stable_live_weight_rejection_count(conn, "printer", &slot).unwrap(),
            None,
            "a short burst is not confirmation"
        );
    }
}
