use super::database_events::{
    ensure_scale as ensure_scale_row, insert_weight_reading as insert_weight_reading_row,
};
use super::database_print_jobs::insert_print_job as insert_print_job_row;
use super::database_result::InventoryResult;
use super::database_spool_price_lock::lock_spool_price_for_historical_status;
use super::database_spool_updates::{
    update_spool_status as update_spool_status_row, update_spool_weight as update_spool_weight_row,
};
use super::filament_database::SpoolWithMasterRow;
use super::inventory_engine::WeightSource;
use serde_json::json;

fn insert_json_history_event(
    conn: &rusqlite::Connection,
    spool_id: &str,
    event: &str,
    details: serde_json::Value,
) -> InventoryResult<()> {
    super::database_events::insert_spool_history_event(conn, spool_id, event, &details.to_string())
}

pub(super) fn measured_filament_grams(
    spool: &SpoolWithMasterRow,
    measured_total_g: i64,
) -> (i64, i64) {
    let tare_g = resolve_spool_tare_weight_g(
        spool.spool.spool_tare_weight_g,
        Some(spool.master.vendor.as_str()),
    );
    (measured_total_g.saturating_sub(tare_g).max(0), tare_g)
}

pub(super) fn update_measured_total_weight_in_transaction(
    conn: &rusqlite::Connection,
    spool: &SpoolWithMasterRow,
    scale_id: &str,
    scale_name: &str,
    scale_kind: &str,
    measured_total_g: i64,
    source: WeightSource,
) -> InventoryResult<()> {
    let (filament_grams, tare_g) = measured_filament_grams(spool, measured_total_g);
    ensure_scale_row(conn, scale_id, scale_name, scale_kind)?;
    update_spool_weight_row(
        conn,
        &spool.spool.id,
        Some(filament_grams),
        Some(filament_grams),
    )?;
    insert_weight_reading_row(
        conn,
        scale_id,
        &spool.spool.id,
        filament_grams,
        source.as_str(),
    )?;
    insert_json_history_event(
        conn,
        &spool.spool.id,
        "WEIGHT_UPDATED",
        json!({
            "measured_grams": measured_total_g,
            "tare_weight_g": tare_g,
            "grams": filament_grams,
            "source": source.as_str()
        }),
    )
}

pub(super) fn apply_outgoing_measured_total_in_transaction(
    conn: &rusqlite::Connection,
    printer_id: &str,
    spool: &SpoolWithMasterRow,
    measured_total_g: i64,
) -> InventoryResult<()> {
    let (measured_filament_g, _) = measured_filament_grams(spool, measured_total_g);
    let baseline = spool.spool.remaining_g.map(|grams| grams.max(0));
    let used_grams = baseline
        .map(|grams| grams.saturating_sub(measured_filament_g))
        .unwrap_or(0);

    if used_grams > 0 {
        let next_status = if measured_filament_g == 0 {
            "EMPTY"
        } else {
            "ASSIGNED"
        };
        insert_print_job_row(conn, printer_id, &spool.spool.id, None, used_grams, true)?;
        ensure_scale_row(conn, "print-job", "Print Job Usage", "VIRTUAL")?;
        update_spool_weight_row(
            conn,
            &spool.spool.id,
            Some(measured_filament_g),
            Some(measured_filament_g),
        )?;
        insert_weight_reading_row(
            conn,
            "print-job",
            &spool.spool.id,
            measured_filament_g,
            "PRINT_JOB",
        )?;
        update_spool_status_row(conn, &spool.spool.id, next_status)?;
        lock_spool_price_for_historical_status(
            conn,
            &spool.spool.id,
            next_status,
            "PRINT_JOB_USAGE",
        )?;
        return insert_json_history_event(
            conn,
            &spool.spool.id,
            "PRINT_JOB_RECORDED",
            json!({
                "printer_id": printer_id,
                "used_grams": used_grams,
                "remaining_g": measured_filament_g,
                "job_name": null,
                "success": true,
            }),
        );
    }

    if baseline != Some(measured_filament_g) {
        return update_measured_total_weight_in_transaction(
            conn,
            spool,
            "manual-entry",
            "Manual Entry",
            "MANUAL",
            measured_total_g,
            WeightSource::Manual,
        );
    }

    Ok(())
}

pub(super) fn default_spool_tare_for_vendor(vendor: Option<&str>) -> Option<i64> {
    let normalized = vendor.unwrap_or("").trim().to_ascii_lowercase();
    if normalized.contains("bambu") {
        return Some(250);
    }
    if normalized.contains("esun") {
        return Some(224);
    }
    None
}

pub(super) fn resolve_spool_tare_weight_g(explicit_tare: Option<i64>, vendor: Option<&str>) -> i64 {
    explicit_tare
        .or_else(|| default_spool_tare_for_vendor(vendor))
        .unwrap_or(0)
        .max(0)
}
