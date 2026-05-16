use rusqlite::{params, Connection};

use super::database_ids::new_id;
use super::filament_database::InventoryResult;

pub(crate) fn insert_print_job(
    conn: &Connection,
    printer_id: &str,
    spool_id: &str,
    job_name: Option<&str>,
    material_used_g: i64,
    success: bool,
) -> InventoryResult<String> {
    let id = new_id();
    conn.execute(
        "INSERT INTO print_jobs (
            id, printer_id, spool_id, job_name, started_at, ended_at, material_used_g, success
         ) VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'), ?5, ?6)",
        params![
            id,
            printer_id,
            spool_id,
            job_name,
            material_used_g,
            if success { 1 } else { 0 }
        ],
    )?;
    Ok(id)
}
