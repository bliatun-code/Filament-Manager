use rusqlite::Connection;

use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_loan_queries::list_spool_loans_for_direction;
use super::database_result::InventoryResult;
use super::database_spool_models::SpoolWithMasterRow;
use super::database_spool_queries::list_all_spools_with_master;
use super::database_text::{escape_csv, escape_json};

pub(crate) fn export_inventory_spools_csv(conn: &Connection) -> InventoryResult<String> {
    let rows = list_all_spools_with_master(conn)?;
    export_spools_csv(&rows)
}

pub(crate) fn export_inventory_spools_json(conn: &Connection) -> InventoryResult<String> {
    let rows = list_all_spools_with_master(conn)?;
    export_spools_json(&rows)
}

pub(crate) fn export_loans_csv_for_direction(
    conn: &Connection,
    include_returned: bool,
    direction: Option<&str>,
) -> InventoryResult<String> {
    let rows = list_spool_loans_for_direction(conn, 20_000, include_returned, direction)?;
    export_loans_csv(&rows)
}

pub(crate) fn export_spools_csv(rows: &[SpoolWithMasterRow]) -> InventoryResult<String> {
    let mut output = String::from(
        "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code\n",
    );
    for entry in rows {
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv(&entry.spool.id),
            escape_csv(&entry.master.material),
            escape_csv(&entry.master.filament_name),
            escape_csv(&entry.master.color_name),
            escape_csv(&entry.spool.status),
            entry.spool.remaining_g.unwrap_or(0),
            escape_csv(entry.spool.location_id.as_deref().unwrap_or("")),
            escape_csv(entry.spool.qr_code.as_deref().unwrap_or("")),
        ));
    }
    Ok(output)
}

pub(crate) fn export_spools_json(rows: &[SpoolWithMasterRow]) -> InventoryResult<String> {
    let mut output = String::from("[");
    for (index, entry) in rows.iter().enumerate() {
        if index > 0 {
            output.push(',');
        }
        output.push_str(&format!(
            "{{\"spool_id\":\"{}\",\"material\":\"{}\",\"filament_name\":\"{}\",\"color_name\":\"{}\",\"status\":\"{}\",\"remaining_g\":{},\"location\":\"{}\",\"qr_code\":\"{}\"}}",
            escape_json(&entry.spool.id),
            escape_json(&entry.master.material),
            escape_json(&entry.master.filament_name),
            escape_json(&entry.master.color_name),
            escape_json(&entry.spool.status),
            entry.spool.remaining_g.unwrap_or(0),
            escape_json(entry.spool.location_id.as_deref().unwrap_or("")),
            escape_json(entry.spool.qr_code.as_deref().unwrap_or("")),
        ));
    }
    output.push(']');
    Ok(output)
}

pub(crate) fn export_loans_csv(rows: &[SpoolLoanDetailsRow]) -> InventoryResult<String> {
    let mut output = String::from(
        "loan_id,spool_id,direction,counterparty,grams_out,lent_at,returned_at,returned_grams,consumed_grams,material,filament,color,vendor,status\n",
    );
    for row in rows {
        output.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
            escape_csv(&row.loan.id),
            escape_csv(&row.loan.spool_id),
            escape_csv(&row.loan.loan_direction),
            escape_csv(&row.loan.counterparty_name),
            row.loan.grams_out,
            escape_csv(&row.loan.lent_at),
            escape_csv(row.loan.returned_at.as_deref().unwrap_or("")),
            row.loan.returned_grams.unwrap_or(0),
            row.loan.consumed_grams.unwrap_or(0),
            escape_csv(row.material.as_deref().unwrap_or("")),
            escape_csv(row.filament_name.as_deref().unwrap_or("")),
            escape_csv(row.color_name.as_deref().unwrap_or("")),
            escape_csv(row.vendor.as_deref().unwrap_or("")),
            escape_csv(row.spool_status.as_deref().unwrap_or("")),
        ));
    }
    Ok(output)
}
