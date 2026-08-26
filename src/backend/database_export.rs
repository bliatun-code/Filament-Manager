use rusqlite::Connection;

use super::database_loan_models::SpoolLoanDetailsRow;
use super::database_loan_queries::list_spool_loans_for_direction;
use super::database_result::InventoryResult;
use super::database_spool_models::SpoolWithMasterRow;
use super::database_spool_queries::list_all_spools_with_master;
use super::database_text::escape_csv;

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
        "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source\n",
    );
    for entry in rows {
        let purchase_price = entry
            .spool
            .purchase_price
            .map(|value| value.to_string())
            .unwrap_or_default();
        let initial_weight_g = entry
            .spool
            .initial_weight_g
            .unwrap_or(entry.master.default_weight.max(1));
        let current_weight_g = entry
            .spool
            .current_weight_g
            .or(entry.spool.remaining_g)
            .unwrap_or(initial_weight_g);
        let fields = [
            escape_csv(&entry.spool.id),
            escape_csv(&entry.master.material),
            escape_csv(&entry.master.filament_name),
            escape_csv(&entry.master.color_name),
            escape_csv(&entry.master.vendor),
            escape_csv(&entry.spool.status),
            escape_csv(&entry.spool.ownership_type),
            escape_csv(entry.spool.owner_name.as_deref().unwrap_or("")),
            escape_csv(entry.spool.owner_contact.as_deref().unwrap_or("")),
            escape_csv(entry.spool.ownership_note.as_deref().unwrap_or("")),
            initial_weight_g.to_string(),
            current_weight_g.to_string(),
            entry.spool.remaining_g.unwrap_or(0).to_string(),
            entry
                .spool
                .spool_tare_weight_g
                .map(|value| value.to_string())
                .unwrap_or_default(),
            // Keep the legacy `location` column human-readable for older
            // importers while the structured fields preserve stable identity.
            escape_csv(entry.location_name.as_deref().unwrap_or("")),
            escape_csv(entry.spool.location_id.as_deref().unwrap_or("")),
            escape_csv(entry.location_name.as_deref().unwrap_or("")),
            escape_csv(entry.location_type.as_deref().unwrap_or("")),
            escape_csv(entry.spool.home_location_id.as_deref().unwrap_or("")),
            escape_csv(entry.home_location_name.as_deref().unwrap_or("")),
            escape_csv(entry.home_location_type.as_deref().unwrap_or("")),
            escape_csv(entry.spool.qr_code.as_deref().unwrap_or("")),
            escape_csv(&purchase_price),
            escape_csv(entry.spool.purchase_currency.as_deref().unwrap_or("")),
            escape_csv(entry.spool.purchase_date.as_deref().unwrap_or("")),
            escape_csv(entry.spool.batch_code.as_deref().unwrap_or("")),
            escape_csv(entry.spool.supplier_reference.as_deref().unwrap_or("")),
            entry.spool.purchase_price_batch_locked.to_string(),
            escape_csv(entry.spool.purchase_price_source.as_deref().unwrap_or("")),
        ];
        output.push_str(&fields.join(","));
        output.push('\n');
    }
    Ok(output)
}

pub(crate) fn export_spools_json(rows: &[SpoolWithMasterRow]) -> InventoryResult<String> {
    let output = rows
        .iter()
        .map(|entry| {
            serde_json::json!({
                "spool_id": entry.spool.id,
                "material": entry.master.material,
                "filament_name": entry.master.filament_name,
                "color_name": entry.master.color_name,
                "vendor": entry.master.vendor,
                "status": entry.spool.status,
                "ownership_type": entry.spool.ownership_type,
                "owner_name": entry.spool.owner_name,
                "owner_contact": entry.spool.owner_contact,
                "ownership_note": entry.spool.ownership_note,
                "initial_weight_g": entry.spool.initial_weight_g.unwrap_or(entry.master.default_weight.max(1)),
                "current_weight_g": entry.spool.current_weight_g.or(entry.spool.remaining_g).unwrap_or_else(|| entry.spool.initial_weight_g.unwrap_or(entry.master.default_weight.max(1))),
                "remaining_g": entry.spool.remaining_g.unwrap_or(0),
                "spool_tare_weight_g": entry.spool.spool_tare_weight_g,
                "location": entry.location_name.as_deref().unwrap_or(""),
                "location_id": entry.spool.location_id,
                "location_name": entry.location_name,
                "location_type": entry.location_type,
                "home_location_id": entry.spool.home_location_id,
                "home_location_name": entry.home_location_name,
                "home_location_type": entry.home_location_type,
                "qr_code": entry.spool.qr_code.as_deref().unwrap_or(""),
                "purchase_price": entry.spool.purchase_price,
                "purchase_currency": entry.spool.purchase_currency,
                "purchase_date": entry.spool.purchase_date,
                "batch_code": entry.spool.batch_code,
                "supplier_reference": entry.spool.supplier_reference,
                "purchase_price_batch_locked": entry.spool.purchase_price_batch_locked,
                "purchase_price_source": entry.spool.purchase_price_source,
            })
        })
        .collect::<Vec<_>>();
    serde_json::to_string(&output).map_err(|error| {
        super::database_result::InventoryError::Db(format!(
            "Could not serialize inventory export: {error}"
        ))
    })
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
