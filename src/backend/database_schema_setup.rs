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
use super::database_result::{InventoryError, InventoryResult};
use super::database_schema::{
    ensure_database_quick_check, ensure_supported_schema_version, CURRENT_SCHEMA_VERSION,
};
use super::database_spool_price_lock::backfill_historical_spool_price_locks;
use super::database_spool_schema::{
    ensure_spool_home_location_schema, ensure_spool_identity_schema, ensure_spool_lifecycle_schema,
    ensure_spool_weight_schema,
};
use super::database_trusted_lan_schema::ensure_trusted_lan_schema;

const BASELINE_SCHEMA_VERSION: i64 = 1;

#[derive(Clone, Copy)]
struct StructuralMigration {
    from_version: i64,
    name: &'static str,
    sql: &'static str,
    to_version: i64,
}

// This is the authoritative runtime order for versioned schema migrations.
// Published rows are append-only; see docs/DATABASE_MIGRATIONS.md.
const STRUCTURAL_MIGRATIONS: &[StructuralMigration] = &[
    StructuralMigration {
        from_version: 1,
        name: "003_library_domain_revisions.sql",
        sql: include_str!("../database/migrations/003_library_domain_revisions.sql"),
        to_version: 2,
    },
    StructuralMigration {
        from_version: 2,
        name: "004_inventory_location_objects.sql",
        sql: include_str!("../database/migrations/004_inventory_location_objects.sql"),
        to_version: 3,
    },
    StructuralMigration {
        from_version: 3,
        name: "005_purchase_receipt_metadata.sql",
        sql: include_str!("../database/migrations/005_purchase_receipt_metadata.sql"),
        to_version: 4,
    },
    StructuralMigration {
        from_version: 4,
        name: "006_filament_price_standards.sql",
        sql: include_str!("../database/migrations/006_filament_price_standards.sql"),
        to_version: 5,
    },
    StructuralMigration {
        from_version: 5,
        name: "007_catalog_refresh_jobs.sql",
        sql: include_str!("../database/migrations/007_catalog_refresh_jobs.sql"),
        to_version: 6,
    },
];

pub(crate) fn apply_schema_migrations(conn: &Connection, schema_sql: &str) -> InventoryResult<()> {
    let schema_version = ensure_supported_schema_version(conn)?;
    ensure_database_quick_check(conn)?;
    migrate_structural_schema(conn, schema_sql, schema_version)?;

    // Catalog seeding owns its own transaction and remains a recurring maintenance
    // step so bundled catalog revisions still reach already-versioned databases.
    apply_seed_catalog(conn)?;
    backfill_official_bambu_composite_swatches(conn)?;
    backfill_historical_spool_price_locks(conn)?;
    Ok(())
}

fn migrate_structural_schema(
    conn: &Connection,
    schema_sql: &str,
    schema_version: i64,
) -> InventoryResult<()> {
    validate_structural_migration_sequence()?;
    if schema_version == CURRENT_SCHEMA_VERSION {
        return Ok(());
    }
    if schema_version != 0 && schema_version < BASELINE_SCHEMA_VERSION {
        return Err(InventoryError::Db(format!(
            "No database migration path from schema version {schema_version} to {CURRENT_SCHEMA_VERSION}"
        )));
    }

    let transaction = conn.unchecked_transaction()?;
    let mut migrated_version = schema_version;
    if schema_version == 0 {
        apply_structural_baseline(&transaction, schema_sql)?;
        migrated_version = BASELINE_SCHEMA_VERSION;
        set_schema_version(&transaction, migrated_version)?;
    }
    for migration in STRUCTURAL_MIGRATIONS {
        if migration.to_version <= migrated_version {
            continue;
        }
        if migration.from_version != migrated_version {
            return Err(InventoryError::Db(format!(
                "No database migration path from schema version {migrated_version} to {} before {}",
                migration.to_version, migration.name
            )));
        }
        transaction.execute_batch(migration.sql)?;
        migrated_version = migration.to_version;
        set_schema_version(&transaction, migrated_version)?;
    }
    if migrated_version != CURRENT_SCHEMA_VERSION {
        return Err(InventoryError::Db(format!(
            "No database migration path from schema version {migrated_version} to {CURRENT_SCHEMA_VERSION}"
        )));
    }
    transaction.commit()?;
    Ok(())
}

fn set_schema_version(conn: &Connection, version: i64) -> InventoryResult<()> {
    conn.execute_batch(&format!("PRAGMA user_version = {version};"))?;
    Ok(())
}

fn validate_structural_migration_sequence() -> InventoryResult<()> {
    let mut expected_from_version = BASELINE_SCHEMA_VERSION;
    for migration in STRUCTURAL_MIGRATIONS {
        if migration.from_version != expected_from_version
            || migration.to_version != migration.from_version + 1
            || migration.name.trim().is_empty()
            || migration.sql.trim().is_empty()
        {
            return Err(InventoryError::Db(format!(
                "Invalid structural migration sequence at {} ({} -> {})",
                migration.name, migration.from_version, migration.to_version
            )));
        }
        expected_from_version = migration.to_version;
    }
    if expected_from_version != CURRENT_SCHEMA_VERSION {
        return Err(InventoryError::Db(format!(
            "Structural migration sequence ends at schema version {expected_from_version}, expected {CURRENT_SCHEMA_VERSION}"
        )));
    }
    Ok(())
}

fn apply_structural_baseline(conn: &Connection, schema_sql: &str) -> InventoryResult<()> {
    conn.execute_batch(schema_sql)?;
    ensure_catalog_lifecycle_columns(conn)?;
    ensure_catalog_seed_columns(conn)?;
    ensure_spool_lifecycle_schema(conn)?;
    ensure_spool_weight_schema(conn)?;
    ensure_spool_identity_schema(conn)?;
    ensure_spool_home_location_schema(conn)?;
    ensure_borrowed_in_schema(conn)?;
    ensure_printer_external_slot_schema(conn)?;
    ensure_printer_slot_rfid_override_schema(conn)?;
    ensure_printer_slot_live_cache_schema(conn)?;
    ensure_trusted_lan_schema(conn)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        apply_schema_migrations, validate_structural_migration_sequence, BASELINE_SCHEMA_VERSION,
        STRUCTURAL_MIGRATIONS,
    };
    use crate::backend::database_locations::{ensure_location, list_locations, rename_location};
    use crate::backend::database_schema::{
        database_schema_version, table_has_column, CURRENT_SCHEMA_VERSION,
    };
    use rusqlite::Connection;

    const CURRENT_SCHEMA_SQL: &str = include_str!("../database/schema.sql");
    const LEGACY_INIT_SQL: &str = include_str!("../database/migrations/001_init.sql");
    const LEGACY_SYNC_QUEUE_SQL: &str = include_str!("../database/migrations/002_sync_queue.sql");

    #[test]
    fn structural_migration_registry_is_contiguous_and_current() {
        validate_structural_migration_sequence().expect("validate migration registry");
        assert_eq!(BASELINE_SCHEMA_VERSION, 1);
        let first = STRUCTURAL_MIGRATIONS.first().expect("first migration");
        let last = STRUCTURAL_MIGRATIONS.last().expect("last migration");
        assert_eq!(first.name, "003_library_domain_revisions.sql");
        assert_eq!(first.from_version, BASELINE_SCHEMA_VERSION);
        assert_eq!(last.name, "007_catalog_refresh_jobs.sql");
        assert_eq!(last.to_version, CURRENT_SCHEMA_VERSION);
    }

    #[test]
    fn new_database_is_versioned_and_structural_schema_is_not_replayed() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        assert_eq!(
            database_schema_version(&conn).expect("read initial version"),
            0
        );

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("apply current schema");
        assert_eq!(
            database_schema_version(&conn).expect("read current version"),
            CURRENT_SCHEMA_VERSION
        );
        assert!(
            table_has_column(&conn, "filament_spools", "rfid_tag").expect("inspect current schema")
        );
        for column in ["purchase_currency", "supplier_reference"] {
            assert!(
                table_has_column(&conn, "filament_spools", column)
                    .expect("inspect purchase receipt metadata"),
                "missing filament_spools.{column}"
            );
        }
        for column in ["purchase_price_batch_locked", "purchase_price_source"] {
            assert!(
                table_has_column(&conn, "filament_spools", column)
                    .expect("inspect filament price-standard metadata"),
                "missing filament_spools.{column}"
            );
        }
        for column in ["archived_at", "created_at", "updated_at"] {
            assert!(
                table_has_column(&conn, "inventory_locations", column)
                    .expect("inspect location metadata"),
                "missing inventory_locations.{column}"
            );
        }

        let schema_cookie_before: i64 = conn
            .query_row("PRAGMA schema_version", [], |row| row.get(0))
            .expect("read schema cookie before second apply");
        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("reapply current schema");
        let schema_cookie_after: i64 = conn
            .query_row("PRAGMA schema_version", [], |row| row.get(0))
            .expect("read schema cookie after second apply");

        assert_eq!(schema_cookie_after, schema_cookie_before);
        assert_eq!(
            database_schema_version(&conn).expect("read idempotent version"),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn historical_unversioned_database_upgrades_to_current_baseline() {
        let conn = Connection::open_in_memory().expect("open historical database");
        conn.execute_batch(LEGACY_INIT_SQL)
            .expect("apply historical initial migration");
        conn.execute_batch(LEGACY_SYNC_QUEUE_SQL)
            .expect("apply historical sync migration");
        conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('legacy_master', 'PLA', 'Legacy', 'Blue', 1000, 'Manual')",
            [],
        )
        .expect("insert historical catalog row");
        conn.execute(
            "INSERT INTO filament_spools (
                id, master_id, qr_code, status, initial_weight_g, current_weight_g, remaining_g
             ) VALUES ('legacy_spool', 'legacy_master', 'legacy-qr', 'IN_STOCK', 1000, 700, 700)",
            [],
        )
        .expect("insert historical spool");

        assert_eq!(
            database_schema_version(&conn).expect("read legacy version"),
            0
        );
        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade historical schema");

        assert_eq!(
            database_schema_version(&conn).expect("read upgraded version"),
            CURRENT_SCHEMA_VERSION
        );
        let preserved: (String, i64) = conn
            .query_row(
                "SELECT ownership_type, remaining_g FROM filament_spools WHERE id = 'legacy_spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read preserved historical spool");
        assert_eq!(preserved, ("OWNED".to_string(), 700));
        assert!(
            table_has_column(&conn, "ams_slots", "live_cache_cleared_at")
                .expect("inspect upgraded schema")
        );
    }

    #[test]
    fn version_one_database_upgrades_revisions_and_active_spool_indexes() {
        let conn = Connection::open_in_memory().expect("open version-one database");
        conn.execute_batch(CURRENT_SCHEMA_SQL)
            .expect("apply version-one baseline tables");
        conn.execute_batch(
            "DROP INDEX IF EXISTS idx_spools_active_updated_id;
             DROP INDEX IF EXISTS idx_filament_spools_rfid_tag_normalized;
             INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('v1_master', 'PLA', 'Legacy', 'Orange', 1000, 'Manual');
             PRAGMA user_version = 1;",
        )
        .expect("prepare version-one database");

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade version-one database");

        assert_eq!(
            database_schema_version(&conn).expect("read upgraded version"),
            CURRENT_SCHEMA_VERSION
        );
        for index_name in [
            "idx_spools_active_updated_id",
            "idx_filament_spools_rfid_tag_normalized",
        ] {
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
                    [index_name],
                    |row| row.get(0),
                )
                .expect("read migrated index");
            assert_eq!(count, 1, "missing migrated index {index_name}");
        }

        let inventory_before: i64 = conn
            .query_row(
                "SELECT revision FROM library_domain_revisions WHERE domain = 'inventory'",
                [],
                |row| row.get(0),
            )
            .expect("read initial inventory revision");
        conn.execute(
            "INSERT INTO filament_spools (id, master_id, status)
             VALUES ('v2_spool', 'v1_master', 'IN_STOCK')",
            [],
        )
        .expect("insert spool after migration");
        let inventory_after: i64 = conn
            .query_row(
                "SELECT revision FROM library_domain_revisions WHERE domain = 'inventory'",
                [],
                |row| row.get(0),
            )
            .expect("read bumped inventory revision");
        assert_eq!(inventory_after, inventory_before + 1);
    }

    #[test]
    fn version_two_location_ids_and_references_survive_object_migration() {
        let conn = Connection::open_in_memory().expect("open version-two database");
        conn.execute_batch(CURRENT_SCHEMA_SQL)
            .expect("apply baseline tables");
        conn.execute_batch(include_str!(
            "../database/migrations/003_library_domain_revisions.sql"
        ))
        .expect("apply version-two migration");
        conn.execute_batch(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('legacy-master', 'PLA', 'Basic', 'Blue', 1000, 'Manual');
             INSERT INTO inventory_locations (id, name, type)
             VALUES ('Shelf A', 'Shelf A', 'SHELF');
             INSERT INTO filament_spools (
                id, master_id, status, location_id, home_location_id
             ) VALUES ('legacy-spool', 'legacy-master', 'IN_STOCK', 'Shelf A', 'Shelf A');
             PRAGMA user_version = 2;",
        )
        .expect("prepare version-two location data");

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade version-two database");

        let preserved: (String, String, String, String, String) = conn
            .query_row(
                "SELECT l.id, l.name, l.type, s.location_id, s.home_location_id
                 FROM inventory_locations l
                 JOIN filament_spools s ON s.location_id = l.id
                 WHERE s.id = 'legacy-spool'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .expect("read preserved location references");
        assert_eq!(
            preserved,
            (
                "Shelf A".to_string(),
                "Shelf A".to_string(),
                "SHELF".to_string(),
                "Shelf A".to_string(),
                "Shelf A".to_string(),
            )
        );
        let metadata_present: bool = conn
            .query_row(
                "SELECT created_at IS NOT NULL AND updated_at IS NOT NULL
                 FROM inventory_locations WHERE id = 'Shelf A'",
                [],
                |row| row.get(0),
            )
            .expect("read migrated timestamps");
        assert!(metadata_present);

        assert_eq!(
            ensure_location(&conn, "  shelf   a ").expect("reuse legacy shelf"),
            "Shelf A"
        );
        let renamed =
            rename_location(&conn, "Shelf A", "Archive Shelf").expect("rename legacy shelf");
        assert_eq!(renamed.id, "Shelf A");
        assert_eq!(renamed.name, "Archive Shelf");
        assert!(list_locations(&conn, false)
            .expect("list selectable locations")
            .iter()
            .any(|row| row.id == "Shelf A" && row.location_type == "GENERIC"));
        let spool_fk: (String, String) = conn
            .query_row(
                "SELECT location_id, home_location_id
                 FROM filament_spools WHERE id = 'legacy-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read references after rename");
        assert_eq!(spool_fk, ("Shelf A".to_string(), "Shelf A".to_string()));
    }

    #[test]
    fn version_three_purchase_values_survive_receipt_metadata_migration() {
        let conn = Connection::open_in_memory().expect("open version-three database");
        conn.execute_batch(CURRENT_SCHEMA_SQL)
            .expect("apply baseline tables");
        conn.execute_batch(include_str!(
            "../database/migrations/003_library_domain_revisions.sql"
        ))
        .expect("apply version-two migration");
        conn.execute_batch(include_str!(
            "../database/migrations/004_inventory_location_objects.sql"
        ))
        .expect("apply version-three migration");
        conn.execute_batch(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('receipt-master', 'PLA', 'Basic', 'Green', 1000, 'Manual');
             INSERT INTO filament_spools (
                id, master_id, status, purchase_date, purchase_price, batch_code
             ) VALUES (
                'receipt-spool', 'receipt-master', 'IN_STOCK', '2026-08-01', 249.5, 'legacy-batch'
             );
             PRAGMA user_version = 3;",
        )
        .expect("prepare version-three receipt data");

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade version-three database");

        assert_eq!(
            database_schema_version(&conn).expect("read upgraded version"),
            CURRENT_SCHEMA_VERSION
        );
        let preserved = conn
            .query_row(
                "SELECT purchase_date, purchase_price, batch_code,
                        purchase_currency, supplier_reference
                 FROM filament_spools WHERE id = 'receipt-spool'",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<f64>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                        row.get::<_, Option<String>>(4)?,
                    ))
                },
            )
            .expect("read migrated receipt data");
        assert_eq!(
            preserved,
            (
                Some("2026-08-01".to_string()),
                Some(249.5),
                Some("legacy-batch".to_string()),
                None,
                None,
            )
        );
        assert_eq!(
            conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                .expect("run quick check"),
            "ok"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get::<_, i64>(0)
            })
            .expect("check foreign keys"),
            0
        );
    }

    #[test]
    fn version_four_prices_are_backfilled_and_historical_locks_preserve_audit_data() {
        let conn = Connection::open_in_memory().expect("open version-four database");
        conn.execute_batch(CURRENT_SCHEMA_SQL)
            .expect("apply baseline tables");
        for migration in [
            include_str!("../database/migrations/003_library_domain_revisions.sql"),
            include_str!("../database/migrations/004_inventory_location_objects.sql"),
            include_str!("../database/migrations/005_purchase_receipt_metadata.sql"),
        ] {
            conn.execute_batch(migration)
                .expect("apply historical structural migration");
        }
        conn.execute_batch(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('price-master', 'PETG', 'Basic', 'Black', 1000, 'eSUN');
             INSERT INTO filament_spools (
                id, master_id, status, purchase_price, purchase_currency, updated_at
             ) VALUES
                ('priced-spool', 'price-master', 'IN_STOCK', 229.0, 'NOK', '2026-01-02 03:04:05'),
                ('unpriced-spool', 'price-master', 'IN_STOCK', NULL, NULL, '2026-01-02 03:04:05'),
                ('historical-empty', 'price-master', 'EMPTY', NULL, NULL, '2026-01-02 03:04:05'),
                ('historical-lost', 'price-master', ' lost ', NULL, NULL, '2026-01-02 03:04:05'),
                ('historical-missing', 'price-master', 'missing', NULL, NULL, '2026-01-02 03:04:05'),
                ('historical-deleted', 'price-master', 'deleted', NULL, NULL, '2026-01-02 03:04:05'),
                ('historical-archived', 'price-master', 'archived', NULL, NULL, '2026-01-02 03:04:05');
             INSERT INTO spool_history_events (
                id, spool_id, event_type, payload_json, created_at
             ) VALUES (
                'preserved-price-history', 'historical-empty', 'MARKED_EMPTY', '{}',
                '2026-01-02 03:04:05'
             );
             PRAGMA user_version = 4;",
        )
        .expect("prepare version-four price data");

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade version-four database");

        let priced: (bool, Option<String>) = conn
            .query_row(
                "SELECT purchase_price_batch_locked, purchase_price_source
                 FROM filament_spools WHERE id = 'priced-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read priced spool migration fields");
        assert_eq!(priced, (false, Some("MANUAL".to_string())));
        let unpriced: (bool, Option<String>) = conn
            .query_row(
                "SELECT purchase_price_batch_locked, purchase_price_source
                 FROM filament_spools WHERE id = 'unpriced-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read unpriced spool migration fields");
        assert_eq!(unpriced, (false, None));

        let spool_states = || {
            let mut statement = conn
                .prepare(
                    "SELECT id, purchase_price_batch_locked, updated_at
                     FROM filament_spools
                     ORDER BY id",
                )
                .expect("prepare migrated spool state query");
            statement
                .query_map([], |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                })
                .expect("query migrated spool states")
                .collect::<Result<Vec<_>, _>>()
                .expect("collect migrated spool states")
        };
        assert_eq!(
            spool_states(),
            vec![
                (
                    "historical-archived".to_string(),
                    true,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "historical-deleted".to_string(),
                    true,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "historical-empty".to_string(),
                    true,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "historical-lost".to_string(),
                    true,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "historical-missing".to_string(),
                    true,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "priced-spool".to_string(),
                    false,
                    "2026-01-02 03:04:05".to_string(),
                ),
                (
                    "unpriced-spool".to_string(),
                    false,
                    "2026-01-02 03:04:05".to_string(),
                ),
            ]
        );
        let history_counts = || {
            conn.query_row(
                "SELECT COUNT(*),
                        SUM(event_type = 'PURCHASE_PRICE_BATCH_LOCK_UPDATED')
                 FROM spool_history_events",
                [],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .expect("read migration history counts")
        };
        assert_eq!(history_counts(), (1, 0));

        apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("reapply upgraded price schema");
        assert_eq!(history_counts(), (1, 0));
        assert!(spool_states()
            .iter()
            .all(|(_, _, updated_at)| updated_at == "2026-01-02 03:04:05"));
        assert_eq!(
            database_schema_version(&conn).expect("read upgraded version"),
            CURRENT_SCHEMA_VERSION
        );
    }

    #[test]
    fn catalog_job_migration_preserves_every_supported_version_and_reapplies_safely() {
        for starting_version in 0..CURRENT_SCHEMA_VERSION {
            let conn =
                Connection::open_in_memory().expect("open historical job migration database");
            super::apply_structural_baseline(&conn, CURRENT_SCHEMA_SQL).expect("apply baseline");
            for migration in STRUCTURAL_MIGRATIONS {
                if migration.to_version <= starting_version {
                    conn.execute_batch(migration.sql)
                        .expect("apply historical migration");
                }
            }
            super::set_schema_version(&conn, starting_version).expect("set historical version");
            conn.execute_batch(
                "INSERT INTO filament_master_list (id, material, filament_name, color_name, default_weight, vendor)
                 VALUES ('preserved-job-master', 'PLA', 'Migration fixture', 'Blue', 1000, 'Manual');
                 INSERT INTO filament_spools (id, master_id, status, remaining_g)
                 VALUES ('preserved-job-spool', 'preserved-job-master', 'IN_STOCK', 731);",
            ).expect("seed historical data");
            apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("upgrade job storage");
            assert!(table_has_column(&conn, "catalog_refresh_jobs", "result_json").unwrap());
            assert_eq!(
                database_schema_version(&conn).unwrap(),
                CURRENT_SCHEMA_VERSION
            );
            assert_eq!(
                conn.query_row(
                    "SELECT remaining_g FROM filament_spools WHERE id = 'preserved-job-spool'",
                    [],
                    |row| row.get::<_, i64>(0)
                )
                .unwrap(),
                731
            );
            assert_eq!(
                conn.query_row("PRAGMA quick_check", [], |row| row.get::<_, String>(0))
                    .unwrap(),
                "ok"
            );
            assert_eq!(
                conn.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
                0
            );
            let cookie: i64 = conn
                .query_row("PRAGMA schema_version", [], |row| row.get(0))
                .unwrap();
            apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL).expect("reapply job migration");
            assert_eq!(
                conn.query_row("PRAGMA schema_version", [], |row| row.get::<_, i64>(0))
                    .unwrap(),
                cookie
            );
        }
    }

    #[test]
    fn failed_structural_baseline_rolls_back_schema_and_version() {
        let conn = Connection::open_in_memory().expect("open rollback database");
        conn.execute_batch(
            "CREATE TABLE preserved (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
             INSERT INTO preserved (id, value) VALUES (1, 'before');",
        )
        .expect("create preserved data");

        let error = apply_schema_migrations(
            &conn,
            "CREATE TABLE partial_migration (id INTEGER PRIMARY KEY); invalid SQL;",
        )
        .expect_err("invalid baseline should fail");
        assert!(error.to_string().contains("syntax error"));
        assert_eq!(
            database_schema_version(&conn).expect("read rolled back version"),
            0
        );

        let partial_table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'partial_migration'",
                [],
                |row| row.get(0),
            )
            .expect("check partial migration rollback");
        assert_eq!(partial_table_count, 0);
        let preserved_value: String = conn
            .query_row("SELECT value FROM preserved WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("read preserved data");
        assert_eq!(preserved_value, "before");
    }

    #[test]
    fn newer_schema_is_rejected_before_structural_or_catalog_writes() {
        let conn = Connection::open_in_memory().expect("open future database");
        conn.execute_batch(&format!(
            "CREATE TABLE future_only (id INTEGER PRIMARY KEY);
             INSERT INTO future_only (id) VALUES (1);
             PRAGMA user_version = {};",
            CURRENT_SCHEMA_VERSION + 1
        ))
        .expect("create future schema");
        let schema_cookie_before: i64 = conn
            .query_row("PRAGMA schema_version", [], |row| row.get(0))
            .expect("read future schema cookie");

        let error = apply_schema_migrations(&conn, CURRENT_SCHEMA_SQL)
            .expect_err("future schema should be rejected");
        assert!(error
            .to_string()
            .contains("newer than the supported version"));
        assert_eq!(
            database_schema_version(&conn).expect("read untouched future version"),
            CURRENT_SCHEMA_VERSION + 1
        );
        let schema_cookie_after: i64 = conn
            .query_row("PRAGMA schema_version", [], |row| row.get(0))
            .expect("reread future schema cookie");
        assert_eq!(schema_cookie_after, schema_cookie_before);
        let future_row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM future_only", [], |row| row.get(0))
            .expect("read future data");
        assert_eq!(future_row_count, 1);
    }
}
