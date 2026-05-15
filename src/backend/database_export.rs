use super::database_text::{escape_csv, escape_json};
use super::filament_database::{InventoryResult, SpoolWithMasterRow};

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
