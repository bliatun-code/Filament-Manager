use rusqlite::Connection;

use super::database_borrowed_schema::ensure_borrowed_in_schema;
use super::database_catalog_schema::{
    ensure_catalog_lifecycle_columns, ensure_catalog_seed_columns,
};
use super::database_catalog_seed::apply_seed_catalog;
use super::database_catalog_swatch_backfill::backfill_official_bambu_composite_swatches;
use super::database_printer_schema::{
    ensure_printer_external_slot_schema, ensure_printer_slot_live_cache_schema,
    ensure_printer_slot_rfid_override_schema,
};
use super::database_result::InventoryResult;
use super::database_spool_schema::{
    ensure_spool_home_location_schema, ensure_spool_identity_schema, ensure_spool_lifecycle_schema,
    ensure_spool_weight_schema,
};
use super::database_trusted_lan_schema::ensure_trusted_lan_schema;

pub(crate) fn apply_schema_migrations(conn: &Connection, schema_sql: &str) -> InventoryResult<()> {
    conn.execute_batch(schema_sql)?;
    ensure_catalog_lifecycle_columns(conn)?;
    ensure_catalog_seed_columns(conn)?;
    apply_seed_catalog(conn)?;
    ensure_spool_lifecycle_schema(conn)?;
    ensure_spool_weight_schema(conn)?;
    ensure_spool_identity_schema(conn)?;
    ensure_spool_home_location_schema(conn)?;
    ensure_borrowed_in_schema(conn)?;
    ensure_printer_external_slot_schema(conn)?;
    ensure_printer_slot_rfid_override_schema(conn)?;
    ensure_printer_slot_live_cache_schema(conn)?;
    ensure_trusted_lan_schema(conn)?;
    backfill_official_bambu_composite_swatches(conn)?;
    Ok(())
}
