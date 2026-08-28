use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};

use super::database_catalog_inputs::SourceCatalogEntryInput;
use super::database_catalog_lifecycle::reactivate_seen_vendor_material_in_transaction;
use super::database_catalog_schema::{
    ensure_catalog_lifecycle_columns, ensure_catalog_seed_columns,
};
use super::database_ids::new_id;
use super::database_result::{InventoryError, InventoryResult};

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SourceCatalogImportStats {
    pub inserted_count: i64,
    pub updated_count: i64,
    pub skipped_user_edited_count: i64,
    pub skipped_vendor_conflict_count: i64,
    pub reactivated_count: i64,
}

impl SourceCatalogImportStats {
    pub fn imported_count(&self) -> i64 {
        self.inserted_count + self.updated_count
    }
}

pub(crate) fn import_source_vendor_catalog(
    conn: &Connection,
    vendor: &str,
    material: &str,
    refresh_started_at: &str,
    entries: &[SourceCatalogEntryInput<'_>],
) -> InventoryResult<SourceCatalogImportStats> {
    ensure_catalog_lifecycle_columns(conn)?;
    ensure_catalog_seed_columns(conn)?;

    let transaction = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let stats = import_source_vendor_catalog_in_transaction(
        &transaction,
        vendor,
        material,
        refresh_started_at,
        entries,
    )?;
    transaction.commit()?;
    Ok(stats)
}

fn import_source_vendor_catalog_in_transaction(
    conn: &Connection,
    vendor: &str,
    material: &str,
    refresh_started_at: &str,
    entries: &[SourceCatalogEntryInput<'_>],
) -> InventoryResult<SourceCatalogImportStats> {
    let vendor = vendor.trim();
    let material = material.trim();
    if vendor.is_empty() || material.is_empty() || refresh_started_at.trim().is_empty() {
        return Err(invalid_source_entry(
            "vendor, material and refresh start time are required",
        ));
    }
    if entries.is_empty() {
        return Err(invalid_source_entry(
            "at least one complete source entry is required",
        ));
    }

    let mut stats = SourceCatalogImportStats::default();
    for entry in entries {
        let entry_material = entry.material.trim();
        let filament_name = entry.filament_name.trim();
        let color_name = entry.color_name.trim();
        let product_url = entry.product_url.trim();
        if entry_material.is_empty()
            || filament_name.is_empty()
            || color_name.is_empty()
            || product_url.is_empty()
            || entry.default_weight <= 0
        {
            return Err(invalid_source_entry(
                "material, filament name, color, product URL and a positive default weight are required",
            ));
        }
        if !entry_material.eq_ignore_ascii_case(material) {
            return Err(invalid_source_entry(&format!(
                "entry material '{entry_material}' does not match requested material '{material}'",
            )));
        }

        let existing: Option<(String, String, bool)> = conn
            .query_row(
                "SELECT id, vendor, catalog_user_edited != 0
                 FROM filament_master_list
                 WHERE material = ?1
                   AND filament_name = ?2
                   AND color_name = ?3
                 LIMIT 1",
                params![entry_material, filament_name, color_name],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;

        if let Some((existing_id, existing_vendor, user_edited)) = existing {
            if !existing_vendor.eq_ignore_ascii_case(vendor) {
                stats.skipped_vendor_conflict_count += 1;
                continue;
            }
            if user_edited {
                stats.skipped_user_edited_count += 1;
                continue;
            }

            conn.execute(
                "UPDATE filament_master_list
                 SET hex_color = COALESCE(?1, hex_color),
                     product_url = ?2,
                     default_weight = CASE
                         WHEN vendor = 'Bambu' COLLATE NOCASE THEN default_weight
                         ELSE ?3
                     END,
                     catalog_source = CASE
                         WHEN catalog_source = 'unknown' THEN 'scraped'
                         ELSE catalog_source
                     END,
                     last_seen_at = datetime('now'),
                     updated_at = datetime('now')
                 WHERE id = ?4
                   AND vendor = ?5 COLLATE NOCASE
                   AND catalog_user_edited = 0",
                params![
                    entry.hex_color,
                    product_url,
                    entry.default_weight,
                    existing_id,
                    vendor
                ],
            )?;
            stats.updated_count += 1;
            continue;
        }

        conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, hex_color, product_url,
                default_weight, vendor, catalog_source, catalog_user_edited, last_seen_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'scraped', 0, datetime('now'))",
            params![
                new_id(),
                entry_material,
                filament_name,
                color_name,
                entry.hex_color,
                product_url,
                entry.default_weight,
                vendor
            ],
        )?;
        stats.inserted_count += 1;
    }

    stats.reactivated_count =
        reactivate_seen_vendor_material_in_transaction(conn, vendor, material, refresh_started_at)?;
    Ok(stats)
}

fn invalid_source_entry(message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "INVALID_CATALOG_SOURCE_ENTRY",
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{import_source_vendor_catalog, SourceCatalogImportStats};
    use crate::backend::database_catalog_inputs::SourceCatalogEntryInput;
    use rusqlite::{params, Connection};

    fn database() -> Connection {
        let connection = Connection::open_in_memory().expect("open source catalog database");
        connection
            .execute_batch(include_str!("../database/schema.sql"))
            .expect("apply schema");
        connection
    }

    fn insert_existing(
        connection: &Connection,
        id: &str,
        vendor: &str,
        user_edited: bool,
        discontinued: bool,
    ) {
        connection
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, hex_color, product_url,
                    default_weight, vendor, catalog_source, catalog_user_edited,
                    last_seen_at, is_discontinued, discontinued_at
                 ) VALUES (?1, 'PLA', 'PLA Basic', 'Black', '#111111',
                           'https://old.example/pla', 750, ?2, 'manual', ?3,
                           '2026-08-01 00:00:00', ?4,
                           CASE WHEN ?4 != 0 THEN '2026-08-01 00:00:00' ELSE NULL END)",
                params![id, vendor, i64::from(user_edited), i64::from(discontinued)],
            )
            .expect("insert existing source row");
    }

    fn source_entry() -> SourceCatalogEntryInput<'static> {
        SourceCatalogEntryInput {
            material: "PLA",
            filament_name: "PLA Basic",
            color_name: "Black",
            hex_color: Some("#000000"),
            product_url: "https://new.example/pla",
            default_weight: 1000,
        }
    }

    #[test]
    fn source_import_preserves_user_edited_rows_and_lifecycle() {
        let connection = database();
        insert_existing(&connection, "edited", "eSUN", true, true);

        let stats = import_source_vendor_catalog(
            &connection,
            "eSUN",
            "PLA",
            "2026-08-28 00:00:00",
            &[source_entry()],
        )
        .expect("import source catalog");
        assert_eq!(
            stats,
            SourceCatalogImportStats {
                skipped_user_edited_count: 1,
                ..SourceCatalogImportStats::default()
            }
        );

        let row: (String, String, i64, i64, Option<String>, String) = connection
            .query_row(
                "SELECT hex_color, product_url, default_weight, is_discontinued,
                        discontinued_at, last_seen_at
                 FROM filament_master_list WHERE id = 'edited'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .expect("read edited row");
        assert_eq!(
            row,
            (
                "#111111".to_string(),
                "https://old.example/pla".to_string(),
                750,
                1,
                Some("2026-08-01 00:00:00".to_string()),
                "2026-08-01 00:00:00".to_string(),
            )
        );
    }

    #[test]
    fn source_import_skips_vendor_identity_collisions() {
        let connection = database();
        insert_existing(&connection, "generic", "Generic", false, true);

        let stats = import_source_vendor_catalog(
            &connection,
            "eSUN",
            "PLA",
            "2026-08-28 00:00:00",
            &[source_entry()],
        )
        .expect("import source catalog");
        assert_eq!(stats.skipped_vendor_conflict_count, 1);
        assert_eq!(stats.imported_count(), 0);
        assert_eq!(stats.reactivated_count, 0);

        let row: (String, String, i64) = connection
            .query_row(
                "SELECT vendor, product_url, is_discontinued
                 FROM filament_master_list WHERE id = 'generic'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("read vendor conflict");
        assert_eq!(
            row,
            (
                "Generic".to_string(),
                "https://old.example/pla".to_string(),
                1,
            )
        );
    }

    #[test]
    fn source_import_counts_only_the_reactivation_transition() {
        let connection = database();
        insert_existing(&connection, "discontinued", "eSUN", false, true);

        let stats = import_source_vendor_catalog(
            &connection,
            "eSUN",
            "PLA",
            "2026-08-28 00:00:00",
            &[source_entry()],
        )
        .expect("import source catalog");
        assert_eq!(stats.updated_count, 1);
        assert_eq!(stats.reactivated_count, 1);

        let row: (i64, Option<String>, String, i64) = connection
            .query_row(
                "SELECT is_discontinued, discontinued_at, product_url, default_weight
                 FROM filament_master_list WHERE id = 'discontinued'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read reactivated row");
        assert_eq!(row, (0, None, "https://new.example/pla".to_string(), 1000,));
    }

    #[test]
    fn source_import_preserves_existing_bambu_default_weight() {
        let connection = database();
        insert_existing(&connection, "bambu", "Bambu", false, false);

        let stats = import_source_vendor_catalog(
            &connection,
            "Bambu",
            "PLA",
            "2026-08-28 00:00:00",
            &[source_entry()],
        )
        .expect("import Bambu source catalog");
        assert_eq!(stats.updated_count, 1);

        let default_weight: i64 = connection
            .query_row(
                "SELECT default_weight FROM filament_master_list WHERE id = 'bambu'",
                [],
                |row| row.get(0),
            )
            .expect("read Bambu default weight");
        assert_eq!(default_weight, 750);
    }

    #[test]
    fn source_import_rolls_back_earlier_rows_after_late_validation_error() {
        let connection = database();
        insert_existing(&connection, "rollback", "eSUN", false, true);
        let invalid_entry = SourceCatalogEntryInput {
            material: "PETG",
            filament_name: "PETG Basic",
            color_name: "Black",
            hex_color: Some("#000000"),
            product_url: "https://new.example/petg",
            default_weight: 1000,
        };

        let error = import_source_vendor_catalog(
            &connection,
            "eSUN",
            "PLA",
            "2026-08-28 00:00:00",
            &[source_entry(), invalid_entry],
        )
        .expect_err("late invalid entry must roll back import");
        assert!(error
            .to_string()
            .contains("does not match requested material"));

        let row: (String, i64, Option<String>, String) = connection
            .query_row(
                "SELECT product_url, is_discontinued, discontinued_at, last_seen_at
                 FROM filament_master_list WHERE id = 'rollback'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .expect("read rolled back row");
        assert_eq!(
            row,
            (
                "https://old.example/pla".to_string(),
                1,
                Some("2026-08-01 00:00:00".to_string()),
                "2026-08-01 00:00:00".to_string(),
            )
        );
    }
}
