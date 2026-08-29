use super::{
    BambuLiveIntegrationRow, BambuLiveObservedStateRow, BambuLiveTlsIdentityRow, FilamentDatabase,
    LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow, LowStockMaterialOverride, LowStockPolicy,
    ManualMasterInput, MasterCatalogUpdateInput, SpoolRow, TrustedLanSettingsRow,
    FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES,
};
use crate::backend::database_schema::{
    ensure_no_foreign_key_violations, table_has_column, CURRENT_SCHEMA_VERSION,
};
use crate::backend::statistics::{
    FilamentConsumptionRow, InventoryOverview, MonthlyConsumptionPoint,
};
use serde_json::json;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const LEGACY_INIT_MIGRATION_SQL: &str = include_str!("../database/migrations/001_init.sql");
const LEGACY_SYNC_QUEUE_MIGRATION_SQL: &str =
    include_str!("../database/migrations/002_sync_queue.sql");
const EXPECTED_SEEDED_CATALOG_COUNT: i64 = 1106;
const EXPECTED_BAMBU_SEEDED_COUNT: i64 = 316;
const EXPECTED_ESUN_SEEDED_COUNT: i64 = 783;

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-{test_name}-{nanos}.db"))
}

fn seed_all_library_sync_host_caches(
    db: &FilamentDatabase,
    library_id: &str,
    cached_location: &super::InventoryLocationRow,
) -> Result<(), String> {
    db.save_library_sync_cached_snapshot(&LibrarySyncCachedSnapshotRow {
        captured_at: "2026-08-26 10:00:00".to_string(),
        library_id: library_id.to_string(),
        device_name: "Cached Host".to_string(),
        sync_mode: "HOST".to_string(),
        inventory: InventoryOverview {
            total_spools: 0,
            total_owned_spools: 0,
            total_borrowed_in_spools: 0,
            in_use: 0,
            owned_in_use: 0,
            borrowed_in_in_use: 0,
            low_stock: 0,
            owned_low_stock: 0,
            borrowed_in_low_stock: 0,
            low_stock_policy: Default::default(),
            total_consumption_30d: 0,
            owned_consumption_30d: 0,
            borrowed_in_consumption_30d: 0,
            consumption_12m_available: true,
            total_consumption_12m: 0,
            consumption_12m: Vec::new(),
        },
        total_spools: 0,
        in_use: 0,
        low_stock: 0,
        active_loans: 0,
        printers: 0,
    })
    .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_spools(&[])
        .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_locations(std::slice::from_ref(cached_location))
        .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_printers(&[])
        .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_loans(&[])
        .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_consumption(&[])
        .map_err(|error| error.to_string())?;
    db.save_library_sync_cached_wishlist(&[])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn assert_all_library_sync_host_caches_present(db: &FilamentDatabase) -> Result<(), String> {
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    assert!(settings.cached_snapshot.is_some());
    assert!(settings.cached_spools.is_some());
    assert!(settings.cached_printers.is_some());
    assert!(settings.cached_loans.is_some());
    assert!(settings.cached_consumption.is_some());
    assert!(settings.cached_wishlist.is_some());
    assert!(db
        .get_library_sync_cached_locations()
        .map_err(|error| error.to_string())?
        .is_some());
    Ok(())
}

fn assert_all_library_sync_host_caches_cleared(db: &FilamentDatabase) -> Result<(), String> {
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    assert!(settings.cached_snapshot.is_none());
    assert!(settings.cached_spools.is_none());
    assert!(settings.cached_printers.is_none());
    assert!(settings.cached_loans.is_none());
    assert!(settings.cached_consumption.is_none());
    assert!(settings.cached_wishlist.is_none());
    assert!(db
        .get_library_sync_cached_locations()
        .map_err(|error| error.to_string())?
        .is_none());
    Ok(())
}

#[test]
fn read_transaction_keeps_composed_reads_on_one_snapshot() {
    let db_path = temp_db_path("read-transaction-snapshot");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 CREATE TABLE read_snapshot_probe (
                    id INTEGER PRIMARY KEY,
                    value TEXT NOT NULL
                 );
                 INSERT INTO read_snapshot_probe (id, value) VALUES (1, 'before');",
            )
            .map_err(|error| error.to_string())?;

        let (first_count, second_count) = db
            .with_read_transaction(|snapshot| {
                let first_count: i64 = snapshot.conn.query_row(
                    "SELECT COUNT(*) FROM read_snapshot_probe",
                    [],
                    |row| row.get(0),
                )?;

                let writer = rusqlite::Connection::open(&db_path)?;
                writer.execute(
                    "INSERT INTO read_snapshot_probe (id, value) VALUES (2, 'concurrent')",
                    [],
                )?;

                let second_count: i64 = snapshot.conn.query_row(
                    "SELECT COUNT(*) FROM read_snapshot_probe",
                    [],
                    |row| row.get(0),
                )?;
                Ok((first_count, second_count))
            })
            .map_err(|error| error.to_string())?;
        let count_after_commit: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM read_snapshot_probe", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(first_count, 1);
        assert_eq!(second_count, 1);
        assert_eq!(count_after_commit, 2);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("read_transaction_keeps_composed_reads_on_one_snapshot failed: {message}");
    }
}

#[test]
fn catalog_merge_rolls_back_all_references_when_final_delete_fails() {
    let db_path = temp_db_path("catalog-merge-rollback");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, hex_color,
                    default_weight, vendor, catalog_source, catalog_user_edited
                 ) VALUES
                    ('catalog_merge_source', 'PLA', 'Source profile', 'Blue', '#111111',
                     900, 'Source vendor', 'manual', 1),
                    ('catalog_merge_target', 'PETG', 'Target profile', 'Green', '#222222',
                     1000, 'Target vendor', 'manual', 1);

                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g
                 ) VALUES (
                    'catalog_merge_spool', 'catalog_merge_source', 'IN_STOCK', 'OWNED',
                    900, 900, 900
                 );

                 INSERT INTO wishlist_items (
                    id, master_id, material, filament_name, color_name, vendor, status, quantity
                 ) VALUES (
                    'catalog_merge_wishlist', 'catalog_merge_source', 'PLA', 'Source profile',
                    'Blue', 'Source vendor', 'WISHLIST', 1
                 );

                 CREATE TRIGGER fail_catalog_source_delete
                 BEFORE DELETE ON filament_master_list
                 WHEN OLD.id = 'catalog_merge_source'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced catalog source delete failure');
                 END;",
            )
            .map_err(|error| error.to_string())?;

        let error = db
            .update_master_catalog_entry(MasterCatalogUpdateInput {
                master_id: "catalog_merge_source",
                material: "PETG",
                filament_name: "Target profile",
                color_name: "Green",
                hex_color: Some("#ABCDEF"),
                product_url: None,
                vendor: Some("Merged vendor"),
                default_weight: Some(750),
            })
            .expect_err("late delete failure should roll back the catalog merge");
        assert!(error
            .to_string()
            .contains("forced catalog source delete failure"));

        let target: (String, i64, String) = db
            .conn
            .query_row(
                "SELECT hex_color, default_weight, vendor
                 FROM filament_master_list
                 WHERE id = 'catalog_merge_target'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        let source_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list
                 WHERE id = 'catalog_merge_source'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let spool_master: String = db
            .conn
            .query_row(
                "SELECT master_id FROM filament_spools
                 WHERE id = 'catalog_merge_spool'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let wishlist: (String, String, String, String, String) = db
            .conn
            .query_row(
                "SELECT master_id, material, filament_name, color_name, vendor
                 FROM wishlist_items
                 WHERE id = 'catalog_merge_wishlist'",
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
            .map_err(|error| error.to_string())?;

        assert_eq!(
            target,
            ("#222222".to_string(), 1000, "Target vendor".to_string())
        );
        assert_eq!(source_count, 1);
        assert_eq!(spool_master, "catalog_merge_source");
        assert_eq!(
            wishlist,
            (
                "catalog_merge_source".to_string(),
                "PLA".to_string(),
                "Source profile".to_string(),
                "Blue".to_string(),
                "Source vendor".to_string(),
            )
        );
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("catalog_merge_rolls_back_all_references_when_final_delete_fails failed: {message}");
    }
}

#[test]
fn library_sync_validation_state_rolls_back_all_settings_on_late_failure() {
    let db_path = temp_db_path("library-sync-validation-rollback");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "CREATE TRIGGER fail_library_sync_host_device
                 BEFORE INSERT ON settings
                 WHEN NEW.key = 'library_sync_host_device_name'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced host-device setting failure');
                 END;",
            )
            .map_err(|error| error.to_string())?;

        let error = db
            .save_library_sync_validation_state(
                true,
                Some("Host is reachable"),
                Some("Workshop host"),
            )
            .expect_err("late setting failure should abort validation state");
        assert!(error
            .to_string()
            .contains("forced host-device setting failure"));

        let saved_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM settings
                 WHERE key IN (
                    'library_sync_last_checked_at',
                    'library_sync_last_reachable_at',
                    'library_sync_last_validation_message',
                    'library_sync_host_device_name'
                 )",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(saved_count, 0);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "library_sync_validation_state_rolls_back_all_settings_on_late_failure failed: {message}"
        );
    }
}

#[test]
fn successful_host_action_can_clear_transient_validation_copy() {
    let db_path = temp_db_path("library-sync-clear-transient-validation-copy");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.save_library_sync_validation_state(
            false,
            Some("Host AMS weight estimate accepted."),
            None,
        )
        .map_err(|error| error.to_string())?;
        db.save_library_sync_validation_state(true, None, None)
            .map_err(|error| error.to_string())?;

        let settings = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert!(settings.last_checked_at.is_some());
        assert!(settings.last_reachable_at.is_some());
        assert_eq!(settings.last_validation_message, None);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("successful_host_action_can_clear_transient_validation_copy failed: {message}");
    }
}

fn empty_current_full_backup() -> serde_json::Value {
    let tables = FULL_BACKUP_TABLES
        .iter()
        .map(|table| ((*table).to_string(), json!([])))
        .collect::<serde_json::Map<String, serde_json::Value>>();

    json!({
        "exported_at": "2026-07-21 00:00:00",
        "format": "filament-manager-backup-v1",
        "tables": tables
    })
}

fn assert_invalid_full_backup_master_row_leaves_database_unchanged(
    test_name: &str,
    invalid_row: serde_json::Value,
) -> Result<(), String> {
    let db_path = temp_db_path(test_name);
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_semantic_preflight_existing', 'PLA', 'Semantic preflight existing',
                    'Review blue', 1000, 'Manual', 'manual', 1
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;

        let master_count_before: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM filament_master_list", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let existing_before: (String, String, i64) = db
            .conn
            .query_row(
                "SELECT filament_name, catalog_source, catalog_user_edited
                 FROM filament_master_list
                 WHERE id = 'master_semantic_preflight_existing'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;

        let mut backup = empty_current_full_backup();
        backup
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .expect("test backup should have a tables object")
            .insert("filament_master_list".to_string(), json!([invalid_row]));
        let content = backup.to_string();

        for error in [
            db.validate_full_backup_json(&content)
                .expect_err("semantic validation should reject the malformed row"),
            db.import_full_backup_json(&content)
                .expect_err("import preflight should reject the malformed row"),
        ] {
            let message = error.to_string();
            assert!(
                message.contains("Backup row 1 for `filament_master_list`")
                    && message.contains("no recognized importable columns"),
                "unexpected semantic preflight error: {message}"
            );
        }

        let master_count_after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM filament_master_list", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let existing_after: (String, String, i64) = db
            .conn
            .query_row(
                "SELECT filament_name, catalog_source, catalog_user_edited
                 FROM filament_master_list
                 WHERE id = 'master_semantic_preflight_existing'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(master_count_after, master_count_before);
        assert_eq!(existing_after, existing_before);
        assert_eq!(foreign_keys_enabled, 1);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    result
}

#[test]
fn spool_usage_point_limit_selects_latest_readings_and_returns_them_chronologically() {
    let db_path = temp_db_path("spool-usage-points-latest-limit");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES (
                    'usage_master', 'PLA', 'Usage test', 'Blue', 1000, 'Test'
                 );

                 INSERT INTO filament_spools (
                    id, master_id, status, initial_weight_g, remaining_g
                 ) VALUES (
                    'usage_spool', 'usage_master', 'IN_STOCK', 1000, 900
                 );

                 INSERT INTO scales (id, name, protocol)
                 VALUES ('usage_scale', 'Usage test scale', 'manual');

                 INSERT INTO weight_readings (
                    id, scale_id, spool_id, grams, captured_at, source
                 ) VALUES
                    (
                        'reading_001', 'usage_scale', 'usage_spool', 100,
                        '2026-07-28 08:00:00', 'source_001'
                    ),
                    (
                        'reading_002', 'usage_scale', 'usage_spool', 200,
                        '2026-07-28 09:00:00', 'source_002'
                    ),
                    (
                        'reading_003', 'usage_scale', 'usage_spool', 300,
                        '2026-07-28 10:00:00', 'source_003'
                    ),
                    (
                        'reading_004', 'usage_scale', 'usage_spool', 400,
                        '2026-07-28 10:00:00', 'source_004'
                    ),
                    (
                        'reading_005', 'usage_scale', 'usage_spool', 500,
                        '2026-07-28 10:00:00', 'source_005'
                    ),
                    (
                        'reading_006', 'usage_scale', 'usage_spool', 600,
                        '2026-07-28 11:00:00', 'source_006'
                    );",
            )
            .map_err(|error| error.to_string())?;

        let points = db
            .list_spool_usage_points("usage_spool", 3)
            .map_err(|error| error.to_string())?;
        let actual = points
            .iter()
            .map(|point| {
                (
                    point.captured_at.as_str(),
                    point.grams,
                    point.source.as_str(),
                )
            })
            .collect::<Vec<_>>();

        assert_eq!(
            actual,
            vec![
                ("2026-07-28 10:00:00", 400, "source_004"),
                ("2026-07-28 10:00:00", 500, "source_005"),
                ("2026-07-28 11:00:00", 600, "source_006"),
            ],
            "the newest readings should be selected deterministically, then displayed oldest-first"
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "spool_usage_point_limit_selects_latest_readings_and_returns_them_chronologically \
             failed: {message}"
        );
    }
}

#[test]
fn historical_sql_migrations_upgrade_to_current_schema() {
    let db_path = temp_db_path("historical-migration-upgrade");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(LEGACY_INIT_MIGRATION_SQL)
            .map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(LEGACY_SYNC_QUEUE_MIGRATION_SQL)
            .map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('legacy_master', 'PLA', 'Legacy Basic', 'Red', 1000, 'Manual')",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, qr_code, status, initial_weight_g, current_weight_g, remaining_g
                 ) VALUES (
                    'legacy_spool', 'legacy_master', 'legacy-qr', 'IN_STOCK', 1000, 850, 850
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO printers (id, model, name)
                 VALUES ('legacy_printer', 'Bambu Lab P1S', 'Legacy P1S')",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO sync_queue (id, action_type, payload_json)
                 VALUES ('legacy_sync', 'noop', '{}')",
                [],
            )
            .map_err(|error| error.to_string())?;

        db.apply_schema().map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        for (table, column) in [
            ("filament_master_list", "catalog_source"),
            ("filament_master_list", "catalog_seed_version"),
            ("filament_master_list", "catalog_user_edited"),
            ("filament_spools", "rfid_tag"),
            ("filament_spools", "rfid_observed_at"),
            ("filament_spools", "spool_tare_weight_g"),
            ("filament_spools", "ownership_type"),
            ("filament_spools", "owner_name"),
            ("filament_spools", "owner_contact"),
            ("filament_spools", "ownership_note"),
            ("ams_slots", "rfid_override_tray_uuid"),
            ("ams_slots", "rfid_override_color_hex"),
            ("ams_slots", "live_cache_cleared_at"),
            ("spool_loans", "loan_direction"),
            ("spool_loans", "loan_status"),
            ("spool_loans", "counterparty_name"),
            ("trusted_lan_pairings", "pairing_token_hash"),
            ("trusted_lan_paired_browsers", "device_token_hash"),
            ("sync_queue", "status"),
        ] {
            assert!(
                table_has_column(&db.conn, table, column).map_err(|error| error.to_string())?,
                "{table}.{column} should exist after historical migration upgrade"
            );
        }

        let preserved_spool: (String, i64) = db
            .conn
            .query_row(
                "SELECT ownership_type, remaining_g
                 FROM filament_spools
                 WHERE id = 'legacy_spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(preserved_spool, ("OWNED".to_string(), 850));

        let ext_slot_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*)
                 FROM ams_slots
                 WHERE id = 'legacy_printer_ext_slot_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(ext_slot_count, 1);

        let preserved_sync_queue_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM sync_queue WHERE id = 'legacy_sync'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(preserved_sync_queue_count, 1);

        ensure_no_foreign_key_violations(&db.conn, "historical migration smoke")
            .map_err(|error| error.to_string())?;

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(error) = result {
        panic!("historical_sql_migrations_upgrade_to_current_schema failed: {error}");
    }
}

#[test]
fn reset_app_state_table_list_tracks_all_backup_tables() {
    let full_backup_tables: HashSet<&str> = FULL_BACKUP_TABLES.iter().copied().collect();
    let reset_tables: HashSet<&str> = RESET_APP_STATE_TABLES.iter().copied().collect();
    let preserved_tables: HashSet<&str> = ["filament_master_list", "label_templates"]
        .into_iter()
        .collect();

    assert!(
        reset_tables.is_disjoint(&preserved_tables),
        "app-state reset tables must not include catalog/template tables"
    );

    let covered_tables: HashSet<&str> = reset_tables.union(&preserved_tables).copied().collect();
    assert_eq!(
        covered_tables, full_backup_tables,
        "each full-backup table must be either reset as app state or explicitly preserved"
    );
}

#[test]
fn apply_schema_seeds_sanitized_master_catalog() {
    let db_path = temp_db_path("seed-catalog");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let seeded_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE catalog_source = 'seeded'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(seeded_count, EXPECTED_SEEDED_CATALOG_COUNT);

        let vendor_counts: (i64, i64) = db
            .conn
            .query_row(
                "SELECT
                    SUM(CASE WHEN vendor = 'Bambu' THEN 1 ELSE 0 END),
                    SUM(CASE WHEN vendor = 'eSUN' THEN 1 ELSE 0 END)
                 FROM filament_master_list",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            vendor_counts,
            (EXPECTED_BAMBU_SEEDED_COUNT, EXPECTED_ESUN_SEEDED_COUNT)
        );

        let normalized_duplicate_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*)
                 FROM (
                    SELECT lower(material), lower(filament_name), lower(color_name)
                    FROM filament_master_list
                    WHERE catalog_source = 'seeded'
                    GROUP BY lower(material), lower(filament_name), lower(color_name)
                    HAVING COUNT(*) > 1
                 )",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(normalized_duplicate_count, 0);

        let unrelated_counts: (i64, i64, i64, i64) = db
            .conn
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM filament_spools),
                    (SELECT COUNT(*) FROM spool_loans),
                    (SELECT COUNT(*) FROM printers),
                    (SELECT COUNT(*) FROM trusted_lan_pairings)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(unrelated_counts, (0, 0, 0, 0));

        db.apply_schema().map_err(|error| error.to_string())?;
        let seeded_count_after_second_apply: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE catalog_source = 'seeded'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            seeded_count_after_second_apply,
            EXPECTED_SEEDED_CATALOG_COUNT
        );

        Ok(())
    })();

    if let Err(error) = result {
        panic!("apply_schema_seeds_sanitized_master_catalog failed: {error}");
    }
}

#[test]
fn reset_catalog_data_preserves_seeded_catalog_rows() {
    let db_path = temp_db_path("seed-catalog-reset");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, vendor, catalog_source
                 ) VALUES ('manual_unused', 'PLA', 'User Only', 'Purple', 'Manual', 'manual')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let stats = db.reset_catalog_data().map_err(|error| error.to_string())?;

        assert_eq!(stats.removed_count, 1);
        assert_eq!(stats.remaining_count, EXPECTED_SEEDED_CATALOG_COUNT);

        let seeded_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE catalog_source = 'seeded'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let manual_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'manual_unused'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;

        assert_eq!(seeded_count, EXPECTED_SEEDED_CATALOG_COUNT);
        assert_eq!(manual_count, 0);

        Ok(())
    })();

    if let Err(error) = result {
        panic!("reset_catalog_data_preserves_seeded_catalog_rows failed: {error}");
    }
}

#[test]
fn apply_schema_backfills_borrowed_in_groundwork_columns() {
    let db_path = temp_db_path("borrowed-in-schema");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;

        db.conn
            .execute_batch(
                "
                CREATE TABLE filament_master_list (
                  id TEXT PRIMARY KEY,
                  material TEXT NOT NULL,
                  filament_name TEXT NOT NULL,
                  color_name TEXT NOT NULL,
                  hex_color TEXT,
                  product_url TEXT,
                  default_weight INTEGER NOT NULL DEFAULT 1000,
                  vendor TEXT NOT NULL DEFAULT 'Bambu',
                  last_seen_at TEXT,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                  UNIQUE(material, filament_name, color_name)
                );

                CREATE TABLE filament_spools (
                  id TEXT PRIMARY KEY,
                  master_id TEXT NOT NULL REFERENCES filament_master_list(id),
                  qr_code TEXT UNIQUE,
                  status TEXT NOT NULL,
                  initial_weight_g INTEGER,
                  current_weight_g INTEGER,
                  remaining_g INTEGER,
                  location_id TEXT,
                  purchase_date TEXT,
                  purchase_price REAL,
                  batch_code TEXT,
                  last_used_at TEXT,
                  deleted_at TEXT,
                  created_at TEXT NOT NULL DEFAULT (datetime('now')),
                  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE spool_loans (
                  id TEXT PRIMARY KEY,
                  spool_id TEXT NOT NULL REFERENCES filament_spools(id),
                  borrower_name TEXT NOT NULL,
                  grams_out INTEGER NOT NULL,
                  lent_note TEXT,
                  lent_at TEXT NOT NULL DEFAULT (datetime('now')),
                  expected_return_at TEXT,
                  returned_at TEXT,
                  returned_grams INTEGER,
                  consumed_grams INTEGER,
                  return_note TEXT
                );
                ",
            )
            .map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                ["master_1", "PLA", "Basic", "Red", "1000", "Manual"],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, qr_code, status, initial_weight_g, current_weight_g, remaining_g
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                [
                    "spool_1", "master_1", "qr-1", "BORROWED", "1000", "700", "700",
                ],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, qr_code, status, initial_weight_g, current_weight_g, remaining_g
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                [
                    "spool_2", "master_1", "qr-2", "IN_STOCK", "1000", "900", "900",
                ],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO spool_loans (
                    id, spool_id, borrower_name, grams_out, lent_note, lent_at,
                    returned_at, returned_grams, consumed_grams, return_note
                 ) VALUES (
                    ?1, ?2, ?3, ?4, ?5, datetime('now', '-2 days'),
                    datetime('now', '-1 day'), ?6, ?7, ?8
                 )",
                [
                    "loan_returned",
                    "spool_1",
                    "Alice",
                    "700",
                    "legacy row",
                    "400",
                    "300",
                    "returned legacy",
                ],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO spool_loans (
                    id, spool_id, borrower_name, grams_out, lent_note, lent_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))",
                ["loan_active", "spool_2", "Bob", "900", "active legacy"],
            )
            .map_err(|error| error.to_string())?;

        db.apply_schema().map_err(|error| error.to_string())?;

        let spool_defaults: (String, Option<String>, Option<String>, Option<String>) = db
            .conn
            .query_row(
                "SELECT ownership_type, owner_name, owner_contact, ownership_note
                 FROM filament_spools
                 WHERE id = 'spool_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(spool_defaults.0, "OWNED");
        assert!(spool_defaults.1.is_none());
        assert!(spool_defaults.2.is_none());
        assert!(spool_defaults.3.is_none());

        let returned_loan_defaults: (String, String, Option<String>) = db
            .conn
            .query_row(
                "SELECT loan_direction, loan_status, counterparty_name
                 FROM spool_loans
                 WHERE id = 'loan_returned'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(returned_loan_defaults.0, "OUTBOUND");
        assert_eq!(returned_loan_defaults.1, "RETURNED");
        assert_eq!(returned_loan_defaults.2.as_deref(), Some("Alice"));

        let active_loan_defaults: (String, String, Option<String>) = db
            .conn
            .query_row(
                "SELECT loan_direction, loan_status, counterparty_name
                 FROM spool_loans
                 WHERE id = 'loan_active'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loan_defaults.0, "OUTBOUND");
        assert_eq!(active_loan_defaults.1, "ACTIVE");
        assert_eq!(active_loan_defaults.2.as_deref(), Some("Bob"));

        db.conn
            .execute(
                "INSERT INTO spool_loans (
                    id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
                    grams_out, lent_note, lent_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
                [
                    "loan_inbound",
                    "spool_1",
                    "Carla",
                    "INBOUND",
                    "ACTIVE",
                    "Carla",
                    "700",
                    "future inbound row",
                ],
            )
            .map_err(|error| error.to_string())?;

        let visible_loans = db
            .list_spool_loans(10, true)
            .map_err(|error| error.to_string())?;
        assert_eq!(visible_loans.len(), 2);
        assert!(visible_loans
            .iter()
            .all(|row| row.loan.loan_direction == "OUTBOUND"));

        let all_directions = db
            .list_spool_loans_for_direction(10, true, Some("ALL"))
            .map_err(|error| error.to_string())?;
        assert_eq!(all_directions.len(), 3);
        assert!(all_directions
            .iter()
            .any(|row| row.loan.loan_direction == "INBOUND"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("apply_schema_backfills_borrowed_in_groundwork_columns test failed: {message}");
    }
}

#[test]
fn row_read_boundaries_canonicalize_legacy_domain_tokens() {
    let db_path = temp_db_path("canonical-domain-row-boundaries");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_legacy_tokens', 'PLA', 'Legacy Basic', 'Blue', 1000, 'Manual')",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, qr_code, status, ownership_type,
                    initial_weight_g, current_weight_g, remaining_g
                 ) VALUES (
                    'spool_legacy_tokens', 'master_legacy_tokens', 'legacy-token-qr',
                    'IN_USE', 'borrowed-in', 1000, 880, 880
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO spool_loans (
                    id, spool_id, borrower_name, loan_direction, loan_status, counterparty_name,
                    grams_out, lent_note, lent_at
                 ) VALUES (
                    'loan_legacy_tokens', 'spool_legacy_tokens', 'Ada',
                    'out-bound', 'active', 'Ada', 880, 'legacy tokens', datetime('now')
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;

        let spool = db
            .get_spool_by_id("spool_legacy_tokens")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected legacy spool".to_string())?;
        assert_eq!(spool.status, "ASSIGNED");
        assert_eq!(spool.ownership_type, "BORROWED_IN");

        let active_loans = db
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans.len(), 1);
        assert_eq!(active_loans[0].loan.loan_direction, "OUTBOUND");
        assert_eq!(active_loans[0].loan.loan_status, "ACTIVE");
        assert_eq!(active_loans[0].spool_status, "ASSIGNED");

        db.conn
            .execute(
                "UPDATE spool_loans
                 SET returned_at = datetime('now'), loan_status = 'active'
                 WHERE id = 'loan_legacy_tokens'",
                [],
            )
            .map_err(|error| error.to_string())?;
        let returned_loans = db
            .list_spool_loans_for_direction(10, true, Some("ALL"))
            .map_err(|error| error.to_string())?;
        assert_eq!(returned_loans.len(), 1);
        assert_eq!(returned_loans[0].loan.loan_status, "RETURNED");
        assert_eq!(returned_loans[0].spool_status.as_deref(), Some("ASSIGNED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("row_read_boundaries_canonicalize_legacy_domain_tokens failed: {message}");
    }
}

#[test]
fn apply_schema_backfills_official_bambu_composite_swatches_safely() {
    let db_path = temp_db_path("bambu-composite-swatch-backfill");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        for (vendor, filament_name, color_name, hex_color) in [
            (
                "Bambu Lab",
                "PLA Silk Multi-Color",
                "Dawn Radiance (13912)",
                Some("#EC984C"),
            ),
            (
                "Bambu Lab",
                "PLA Silk Multi-Color",
                "South Beach (13910)",
                Some("#123456"),
            ),
            (
                "Bambu Lab",
                "PLA Silk Multi-Colour",
                "Mystic Magenta (13900)",
                None,
            ),
            (
                "Manual",
                "PLA Basic Gradient",
                "Ocean to Meadow (10902)",
                Some("#307FE2"),
            ),
        ] {
            db.conn
                .execute(
                    "INSERT INTO filament_master_list (
                        id, material, filament_name, color_name, hex_color,
                        default_weight, vendor
                     ) VALUES (
                        'test_' || ?3 || '_' || ?4, 'PLA', ?3, ?4, ?2, 1000, ?1
                     )
                     ON CONFLICT(material, filament_name, color_name) DO UPDATE SET
                        vendor = excluded.vendor,
                        hex_color = excluded.hex_color",
                    rusqlite::params![vendor, hex_color, filament_name, color_name],
                )
                .map_err(|error| error.to_string())?;
        }

        crate::backend::database_catalog_swatch_backfill::backfill_official_bambu_composite_swatches(
            &db.conn,
        )
        .map_err(|error| error.to_string())?;

        let read_hex = |filament_name: &str, color_name: &str| -> Result<Option<String>, String> {
            db.conn
                .query_row(
                    "SELECT hex_color
                     FROM filament_master_list
                     WHERE filament_name = ?1 AND color_name = ?2
                     LIMIT 1",
                    [filament_name, color_name],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())
        };

        assert_eq!(
            read_hex("PLA Silk Multi-Color", "Dawn Radiance (13912)")?.as_deref(),
            Some("gradient(#EC984C,#6CD4BC,#A66EB9,#D87694)")
        );
        assert_eq!(
            read_hex("PLA Silk Multi-Color", "South Beach (13910)")?.as_deref(),
            Some("#123456")
        );
        assert_eq!(
            read_hex("PLA Silk Multi-Colour", "Mystic Magenta (13900)")?.as_deref(),
            Some("multi(#720062,#3A913F)")
        );
        assert_eq!(
            read_hex("PLA Basic Gradient", "Ocean to Meadow (10902)")?.as_deref(),
            Some("#307FE2")
        );

        Ok(())
    })();

    if let Err(message) = &result {
        let _ = std::fs::remove_file(&db_path);
        panic!("apply_schema_backfills_official_bambu_composite_swatches_safely test failed: {message}");
    }
    let _ = std::fs::remove_file(&db_path);
}

#[test]
fn upsert_printer_with_ams_reconfigures_existing_printer() {
    let db_path = temp_db_path("upsert-printer-reconfigure");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 1, 4)
            .map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 2, 8)
            .map_err(|error| error.to_string())?;

        let ams_unit_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ams_units WHERE printer_id = ?1",
                ["printer_1"],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(ams_unit_count, 3, "expected EXT + 2 AMS units");

        let ams_slot_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*)
                 FROM ams_slots
                 WHERE ams_id IN ('printer_1_ams_1', 'printer_1_ams_2')",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(ams_slot_count, 16, "expected 2 x 8 AMS slots");

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("upsert_printer_with_ams test failed: {message}");
    }
}

#[test]
fn delete_printer_removes_bambu_live_integration_setting() {
    let db_path = temp_db_path("delete-printer-live-integration");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 1, 4)
            .map_err(|error| error.to_string())?;
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.42".to_string()),
                access_code: Some("test-access-code".to_string()),
                access_code_configured: false,
                access_code_binding_id: None,
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("TEST-SERIAL".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: None,
            },
        )
        .map_err(|error| error.to_string())?;

        let integrations_before = db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        assert_eq!(integrations_before.len(), 1);

        db.delete_printer("printer_1")
            .map_err(|error| error.to_string())?;

        let integrations_after = db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?;
        assert!(integrations_after.is_empty());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("delete_printer_removes_bambu_live_integration_setting failed: {message}");
    }
}

#[test]
fn bambu_live_setting_changes_increment_printer_revision_once() {
    let db_path = temp_db_path("bambu-live-printer-revision");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 1, 4)
            .map_err(|error| error.to_string())?;
        let config = BambuLiveIntegrationRow {
            enabled: true,
            host: Some("192.0.2.10".to_string()),
            access_code: Some("test-access-code".to_string()),
            access_code_configured: false,
            access_code_binding_id: None,
            access_code_stale_binding_ids: Vec::new(),
            printer_serial: Some("TEST-SERIAL".to_string()),
            last_error: None,
            tls_identity: None,
            observed_state: None,
        };
        let before = db
            .library_domain_revisions()
            .map_err(|error| error.to_string())?
            .printers;

        db.save_bambu_live_integration("printer_1", &config)
            .map_err(|error| error.to_string())?;
        let stored_payload = db
            .get_setting("bambu_live_integration:printer_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "saved Bambu integration payload missing".to_string())?;
        assert!(!stored_payload.contains("test-access-code"));
        assert!(!stored_payload.contains("\"access_code\""));
        assert!(db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?
            .into_iter()
            .all(|entry| entry.config.access_code.is_none()));
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            before + 1
        );

        db.save_bambu_live_integration("printer_1", &config)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            before + 1,
            "saving identical live state must not wake clients"
        );

        db.delete_bambu_live_integration("printer_1")
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            before + 2
        );
        db.delete_bambu_live_integration("printer_1")
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            before + 2
        );
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("bambu_live_setting_changes_increment_printer_revision_once failed: {message}");
    }
}

#[test]
fn bambu_live_heartbeat_updates_refresh_at_most_once_per_minute() {
    let db_path = temp_db_path("bambu-live-heartbeat-revision");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 1, 4)
            .map_err(|error| error.to_string())?;
        let observed = |last_seen_at: &str, progress_percent: i64, capture: i64| {
            serde_json::from_value::<BambuLiveObservedStateRow>(json!({
                "online": true,
                "last_seen_at": last_seen_at,
                "mqtt_connected": true,
                "progress_percent": progress_percent,
                "raw_payload_json": { "_bfm_capture": { "poll_elapsed_ms": capture } },
                "trays": [{
                    "tray_index": 0,
                    "loaded": true,
                    "last_identity_seen_at": last_seen_at,
                    "empty_observation_count": capture
                }]
            }))
            .map_err(|error| error.to_string())
        };
        let config = |observed_state| BambuLiveIntegrationRow {
            enabled: true,
            host: Some("192.0.2.10".to_string()),
            access_code: None,
            access_code_configured: true,
            access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
            access_code_stale_binding_ids: Vec::new(),
            printer_serial: Some("TEST-SERIAL".to_string()),
            last_error: None,
            tls_identity: None,
            observed_state: Some(observed_state),
        };

        let initial = config(observed("2026-07-22T12:00:05Z", 10, 1)?);
        db.save_bambu_live_integration("printer_1", &initial)
            .map_err(|error| error.to_string())?;
        let initial_revision = db
            .library_domain_revisions()
            .map_err(|error| error.to_string())?
            .printers;

        let same_minute_heartbeat = config(observed("2026-07-22T12:00:45Z", 10, 2)?);
        db.save_bambu_live_integration("printer_1", &same_minute_heartbeat)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            initial_revision,
            "heartbeat-only diagnostics must not wake full page reads each cycle"
        );

        let next_minute_heartbeat = config(observed("2026-07-22T12:01:05Z", 10, 3)?);
        db.save_bambu_live_integration("printer_1", &next_minute_heartbeat)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            initial_revision + 1,
            "freshness must still reach polling clients once per minute"
        );

        let semantic_change = config(observed("2026-07-22T12:01:25Z", 11, 4)?);
        db.save_bambu_live_integration("printer_1", &semantic_change)
            .map_err(|error| error.to_string())?;
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            initial_revision + 2,
            "visible live-state changes must wake clients immediately"
        );
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("bambu_live_heartbeat_updates_refresh_at_most_once_per_minute failed: {message}");
    }
}

fn bambu_live_test_observation(marker: &str) -> BambuLiveObservedStateRow {
    serde_json::from_value(json!({
        "online": true,
        "last_seen_at": "2026-07-28T12:00:00Z",
        "mqtt_connected": true,
        "raw_status_note": marker,
        "trays": []
    }))
    .expect("build Bambu live observation")
}

fn bambu_live_test_tls_identity(
    trusted_marker: &str,
    observed_marker: &str,
) -> BambuLiveTlsIdentityRow {
    BambuLiveTlsIdentityRow {
        trusted_spki_sha256: Some(format!("trusted-spki-{trusted_marker}")),
        trusted_certificate_sha256: Some(format!("trusted-certificate-{trusted_marker}")),
        trusted_at: Some(format!("trusted-at-{trusted_marker}")),
        observed_spki_sha256: format!("observed-spki-{observed_marker}"),
        observed_certificate_sha256: format!("observed-certificate-{observed_marker}"),
        observed_at: format!("observed-at-{observed_marker}"),
    }
}

fn bambu_live_test_config(marker: &str) -> BambuLiveIntegrationRow {
    BambuLiveIntegrationRow {
        enabled: true,
        host: Some(format!("printer-{marker}.local")),
        access_code: None,
        access_code_configured: true,
        access_code_binding_id: Some("11111111111111111111111111111111".to_string()),
        access_code_stale_binding_ids: Vec::new(),
        printer_serial: Some(format!("SERIAL-{marker}")),
        last_error: Some(format!("error-{marker}")),
        tls_identity: Some(bambu_live_test_tls_identity(marker, marker)),
        observed_state: Some(bambu_live_test_observation(marker)),
    }
}

#[test]
fn bambu_live_observation_update_changes_only_runtime_fields() {
    let db_path = temp_db_path("bambu-live-targeted-observation-update");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let expected = bambu_live_test_config("original");
        db.save_bambu_live_integration("printer_1", &expected)
            .map_err(|error| error.to_string())?;

        let poll_tls = bambu_live_test_tls_identity("stale-poll-copy", "fresh-poll");
        let fresh_observation = bambu_live_test_observation("fresh-poll");
        assert!(db
            .update_bambu_live_observation_if_current(
                "printer_1",
                &expected,
                Some(fresh_observation.clone()),
                None,
                Some(&poll_tls),
            )
            .map_err(|error| error.to_string())?);

        let stored = db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?
            .into_iter()
            .next()
            .ok_or_else(|| "updated Bambu live integration missing".to_string())?
            .config;
        assert_eq!(stored.enabled, expected.enabled);
        assert_eq!(stored.host, expected.host);
        assert_eq!(
            stored.access_code_configured,
            expected.access_code_configured
        );
        assert_eq!(stored.printer_serial, expected.printer_serial);
        assert_eq!(stored.last_error, None);
        assert_eq!(stored.observed_state, Some(fresh_observation));
        let stored_tls = stored
            .tls_identity
            .ok_or_else(|| "updated TLS identity missing".to_string())?;
        let expected_tls = expected
            .tls_identity
            .as_ref()
            .ok_or_else(|| "expected TLS identity missing".to_string())?;
        assert_eq!(
            stored_tls.trusted_spki_sha256,
            expected_tls.trusted_spki_sha256
        );
        assert_eq!(
            stored_tls.trusted_certificate_sha256,
            expected_tls.trusted_certificate_sha256
        );
        assert_eq!(stored_tls.trusted_at, expected_tls.trusted_at);
        assert_eq!(
            stored_tls.observed_spki_sha256,
            poll_tls.observed_spki_sha256
        );
        assert_eq!(
            stored_tls.observed_certificate_sha256,
            poll_tls.observed_certificate_sha256
        );
        assert_eq!(stored_tls.observed_at, poll_tls.observed_at);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("bambu_live_observation_update_changes_only_runtime_fields failed: {message}");
    }
}

#[test]
fn stale_bambu_live_poll_cannot_overwrite_newer_connection_or_trust() {
    let db_path = temp_db_path("bambu-live-stale-poll-cas");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let expected = bambu_live_test_config("poll-start");
        let stale_observation = bambu_live_test_observation("stale-poll-result");
        let stale_tls = bambu_live_test_tls_identity("poll-start", "stale-poll-result");

        for changed_field in ["host", "serial", "trusted-pin"] {
            db.save_bambu_live_integration("printer_1", &expected)
                .map_err(|error| error.to_string())?;
            let mut newer = expected.clone();
            newer.last_error = Some(format!("newer-{changed_field}-error"));
            newer.observed_state = Some(bambu_live_test_observation(&format!(
                "newer-{changed_field}"
            )));
            match changed_field {
                "host" => newer.host = Some("newer-printer.local".to_string()),
                "serial" => newer.printer_serial = Some("SERIAL-NEWER".to_string()),
                "trusted-pin" => {
                    newer.tls_identity =
                        Some(bambu_live_test_tls_identity("newer-pin", "newer-pin"))
                }
                _ => unreachable!(),
            }
            db.save_bambu_live_integration("printer_1", &newer)
                .map_err(|error| error.to_string())?;
            let revision_before = db
                .library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers;

            assert!(
                !db.update_bambu_live_observation_if_current(
                    "printer_1",
                    &expected,
                    Some(stale_observation.clone()),
                    Some("stale-poll-error".to_string()),
                    Some(&stale_tls),
                )
                .map_err(|error| error.to_string())?,
                "a stale poll must be rejected after {changed_field} changes"
            );
            assert_eq!(
                db.library_domain_revisions()
                    .map_err(|error| error.to_string())?
                    .printers,
                revision_before,
                "a rejected stale poll must not wake clients"
            );
            let stored = db
                .list_bambu_live_integrations()
                .map_err(|error| error.to_string())?
                .into_iter()
                .next()
                .ok_or_else(|| "newer Bambu live integration missing".to_string())?
                .config;
            assert_eq!(
                stored, newer,
                "a stale poll overwrote the newer {changed_field}"
            );
        }
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "stale_bambu_live_poll_cannot_overwrite_newer_connection_or_trust failed: {message}"
        );
    }
}

#[test]
fn stale_bambu_live_poll_cannot_recreate_deleted_integration() {
    let db_path = temp_db_path("bambu-live-stale-poll-delete");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let expected = bambu_live_test_config("poll-start");
        db.save_bambu_live_integration("printer_1", &expected)
            .map_err(|error| error.to_string())?;
        db.delete_bambu_live_integration("printer_1")
            .map_err(|error| error.to_string())?;
        let revision_after_delete = db
            .library_domain_revisions()
            .map_err(|error| error.to_string())?
            .printers;

        assert!(!db
            .update_bambu_live_observation_if_current(
                "printer_1",
                &expected,
                Some(bambu_live_test_observation("stale-poll-result")),
                Some("stale-poll-error".to_string()),
                Some(&bambu_live_test_tls_identity(
                    "poll-start",
                    "stale-poll-result"
                )),
            )
            .map_err(|error| error.to_string())?);
        assert!(db
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?
            .is_empty());
        assert_eq!(
            db.library_domain_revisions()
                .map_err(|error| error.to_string())?
                .printers,
            revision_after_delete
        );
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("stale_bambu_live_poll_cannot_recreate_deleted_integration failed: {message}");
    }
}

#[test]
fn clearing_printer_slot_releases_legacy_assigned_status_tokens() {
    let db_path = temp_db_path("clear-slot-legacy-assigned-status");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Green",
                hex_color: Some("#22C55E"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        db.upsert_printer_with_ams("printer_1", "P1S", "Workshop", 1, 4)
            .map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES ('Shelf A', 'Shelf A', 'SHELF')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let slot_id = "printer_1_ams_1_slot_1";
        let printer_location = format!("Printer:Workshop:{slot_id}");
        db.conn
            .execute(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES (?1, ?1, 'PRINTER_SLOT')",
                [&printer_location],
            )
            .map_err(|error| error.to_string())?;

        let spool = SpoolRow {
            id: "legacy_assigned_spool".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(940),
            remaining_g: Some(940),
            spool_tare_weight_g: None,
            location_id: Some("Shelf A".to_string()),
            home_location_id: Some("Shelf A".to_string()),
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,

            purchase_currency: None,

            supplier_reference: None,
            purchase_price_batch_locked: false,
            purchase_price_source: None,
        };
        db.insert_spool(&spool).map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "UPDATE filament_spools
                 SET status = 'in-use',
                     location_id = ?1,
                     home_location_id = 'Shelf A'
                 WHERE id = 'legacy_assigned_spool'",
                [&printer_location],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "UPDATE ams_slots
                 SET spool_id = 'legacy_assigned_spool'
                 WHERE id = ?1",
                [slot_id],
            )
            .map_err(|error| error.to_string())?;

        db.assign_spool_to_ams_slot("printer_1", slot_id, None, None, None, false)
            .map_err(|error| error.to_string())?;

        let released: (String, Option<String>) = db
            .conn
            .query_row(
                "SELECT status, location_id
                 FROM filament_spools
                 WHERE id = 'legacy_assigned_spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            released,
            ("IN_STOCK".to_string(), Some("Shelf A".to_string()))
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("clearing_printer_slot_releases_legacy_assigned_status_tokens failed: {message}");
    }
}

#[test]
fn printer_overview_normalizes_slot_spool_ownership_tokens() {
    let db_path = temp_db_path("printer-overview-normalized-ownership");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PETG",
                filament_name: "Basic",
                color_name: "Red",
                hex_color: Some("#C1121F"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        db.upsert_printer_with_ams("printer_1", "P1S", "Workshop", 1, 4)
            .map_err(|error| error.to_string())?;

        let spool = SpoolRow {
            id: "borrowed_legacy_token_spool".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "borrowed-in".to_string(),
            owner_name: Some("Ada".to_string()),
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(850),
            remaining_g: Some(850),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,

            purchase_currency: None,

            supplier_reference: None,
            purchase_price_batch_locked: false,
            purchase_price_source: None,
        };
        db.insert_spool(&spool).map_err(|error| error.to_string())?;

        let slot_id = "printer_1_ams_1_slot_1";
        db.conn
            .execute(
                "UPDATE ams_slots
                 SET spool_id = 'borrowed_legacy_token_spool'
                 WHERE id = ?1",
                [slot_id],
            )
            .map_err(|error| error.to_string())?;

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == slot_id)
            .ok_or_else(|| "expected slot in printer overview".to_string())?;
        assert_eq!(slot.spool_ownership_type.as_deref(), Some("BORROWED_IN"));
        assert_eq!(slot.spool_owner_name.as_deref(), Some("Ada"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("printer_overview_normalizes_slot_spool_ownership_tokens failed: {message}");
    }
}

#[test]
fn list_active_spool_loans_hides_deleted_spools() {
    let db_path = temp_db_path("active-loans-hide-deleted");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Gray",
                hex_color: Some("#808080"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        let make_spool = |id: &str| SpoolRow {
            id: id.to_string(),
            master_id: master_id.clone(),
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(1000),
            remaining_g: Some(1000),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,

            purchase_currency: None,

            supplier_reference: None,
            purchase_price_batch_locked: false,
            purchase_price_source: None,
        };

        for spool in [make_spool("active_spool"), make_spool("deleted_spool")] {
            db.insert_spool(&spool).map_err(|error| error.to_string())?;
        }

        db.create_spool_loan("active_spool", "Alice", 700, None)
            .map_err(|error| error.to_string())?;
        db.create_spool_loan("deleted_spool", "Bob", 650, None)
            .map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "UPDATE filament_spools
                 SET deleted_at = datetime('now'), status = 'DELETED', location_id = NULL
                 WHERE id = 'deleted_spool'",
                [],
            )
            .map_err(|error| error.to_string())?;

        let active_loans = db
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans.len(), 1);
        assert_eq!(active_loans[0].loan.spool_id, "active_spool");
        assert_eq!(active_loans[0].loan.borrower_name, "Alice");

        let history = db
            .list_spool_loans_for_direction(10, true, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert!(
            history
                .iter()
                .any(|row| row.loan.spool_id == "deleted_spool"),
            "deleted spool loan should remain available in history"
        );

        let active_history = db
            .list_spool_loans_for_direction(10, false, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(active_history.len(), 1);
        assert_eq!(active_history[0].loan.spool_id, "active_spool");

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("list_active_spool_loans_hides_deleted_spools failed: {message}");
    }
}

#[test]
fn active_loan_queries_ignore_closed_status_without_return_timestamp() {
    let db_path = temp_db_path("active-loans-ignore-closed-status");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PETG",
                filament_name: "Basic",
                color_name: "Blue",
                hex_color: Some("#3366ff"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        let make_spool = |id: &str| SpoolRow {
            id: id.to_string(),
            master_id: master_id.clone(),
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(1000),
            remaining_g: Some(1000),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,

            purchase_currency: None,

            supplier_reference: None,
            purchase_price_batch_locked: false,
            purchase_price_source: None,
        };

        for spool in [
            make_spool("active_spool"),
            make_spool("cancelled_spool"),
            make_spool("lost_spool"),
        ] {
            db.insert_spool(&spool).map_err(|error| error.to_string())?;
        }

        db.create_spool_loan("active_spool", "Alice", 700, None)
            .map_err(|error| error.to_string())?;
        db.create_spool_loan("cancelled_spool", "Bob", 650, None)
            .map_err(|error| error.to_string())?;
        db.create_spool_loan("lost_spool", "Carla", 600, None)
            .map_err(|error| error.to_string())?;

        db.conn
            .execute(
                "UPDATE spool_loans
                 SET loan_status = 'CANCELLED'
                 WHERE spool_id = 'cancelled_spool'",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "UPDATE spool_loans
                 SET loan_status = 'LOST'
                 WHERE spool_id = 'lost_spool'",
                [],
            )
            .map_err(|error| error.to_string())?;

        assert!(db
            .spool_has_active_loan("active_spool")
            .map_err(|error| error.to_string())?);
        assert!(!db
            .spool_has_active_loan("cancelled_spool")
            .map_err(|error| error.to_string())?);
        assert!(!db
            .spool_has_active_loan("lost_spool")
            .map_err(|error| error.to_string())?);

        let active_loans = db
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans.len(), 1);
        assert_eq!(active_loans[0].loan.spool_id, "active_spool");

        let active_history = db
            .list_spool_loans_for_direction(10, false, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(active_history.len(), 1);
        assert_eq!(active_history[0].loan.spool_id, "active_spool");

        let all_history = db
            .list_spool_loans_for_direction(10, true, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert!(all_history.iter().any(|row| {
            row.loan.spool_id == "cancelled_spool" && row.loan.loan_status == "CANCELLED"
        }));
        assert!(all_history
            .iter()
            .any(|row| row.loan.spool_id == "lost_spool" && row.loan.loan_status == "LOST"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "active_loan_queries_ignore_closed_status_without_return_timestamp failed: {message}"
        );
    }
}

#[test]
fn list_loan_usage_by_person_can_scope_to_inbound_and_outbound() {
    let db_path = temp_db_path("loan-usage-direction");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Gray",
                hex_color: Some("#808080"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        for spool in [
            SpoolRow {
                id: "owned_out_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
            SpoolRow {
                id: "owned_out_2".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
            SpoolRow {
                id: "owned_out_deleted".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
            SpoolRow {
                id: "borrowed_in_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: None,
                initial_weight_g: Some(850),
                current_weight_g: Some(850),
                remaining_g: Some(850),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
            SpoolRow {
                id: "borrowed_in_2".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: None,
                initial_weight_g: Some(800),
                current_weight_g: Some(800),
                remaining_g: Some(800),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
        ] {
            db.insert_spool(&spool).map_err(|error| error.to_string())?;
        }

        let outbound_returned = db
            .create_spool_loan("owned_out_1", "Alice", 780, None)
            .map_err(|error| error.to_string())?;
        db.return_spool_loan(&outbound_returned.id, 620, None)
            .map_err(|error| error.to_string())?;
        db.create_spool_loan("owned_out_2", "Bob", 700, None)
            .map_err(|error| error.to_string())?;
        db.create_spool_loan("owned_out_deleted", "Dana", 690, None)
            .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "UPDATE filament_spools
                 SET deleted_at = datetime('now'), status = 'DELETED'
                 WHERE id = 'owned_out_deleted'",
                [],
            )
            .map_err(|error| error.to_string())?;

        let inbound_returned = db
            .create_inbound_spool_loan("borrowed_in_1", "Carla", None, None, 760)
            .map_err(|error| error.to_string())?;
        db.return_inbound_spool_loan(&inbound_returned.id, 690, None)
            .map_err(|error| error.to_string())?;
        db.create_inbound_spool_loan("borrowed_in_2", "Carla", None, None, 640)
            .map_err(|error| error.to_string())?;

        let outbound = db
            .list_loan_usage_by_person_for_direction(10, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(outbound.len(), 2);
        assert!(outbound.iter().all(|row| row.loan_direction == "OUTBOUND"));
        let alice = outbound
            .iter()
            .find(|row| row.borrower_name == "Alice")
            .ok_or_else(|| "missing outbound Alice row".to_string())?;
        assert_eq!(alice.total_consumed_g, 160);
        assert_eq!(alice.completed_loans, 1);
        assert_eq!(alice.active_loans, 0);
        let bob = outbound
            .iter()
            .find(|row| row.borrower_name == "Bob")
            .ok_or_else(|| "missing outbound Bob row".to_string())?;
        assert_eq!(bob.total_consumed_g, 0);
        assert_eq!(bob.completed_loans, 0);
        assert_eq!(bob.active_loans, 1);
        assert!(
            outbound.iter().all(|row| row.borrower_name != "Dana"),
            "deleted active spool loan should not count as current loan usage"
        );

        let inbound = db
            .list_loan_usage_by_person_for_direction(10, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound.len(), 1);
        let carla = inbound
            .first()
            .ok_or_else(|| "missing inbound Carla row".to_string())?;
        assert_eq!(carla.loan_direction, "INBOUND");
        assert_eq!(carla.borrower_name, "Carla");
        assert_eq!(carla.total_consumed_g, 70);
        assert_eq!(carla.completed_loans, 1);
        assert_eq!(carla.active_loans, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "list_loan_usage_by_person_can_scope_to_inbound_and_outbound test failed: {message}"
        );
    }
}

#[test]
fn export_loans_csv_defaults_to_outbound_without_recursing() {
    let db_path = temp_db_path("loan-csv-default-outbound");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Gray",
                hex_color: Some("#808080"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        for spool in [
            SpoolRow {
                id: "owned_out_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                remaining_g: Some(1000),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
            SpoolRow {
                id: "borrowed_in_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: None,
                initial_weight_g: Some(900),
                current_weight_g: Some(900),
                remaining_g: Some(900),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,

                purchase_currency: None,

                supplier_reference: None,
                purchase_price_batch_locked: false,
                purchase_price_source: None,
            },
        ] {
            db.insert_spool(&spool).map_err(|error| error.to_string())?;
        }

        db.create_spool_loan("owned_out_1", "Alice", 750, None)
            .map_err(|error| error.to_string())?;
        db.create_inbound_spool_loan("borrowed_in_1", "Carla", None, None, 820)
            .map_err(|error| error.to_string())?;

        let outbound_csv = db
            .export_loans_csv(false)
            .map_err(|error| error.to_string())?;
        let explicit_outbound_csv = db
            .export_loans_csv_for_direction(false, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(outbound_csv, explicit_outbound_csv);
        assert!(outbound_csv.contains(",owned_out_1,OUTBOUND,Alice,"));
        assert!(!outbound_csv.contains(",borrowed_in_1,INBOUND,Carla,"));

        let inbound_csv = db
            .export_loans_csv_for_direction(false, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert!(inbound_csv.contains(",borrowed_in_1,INBOUND,Carla,"));
        assert!(!inbound_csv.contains(",owned_out_1,OUTBOUND,Alice,"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("export_loans_csv_defaults_to_outbound_without_recursing failed: {message}");
    }
}

#[test]
fn inventory_exports_do_not_truncate_after_ten_thousand_spools() {
    let db_path = temp_db_path("inventory-export-over-ten-thousand");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_export_scale', 'PLA', 'Scale', 'Blue', 1000, 'Generic',
                    'manual', 1
                 )",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "WITH digits(d) AS (
                    VALUES (0), (1), (2), (3), (4), (5), (6), (7), (8), (9)
                 ), numbered(n) AS (
                    SELECT a.d + b.d * 10 + c.d * 100 + d.d * 1000 + e.d * 10000
                    FROM digits a
                    CROSS JOIN digits b
                    CROSS JOIN digits c
                    CROSS JOIN digits d
                    CROSS JOIN digits e
                 )
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g
                 )
                 SELECT printf('export_%05d', n), 'master_export_scale', 'IN_STOCK',
                        'OWNED', 1000, 1000, 1000
                 FROM numbered
                 WHERE n < 10001;",
            )
            .map_err(|error| error.to_string())?;

        let csv = db.export_spools_csv().map_err(|error| error.to_string())?;
        assert_eq!(csv.lines().count(), 10_002);
        let json = db.export_spools_json().map_err(|error| error.to_string())?;
        let rows: Vec<serde_json::Value> =
            serde_json::from_str(&json).map_err(|error| error.to_string())?;
        assert_eq!(rows.len(), 10_001);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("inventory_exports_do_not_truncate_after_ten_thousand_spools failed: {message}");
    }
}

#[test]
fn inventory_exports_preserve_purchase_metadata_and_missing_price() {
    let db_path = temp_db_path("inventory-export-purchase-metadata");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_receipt_export', 'PLA', 'Basic', 'Blue', 1000, 'Generic',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, remaining_g,
                    purchase_price, purchase_currency, purchase_date, batch_code,
                    supplier_reference
                 ) VALUES (
                    'receipt_export_full', 'master_receipt_export', 'IN_STOCK', 'OWNED', 900,
                    0, 'NOK', '2026-08-21', 'batch,one', 'PO \"7\"'
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, remaining_g
                 ) VALUES (
                    'receipt_export_missing', 'master_receipt_export', 'IN_STOCK', 'OWNED', 800
                 );",
            )
            .map_err(|error| error.to_string())?;

        let csv = db.export_spools_csv().map_err(|error| error.to_string())?;
        assert!(csv.starts_with(
            "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source\n"
        ));
        let full_csv_row = csv
            .lines()
            .find(|line| line.starts_with("receipt_export_full,"))
            .ok_or_else(|| "missing full receipt CSV row".to_string())?;
        assert!(full_csv_row.contains(",0,NOK,2026-08-21,\"batch,one\","));
        assert!(full_csv_row.ends_with("\"PO \"\"7\"\"\",false,"));
        let missing_csv_row = csv
            .lines()
            .find(|line| line.starts_with("receipt_export_missing,"))
            .ok_or_else(|| "missing receipt CSV row with nulls".to_string())?;
        assert!(missing_csv_row.ends_with(",,,,,false,"));

        let json_export = db.export_spools_json().map_err(|error| error.to_string())?;
        let rows: Vec<serde_json::Value> =
            serde_json::from_str(&json_export).map_err(|error| error.to_string())?;
        let full = rows
            .iter()
            .find(|row| row["spool_id"] == "receipt_export_full")
            .ok_or_else(|| "missing full receipt JSON row".to_string())?;
        assert_eq!(full["purchase_price"], json!(0.0));
        assert_eq!(full["purchase_currency"], "NOK");
        assert_eq!(full["purchase_date"], "2026-08-21");
        assert_eq!(full["batch_code"], "batch,one");
        assert_eq!(full["supplier_reference"], "PO \"7\"");
        assert_eq!(full["purchase_price_batch_locked"], false);
        assert_eq!(full["purchase_price_source"], json!(null));
        let missing = rows
            .iter()
            .find(|row| row["spool_id"] == "receipt_export_missing")
            .ok_or_else(|| "missing null receipt JSON row".to_string())?;
        for field in [
            "purchase_price",
            "purchase_currency",
            "purchase_date",
            "batch_code",
            "supplier_reference",
        ] {
            assert!(missing[field].is_null(), "expected null {field}");
        }
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("inventory_exports_preserve_purchase_metadata_and_missing_price failed: {message}");
    }
}

#[test]
fn inventory_csv_and_json_round_trip_purchase_metadata_without_legacy_data_loss() {
    let source_path = temp_db_path("inventory-receipt-roundtrip-source");
    let csv_path = temp_db_path("inventory-receipt-roundtrip-csv");
    let json_path = temp_db_path("inventory-receipt-roundtrip-json");

    let result = (|| -> Result<(), String> {
        let source = FilamentDatabase::open(&source_path).map_err(|error| error.to_string())?;
        source.apply_schema().map_err(|error| error.to_string())?;
        source
            .conn
            .execute_batch(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES ('roundtrip-current', 'Drybox', 'GENERIC');
                 INSERT INTO inventory_locations (id, name, type)
                 VALUES ('roundtrip-home', 'Shelf 1', 'GENERIC');
                 INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_receipt_roundtrip', 'PETG', 'Translucent', 'Blue', 750, 'eSUN',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, spool_tare_weight_g, purchase_price, purchase_currency,
                    purchase_date, batch_code, supplier_reference, location_id,
                    home_location_id, purchase_price_batch_locked, purchase_price_source
                 ) VALUES (
                    'receipt_roundtrip_full', 'master_receipt_roundtrip', 'IN_STOCK', 'OWNED',
                    750, 675, 675, 223, 249.5, 'NOK', '2026-08-20', 'batch,
42', 'PO \"A-7\"' || char(13) || 'line 2', 'roundtrip-current',
                    'roundtrip-home', 1, 'STANDARD_BATCH'
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, purchase_price
                 ) VALUES (
                    'receipt_roundtrip_legacy', 'master_receipt_roundtrip', 'IN_STOCK', 'OWNED',
                    750, 700, 700, 199.0
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, purchase_price, purchase_date, batch_code,
                    supplier_reference
                 ) VALUES (
                    'receipt_roundtrip_legacy_dirty', 'master_receipt_roundtrip', 'IN_STOCK',
                    'OWNED', 750, 650, 650, -1, 'legacy-not-a-date',
                    ' ' || printf('%0119d', 0) || ' ', char(10) || 'REF' || char(10)
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, owner_name, owner_contact,
                    ownership_note, initial_weight_g, current_weight_g, remaining_g,
                    spool_tare_weight_g
                 ) VALUES (
                    'receipt_roundtrip_borrowed_in', 'master_receipt_roundtrip', 'IN_STOCK',
                    'BORROWED_IN', 'Mina', 'mina@example.test', 'Prototype loan',
                    750, 600, 600, 219
                 );",
            )
            .map_err(|error| error.to_string())?;
        source
            .create_inbound_spool_loan(
                "receipt_roundtrip_borrowed_in",
                "Mina",
                Some("mina@example.test"),
                Some("Prototype loan"),
                600,
            )
            .map_err(|error| error.to_string())?;

        let csv = source
            .export_spools_csv()
            .map_err(|error| error.to_string())?;
        let json = source
            .export_spools_json()
            .map_err(|error| error.to_string())?;

        source
            .import_data_content(&csv)
            .map_err(|error| error.to_string())?;
        let same_database_placement: (Option<String>, Option<String>, Option<i64>, i64) = source
            .conn
            .query_row(
                "SELECT location_id, home_location_id, spool_tare_weight_g,
                        (SELECT COUNT(*) FROM inventory_locations)
                 FROM filament_spools WHERE id = 'receipt_roundtrip_full'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(
            same_database_placement,
            (
                Some("roundtrip-current".to_string()),
                Some("roundtrip-home".to_string()),
                Some(223),
                2,
            )
        );

        for (database_path, content, expected_format) in [
            (&csv_path, csv, "INVENTORY_CSV"),
            (&json_path, json, "INVENTORY_JSON"),
        ] {
            let destination =
                FilamentDatabase::open(database_path).map_err(|error| error.to_string())?;
            destination
                .apply_schema()
                .map_err(|error| error.to_string())?;
            let stats = destination
                .import_data_content(&content)
                .map_err(|error| error.to_string())?;
            assert_eq!(stats.detected_format, expected_format);
            assert_eq!(stats.created_count, 4);

            let full = destination
                .get_spool_by_id("receipt_roundtrip_full")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing fully populated imported spool".to_string())?;
            assert_eq!(full.initial_weight_g, Some(750));
            assert_eq!(full.current_weight_g, Some(675));
            assert_eq!(full.remaining_g, Some(675));
            assert_eq!(full.spool_tare_weight_g, Some(223));
            assert_eq!(full.purchase_price, Some(249.5));
            assert_eq!(full.purchase_currency.as_deref(), Some("NOK"));
            assert_eq!(full.purchase_date.as_deref(), Some("2026-08-20"));
            assert_eq!(full.batch_code.as_deref(), Some("batch,\n42"));
            assert_eq!(
                full.supplier_reference.as_deref(),
                Some("PO \"A-7\"\rline 2")
            );
            assert!(full.purchase_price_batch_locked);
            assert_eq!(
                full.purchase_price_source.as_deref(),
                Some("STANDARD_BATCH")
            );
            let imported_master: (String, i64) = destination
                .conn
                .query_row(
                    "SELECT vendor, default_weight
                     FROM filament_master_list
                     WHERE id = ?1",
                    [full.master_id.as_str()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(imported_master, ("eSUN".to_string(), 750));
            let location_names: (Option<String>, Option<String>) = destination
                .conn
                .query_row(
                    "SELECT current.name, home.name
                     FROM filament_spools spool
                     LEFT JOIN inventory_locations current ON current.id = spool.location_id
                     LEFT JOIN inventory_locations home ON home.id = spool.home_location_id
                     WHERE spool.id = 'receipt_roundtrip_full'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(
                location_names,
                (Some("Drybox".to_string()), Some("Shelf 1".to_string()))
            );
            assert_ne!(full.location_id, full.home_location_id);

            let legacy = destination
                .get_spool_by_id("receipt_roundtrip_legacy")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing legacy imported spool".to_string())?;
            assert_eq!(legacy.purchase_price, Some(199.0));
            assert_eq!(legacy.purchase_currency, None);
            assert!(!legacy.purchase_price_batch_locked);
            assert_eq!(legacy.purchase_price_source, None);

            let dirty_legacy = destination
                .get_spool_by_id("receipt_roundtrip_legacy_dirty")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing dirty legacy imported spool".to_string())?;
            assert_eq!(dirty_legacy.purchase_price, Some(-1.0));
            assert_eq!(dirty_legacy.purchase_currency, None);
            assert_eq!(
                dirty_legacy.purchase_date.as_deref(),
                Some("legacy-not-a-date")
            );
            assert_eq!(dirty_legacy.batch_code.as_deref().map(str::len), Some(121));
            assert!(dirty_legacy
                .batch_code
                .as_deref()
                .is_some_and(|value| value.starts_with(' ') && value.ends_with(' ')));
            assert_eq!(dirty_legacy.supplier_reference.as_deref(), Some("\nREF\n"));

            let borrowed_in = destination
                .get_spool_by_id("receipt_roundtrip_borrowed_in")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing borrowed-in imported spool".to_string())?;
            assert_eq!(borrowed_in.ownership_type, "BORROWED_IN");
            assert_eq!(borrowed_in.owner_name.as_deref(), Some("Mina"));
            assert_eq!(
                borrowed_in.owner_contact.as_deref(),
                Some("mina@example.test")
            );
            assert_eq!(
                borrowed_in.ownership_note.as_deref(),
                Some("Prototype loan")
            );
            assert_eq!(borrowed_in.spool_tare_weight_g, Some(219));
            assert!(destination
                .list_spool_loans_for_direction(20, false, Some("INBOUND"))
                .map_err(|error| error.to_string())?
                .iter()
                .any(|row| row.loan.spool_id == "receipt_roundtrip_borrowed_in"));

            destination
                .import_data_content(
                    r#"[{"spool_id":"receipt_roundtrip_full","material":"PETG","filament_name":"Translucent","color_name":"Blue","remaining_g":800}]"#,
                )
                .map_err(|error| error.to_string())?;
            let updated_from_legacy_format = destination
                .get_spool_by_id("receipt_roundtrip_full")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing spool after legacy-format update".to_string())?;
            assert_eq!(updated_from_legacy_format.remaining_g, Some(800));
            assert_eq!(updated_from_legacy_format.initial_weight_g, Some(750));
            assert_eq!(updated_from_legacy_format.current_weight_g, Some(675));
            assert_eq!(updated_from_legacy_format.spool_tare_weight_g, Some(223));
            assert_eq!(updated_from_legacy_format.purchase_price, Some(249.5));
            assert_eq!(
                updated_from_legacy_format.purchase_currency.as_deref(),
                Some("NOK")
            );

            destination
                .import_data_content(
                    r#"[{"spool_id":"receipt_roundtrip_full","material":"PETG","filament_name":"Translucent","color_name":"Blue","spool_tare_weight_g":null}]"#,
                )
                .map_err(|error| error.to_string())?;
            let explicitly_cleared_tare = destination
                .get_spool_by_id("receipt_roundtrip_full")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing spool after explicit tare clear".to_string())?;
            assert_eq!(explicitly_cleared_tare.spool_tare_weight_g, None);

            let invalid_import = destination
                .import_data_content(
                    r#"[
                      {"spool_id":"receipt_roundtrip_full","material":"PETG","filament_name":"Translucent","color_name":"Blue","remaining_g":123},
                      {"spool_id":"receipt_roundtrip_invalid","material":"PLA","filament_name":"Basic","color_name":"Red","purchase_price":"not-a-number"}
                    ]"#,
                )
                .expect_err("invalid receipt metadata should reject the whole import");
            match invalid_import {
                crate::backend::database_result::InventoryError::InvalidOperation {
                    code, ..
                } => assert_eq!(code, "purchase_metadata.price_invalid"),
                other => return Err(format!("unexpected import error: {other}")),
            }
            let after_rejected_import = destination
                .get_spool_by_id("receipt_roundtrip_full")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing spool after rejected receipt import".to_string())?;
            assert_eq!(after_rejected_import.remaining_g, Some(800));
            assert!(
                destination
                    .get_spool_by_id("receipt_roundtrip_invalid")
                    .map_err(|error| error.to_string())?
                    .is_none(),
                "receipt import must roll back earlier rows when later metadata is invalid"
            );

            let wrong_text_type = destination
                .import_data_content(
                    r#"[
                      {"spool_id":"receipt_roundtrip_full","material":"PETG","filament_name":"Translucent","color_name":"Blue","remaining_g":321},
                      {"spool_id":"receipt_roundtrip_wrong_type","material":"PLA","filament_name":"Basic","color_name":"Red","batch_code":42}
                    ]"#,
                )
                .expect_err("non-string receipt text should reject the whole import");
            match wrong_text_type {
                crate::backend::database_result::InventoryError::InvalidOperation {
                    code, ..
                } => assert_eq!(code, "purchase_metadata.type_invalid"),
                other => return Err(format!("unexpected import type error: {other}")),
            }
            let after_wrong_text_type = destination
                .get_spool_by_id("receipt_roundtrip_full")
                .map_err(|error| error.to_string())?
                .ok_or_else(|| "missing spool after wrong receipt text type".to_string())?;
            assert_eq!(after_wrong_text_type.remaining_g, Some(800));
            assert!(
                destination
                    .get_spool_by_id("receipt_roundtrip_wrong_type")
                    .map_err(|error| error.to_string())?
                    .is_none(),
                "receipt type errors must not partially mutate inventory"
            );
        }

        Ok(())
    })();

    for path in [&source_path, &csv_path, &json_path] {
        let _ = std::fs::remove_file(path);
    }
    if let Err(message) = result {
        panic!(
            "inventory_csv_and_json_round_trip_purchase_metadata_without_legacy_data_loss failed: {message}"
        );
    }
}

#[test]
fn lightweight_inventory_purchase_metadata_is_presence_aware_per_field() {
    let db_path = temp_db_path("inventory-receipt-field-presence");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_receipt_presence', 'PETG', 'Basic', 'Blue', 1000, 'Generic',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, remaining_g,
                    purchase_price, purchase_currency, purchase_date, batch_code,
                    supplier_reference, purchase_price_source
                 ) VALUES
                 (
                    'receipt_presence_json', 'master_receipt_presence', 'IN_STOCK', 'OWNED', 900,
                    249.5, 'NOK', '2026-08-20', 'batch-json', 'PO-JSON', 'STANDARD_BATCH'
                 ),
                 (
                    'receipt_presence_csv', 'master_receipt_presence', 'IN_STOCK', 'OWNED', 800,
                    199.0, 'EUR', '2026-08-21', 'batch-csv', 'PO-CSV', 'STANDARD_BATCH'
                 );",
            )
            .map_err(|error| error.to_string())?;

        db.import_data_content(
            r#"[{"spool_id":"receipt_presence_json","material":"PETG","filament_name":"Basic","color_name":"Blue","purchase_date":"2026-09-01"},{"spool_id":"receipt_presence_json_new","material":"PLA","filament_name":"Basic","color_name":"Red","purchase_date":"2026-09-02"}]"#,
        )
        .map_err(|error| error.to_string())?;
        let json_updated = db
            .get_spool_by_id("receipt_presence_json")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing JSON-updated spool".to_string())?;
        assert_eq!(json_updated.purchase_price, Some(249.5));
        assert_eq!(json_updated.purchase_currency.as_deref(), Some("NOK"));
        assert_eq!(json_updated.purchase_date.as_deref(), Some("2026-09-01"));
        assert_eq!(json_updated.batch_code.as_deref(), Some("batch-json"));
        assert_eq!(json_updated.supplier_reference.as_deref(), Some("PO-JSON"));
        assert_eq!(
            json_updated.purchase_price_source.as_deref(),
            Some("STANDARD_BATCH")
        );
        let json_new = db
            .get_spool_by_id("receipt_presence_json_new")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing JSON-created spool".to_string())?;
        assert_eq!(json_new.purchase_price, None);
        assert_eq!(json_new.purchase_currency, None);
        assert_eq!(json_new.purchase_date.as_deref(), Some("2026-09-02"));
        assert_eq!(json_new.batch_code, None);
        assert_eq!(json_new.supplier_reference, None);

        db.import_data_content(
            "spool_id,material,filament_name,color_name,supplier_reference\n\
             receipt_presence_csv,PETG,Basic,Blue,PO-CSV-UPDATED\n\
             receipt_presence_csv_new,ABS,Basic,Black,PO-NEW\n",
        )
        .map_err(|error| error.to_string())?;
        let csv_updated = db
            .get_spool_by_id("receipt_presence_csv")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing CSV-updated spool".to_string())?;
        assert_eq!(csv_updated.purchase_price, Some(199.0));
        assert_eq!(csv_updated.purchase_currency.as_deref(), Some("EUR"));
        assert_eq!(csv_updated.purchase_date.as_deref(), Some("2026-08-21"));
        assert_eq!(csv_updated.batch_code.as_deref(), Some("batch-csv"));
        assert_eq!(
            csv_updated.supplier_reference.as_deref(),
            Some("PO-CSV-UPDATED")
        );
        assert_eq!(
            csv_updated.purchase_price_source.as_deref(),
            Some("STANDARD_BATCH")
        );
        let csv_new = db
            .get_spool_by_id("receipt_presence_csv_new")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing CSV-created spool".to_string())?;
        assert_eq!(csv_new.purchase_price, None);
        assert_eq!(csv_new.purchase_currency, None);
        assert_eq!(csv_new.purchase_date, None);
        assert_eq!(csv_new.batch_code, None);
        assert_eq!(csv_new.supplier_reference.as_deref(), Some("PO-NEW"));

        db.import_data_content(
            r#"[{"spool_id":"receipt_presence_json","material":"PETG","filament_name":"Basic","color_name":"Blue","purchase_date":null}]"#,
        )
        .map_err(|error| error.to_string())?;
        let json_cleared = db
            .get_spool_by_id("receipt_presence_json")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing JSON-cleared spool".to_string())?;
        assert_eq!(json_cleared.purchase_date, None);
        assert_eq!(json_cleared.purchase_price, Some(249.5));
        assert_eq!(json_cleared.purchase_currency.as_deref(), Some("NOK"));
        assert_eq!(json_cleared.batch_code.as_deref(), Some("batch-json"));
        assert_eq!(json_cleared.supplier_reference.as_deref(), Some("PO-JSON"));

        db.import_data_content(
            "spool_id,material,filament_name,color_name,batch_code\n\
             receipt_presence_csv,PETG,Basic,Blue,\n",
        )
        .map_err(|error| error.to_string())?;
        let csv_cleared = db
            .get_spool_by_id("receipt_presence_csv")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing CSV-cleared spool".to_string())?;
        assert_eq!(csv_cleared.batch_code, None);
        assert_eq!(csv_cleared.purchase_price, Some(199.0));
        assert_eq!(csv_cleared.purchase_currency.as_deref(), Some("EUR"));
        assert_eq!(csv_cleared.purchase_date.as_deref(), Some("2026-08-21"));
        assert_eq!(
            csv_cleared.supplier_reference.as_deref(),
            Some("PO-CSV-UPDATED")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "lightweight_inventory_purchase_metadata_is_presence_aware_per_field failed: {message}"
        );
    }
}

#[test]
fn lightweight_inventory_subset_import_preserves_status_qr_locations_and_returned_loans() {
    let db_path = temp_db_path("inventory-subset-presence");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO inventory_locations (id, name, type) VALUES
                    ('subset-json-current', 'JSON current', 'GENERIC'),
                    ('subset-json-home', 'JSON home', 'GENERIC'),
                    ('subset-csv-current', 'CSV current', 'GENERIC'),
                    ('subset-csv-home', 'CSV home', 'GENERIC');
                 INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'master_subset_presence', 'PETG', 'Basic', 'Blue', 1000, 'Generic',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, qr_code, status, ownership_type, owner_name,
                    initial_weight_g, current_weight_g, remaining_g, location_id,
                    home_location_id
                 ) VALUES
                    ('subset-json', 'master_subset_presence', 'qr-json', 'EMPTY', 'OWNED', NULL,
                     1000, 0, 0, 'subset-json-current', 'subset-json-home'),
                    ('subset-csv', 'master_subset_presence', 'qr-csv', 'LOST', 'OWNED', NULL,
                     1000, 400, 400, 'subset-csv-current', 'subset-csv-home'),
                    ('returned-inbound-subset', 'master_subset_presence', 'qr-returned',
                     'IN_STOCK', 'BORROWED_IN', 'Mina', 1000, 700, 700, NULL, NULL),
                    ('owned-transition-subset', 'master_subset_presence', NULL,
                     'IN_STOCK', 'OWNED', NULL, 1000, 800, 800, NULL, NULL);",
            )
            .map_err(|error| error.to_string())?;

        let returned = db
            .create_inbound_spool_loan(
                "returned-inbound-subset",
                "Mina",
                None,
                Some("Return after test"),
                700,
            )
            .map_err(|error| error.to_string())?;
        db.return_inbound_spool_loan(&returned.id, 650, None)
            .map_err(|error| error.to_string())?;

        db.import_data_content(
            r#"[{"spool_id":"subset-json","material":"PETG","filament_name":"Basic","color_name":"Blue","status":"   ","remaining_g":25}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,status,remaining_g\n\
             subset-csv,PETG,Basic,Blue,,375\n",
        )
        .map_err(|error| error.to_string())?;

        for (spool_id, status, qr, current, home) in [
            (
                "subset-json",
                "EMPTY",
                "qr-json",
                "subset-json-current",
                "subset-json-home",
            ),
            (
                "subset-csv",
                "LOST",
                "qr-csv",
                "subset-csv-current",
                "subset-csv-home",
            ),
        ] {
            let spool = db
                .get_spool_by_id(spool_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("missing subset-imported spool {spool_id}"))?;
            assert_eq!(spool.status, status);
            assert_eq!(spool.qr_code.as_deref(), Some(qr));
            assert_eq!(spool.location_id.as_deref(), Some(current));
            assert_eq!(spool.home_location_id.as_deref(), Some(home));
        }

        db.import_data_content(
            r#"[{"spool_id":"subset-json","material":"PETG","filament_name":"Basic","color_name":"Blue","qr_code":null,"location_name":null}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,qr_code,location_name\n\
             subset-csv,PETG,Basic,Blue,,\n",
        )
        .map_err(|error| error.to_string())?;
        for (spool_id, status, home) in [
            ("subset-json", "EMPTY", "subset-json-home"),
            ("subset-csv", "LOST", "subset-csv-home"),
        ] {
            let spool = db
                .get_spool_by_id(spool_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("missing current-location-cleared spool {spool_id}"))?;
            assert_eq!(spool.status, status);
            assert_eq!(spool.qr_code, None);
            assert_eq!(spool.location_id, None);
            assert_eq!(spool.home_location_id.as_deref(), Some(home));
        }

        db.import_data_content(
            r#"[{"spool_id":"subset-json","material":"PETG","filament_name":"Basic","color_name":"Blue","home_location_name":null}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,home_location_name\n\
             subset-csv,PETG,Basic,Blue,\n",
        )
        .map_err(|error| error.to_string())?;
        for (spool_id, status) in [("subset-json", "EMPTY"), ("subset-csv", "LOST")] {
            let spool = db
                .get_spool_by_id(spool_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("missing home-location-cleared spool {spool_id}"))?;
            assert_eq!(spool.status, status);
            assert_eq!(spool.qr_code, None);
            assert_eq!(spool.location_id, None);
            assert_eq!(spool.home_location_id, None);
        }

        db.import_data_content(
            r#"[{"spool_id":"returned-inbound-subset","material":"PETG","filament_name":"Basic","color_name":"Blue","remaining_g":640}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,status,remaining_g\n\
             returned-inbound-subset,PETG,Basic,Blue,,630\n",
        )
        .map_err(|error| error.to_string())?;
        let returned_spool = db
            .get_spool_by_id("returned-inbound-subset")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing returned inbound spool".to_string())?;
        assert_eq!(returned_spool.status, "DELETED");
        assert_eq!(returned_spool.ownership_type, "BORROWED_IN");
        let returned_loan_counts: (i64, i64) = db
            .conn
            .query_row(
                "SELECT COUNT(*),
                        SUM(CASE WHEN loan_status = 'ACTIVE' AND returned_at IS NULL THEN 1 ELSE 0 END)
                 FROM spool_loans
                 WHERE spool_id = 'returned-inbound-subset'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(returned_loan_counts, (1, 0));

        db.import_data_content(
            r#"[{"spool_id":"owned-transition-subset","material":"PETG","filament_name":"Basic","color_name":"Blue","ownership_type":"BORROWED_IN","owner_name":"Ada"}]"#,
        )
        .map_err(|error| error.to_string())?;
        let transition_active_loans: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM spool_loans
                 WHERE spool_id = 'owned-transition-subset'
                   AND loan_status = 'ACTIVE'
                   AND returned_at IS NULL",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(transition_active_loans, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "lightweight_inventory_subset_import_preserves_status_qr_locations_and_returned_loans failed: {message}"
        );
    }
}

#[test]
fn lightweight_inventory_round_trip_drops_foreign_system_placements() {
    let source_path = temp_db_path("inventory-system-placement-source");
    let csv_path = temp_db_path("inventory-system-placement-csv");
    let json_path = temp_db_path("inventory-system-placement-json");

    let result = (|| -> Result<(), String> {
        let source = FilamentDatabase::open(&source_path).map_err(|error| error.to_string())?;
        source.apply_schema().map_err(|error| error.to_string())?;
        source
            .conn
            .execute_batch(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES ('portable-home', 'Portable shelf', 'SHELF');
                 INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'portable-master', 'PLA', 'Basic', 'Black', 1000, 'Generic',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, location_id, home_location_id
                 ) VALUES
                    ('portable-assigned', 'portable-master', 'IN_STOCK', 'OWNED',
                     1000, 900, 900, 'portable-home', 'portable-home'),
                    ('portable-borrowed', 'portable-master', 'IN_STOCK', 'OWNED',
                     1000, 800, 800, 'portable-home', 'portable-home');",
            )
            .map_err(|error| error.to_string())?;
        source
            .upsert_printer_with_ams("portable-printer", "P1S", "Workshop", 1, 4)
            .map_err(|error| error.to_string())?;
        source
            .assign_spool_to_ams_slot(
                "portable-printer",
                "portable-printer_ams_1_slot_1",
                Some("portable-assigned"),
                None,
                None,
                false,
            )
            .map_err(|error| error.to_string())?;
        source
            .create_spool_loan("portable-borrowed", "Ada", 800, None)
            .map_err(|error| error.to_string())?;

        let csv = source
            .export_spools_csv()
            .map_err(|error| error.to_string())?;
        let json_export = source
            .export_spools_json()
            .map_err(|error| error.to_string())?;
        let exported_rows: Vec<serde_json::Value> =
            serde_json::from_str(&json_export).map_err(|error| error.to_string())?;
        let assigned_export = exported_rows
            .iter()
            .find(|row| row["spool_id"] == "portable-assigned")
            .ok_or_else(|| "missing assigned export row".to_string())?;
        assert_eq!(assigned_export["location_type"], "PRINTER_SLOT");
        assert_eq!(assigned_export["home_location_type"], "GENERIC");
        let borrowed_export = exported_rows
            .iter()
            .find(|row| row["spool_id"] == "portable-borrowed")
            .ok_or_else(|| "missing borrowed export row".to_string())?;
        assert_eq!(borrowed_export["location_type"], "LOAN");
        assert_eq!(borrowed_export["home_location_type"], "GENERIC");

        for (destination_path, content) in [(&csv_path, csv), (&json_path, json_export)] {
            let destination =
                FilamentDatabase::open(destination_path).map_err(|error| error.to_string())?;
            destination
                .apply_schema()
                .map_err(|error| error.to_string())?;
            destination
                .import_data_content(&content)
                .map_err(|error| error.to_string())?;

            for spool_id in ["portable-assigned", "portable-borrowed"] {
                let spool = destination
                    .get_spool_by_id(spool_id)
                    .map_err(|error| error.to_string())?
                    .ok_or_else(|| format!("missing imported spool {spool_id}"))?;
                assert_eq!(spool.status, "IN_STOCK");
                assert_eq!(spool.location_id, None);
                let home_name: Option<String> = destination
                    .conn
                    .query_row(
                        "SELECT name FROM inventory_locations WHERE id = ?1",
                        [spool.home_location_id.as_deref().unwrap_or_default()],
                        |row| row.get(0),
                    )
                    .map_err(|error| error.to_string())?;
                assert_eq!(home_name.as_deref(), Some("Portable shelf"));
            }

            let system_locations: i64 = destination
                .conn
                .query_row(
                    "SELECT COUNT(*)
                     FROM inventory_locations
                     WHERE type <> 'GENERIC'
                        OR name LIKE 'Printer:%'
                        OR name LIKE 'Loaned to:%'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            assert_eq!(
                system_locations, 0,
                "system placements must not become shelves"
            );
        }
        Ok(())
    })();

    for path in [&source_path, &csv_path, &json_path] {
        let _ = std::fs::remove_file(path);
    }
    if let Err(message) = result {
        panic!(
            "lightweight_inventory_round_trip_drops_foreign_system_placements failed: {message}"
        );
    }
}

#[test]
fn lightweight_import_normalizes_or_preserves_relation_owned_statuses() {
    let db_path = temp_db_path("inventory-managed-status-import");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES ('orphan-system-location', 'Orphan · AMS 1 · Slot 1', 'PRINTER_SLOT')",
                [],
            )
            .map_err(|error| error.to_string())?;
        db.import_data_content(
            &json!([{
                "spool_id": "dangling-existing-system-location",
                "material": "PLA",
                "filament_name": "Basic",
                "color_name": "White",
                "status": "ASSIGNED",
                "location_id": "orphan-system-location",
                "location_name": "Orphan · AMS 1 · Slot 1",
                "location_type": "PRINTER_SLOT"
            }])
            .to_string(),
        )
        .map_err(|error| error.to_string())?;
        let dangling_existing_system_location = db
            .get_spool_by_id("dangling-existing-system-location")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing spool imported with existing system location".to_string())?;
        assert_eq!(dangling_existing_system_location.status, "IN_STOCK");
        assert_eq!(dangling_existing_system_location.location_id, None);

        db.import_data_content(
            &json!([{
                "spool_id": "structured-untyped-system-location",
                "material": "PLA",
                "filament_name": "Basic",
                "color_name": "Natural",
                "status": "IN_STOCK",
                "location_id": "orphan-system-location",
                "home_location_id": "orphan-system-location",
                "home_location_name": null
            }])
            .to_string(),
        )
        .map_err(|error| error.to_string())?;
        let structured_untyped_system_location = db
            .get_spool_by_id("structured-untyped-system-location")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing spool imported with untyped system location".to_string())?;
        assert_eq!(structured_untyped_system_location.status, "IN_STOCK");
        assert_eq!(structured_untyped_system_location.location_id, None);
        assert_eq!(structured_untyped_system_location.home_location_id, None);

        db.import_data_content(
            "spool_id,material,filament_name,color_name,status,location\nlegacy-existing-system-location,PLA,Basic,Silver,IN_STOCK,orphan-system-location\n",
        )
        .map_err(|error| error.to_string())?;
        let legacy_existing_system_location = db
            .get_spool_by_id("legacy-existing-system-location")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing legacy spool imported with system location".to_string())?;
        assert_eq!(legacy_existing_system_location.location_id, None);
        assert_eq!(legacy_existing_system_location.home_location_id, None);

        db.import_data_content(
            r#"[{"spool_id":"dangling-assigned","material":"PLA","filament_name":"Basic","color_name":"Blue","status":"ASSIGNED"}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,status,location\ndangling-borrowed,PETG,Basic,Red,BORROWED,\n",
        )
        .map_err(|error| error.to_string())?;
        for spool_id in ["dangling-assigned", "dangling-borrowed"] {
            let spool = db
                .get_spool_by_id(spool_id)
                .map_err(|error| error.to_string())?
                .ok_or_else(|| format!("missing normalized spool {spool_id}"))?;
            assert_eq!(spool.status, "IN_STOCK");
            assert_eq!(spool.location_id, None);
        }

        db.import_data_content(
            r#"[{"spool_id":"orphan-borrowed-lock","material":"PLA","filament_name":"Basic","color_name":"Yellow","status":"IN_STOCK","ownership_type":"OWNED","location":"Original orphan shelf"}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "UPDATE filament_spools SET status = 'BORROWED' WHERE id = ?1",
                ["orphan-borrowed-lock"],
            )
            .map_err(|error| error.to_string())?;
        let orphan_before = db
            .get_spool_by_id("orphan-borrowed-lock")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing orphan BORROWED spool".to_string())?;
        db.import_data_content(
            r#"[{"spool_id":"orphan-borrowed-lock","material":"PLA","filament_name":"Basic","color_name":"Yellow","status":"IN_STOCK","ownership_type":"BORROWED_IN","owner_name":"Imported owner","home_location_name":"Imported orphan shelf"}]"#,
        )
        .map_err(|error| error.to_string())?;
        let orphan_after = db
            .get_spool_by_id("orphan-borrowed-lock")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing orphan BORROWED spool after import".to_string())?;
        assert_eq!(orphan_after.status, "BORROWED");
        assert_eq!(orphan_after.ownership_type, orphan_before.ownership_type);
        assert_eq!(orphan_after.owner_name, orphan_before.owner_name);
        assert_eq!(orphan_after.location_id, orphan_before.location_id);
        assert_eq!(
            orphan_after.home_location_id,
            orphan_before.home_location_id
        );
        let orphan_side_effect_count: i64 = db
            .conn
            .query_row(
                "SELECT
                    (SELECT COUNT(*) FROM inventory_locations WHERE name = 'Imported orphan shelf')
                    + (SELECT COUNT(*) FROM spool_loans WHERE spool_id = 'orphan-borrowed-lock')",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(orphan_side_effect_count, 0);

        db.conn
            .execute_batch(
                "INSERT INTO inventory_locations (id, name, type)
                 VALUES ('relation-home', 'Relation shelf', 'GENERIC');
                 UPDATE filament_spools
                 SET location_id = 'relation-home', home_location_id = 'relation-home'
                 WHERE id IN ('dangling-assigned', 'dangling-borrowed');",
            )
            .map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("relation-printer", "P1S", "Studio", 1, 4)
            .map_err(|error| error.to_string())?;
        db.assign_spool_to_ams_slot(
            "relation-printer",
            "relation-printer_ams_1_slot_1",
            Some("dangling-assigned"),
            None,
            None,
            false,
        )
        .map_err(|error| error.to_string())?;
        db.create_spool_loan("dangling-borrowed", "Grace", 700, None)
            .map_err(|error| error.to_string())?;

        db.import_data_content(
            r#"[{"spool_id":"dangling-assigned","material":"PLA","filament_name":"Basic","color_name":"Blue","status":"BORROWED"}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            "spool_id,material,filament_name,color_name,status,location\ndangling-borrowed,PETG,Basic,Red,ASSIGNED,\n",
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            r#"[{"spool_id":"dangling-borrowed","material":"PETG","filament_name":"Basic","color_name":"Red","status":"BORROWED","home_location_name":"Imported loan shelf"}]"#,
        )
        .map_err(|error| error.to_string())?;

        let assigned = db
            .get_spool_by_id("dangling-assigned")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing assigned relation spool".to_string())?;
        assert_eq!(assigned.status, "ASSIGNED");
        assert!(assigned
            .location_id
            .as_deref()
            .is_some_and(|location| location.starts_with("Printer:Studio:")));
        assert_eq!(assigned.home_location_id.as_deref(), Some("relation-home"));

        let borrowed = db
            .get_spool_by_id("dangling-borrowed")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing borrowed relation spool".to_string())?;
        assert_eq!(borrowed.status, "BORROWED");
        assert_eq!(borrowed.location_id.as_deref(), Some("Loaned to: Grace"));
        assert_eq!(borrowed.home_location_id.as_deref(), Some("relation-home"));
        let imported_loan_shelf_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM inventory_locations WHERE name = 'Imported loan shelf'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(imported_loan_shelf_count, 0);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "lightweight_import_normalizes_or_preserves_relation_owned_statuses failed: {message}"
        );
    }
}

#[test]
fn lightweight_import_always_protects_historical_prices() {
    let db_path = temp_db_path("inventory-historical-price-lock-import");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.import_data_content(
            "spool_id,material,filament_name,color_name,status\nlegacy-empty,PLA,Basic,White,EMPTY\n",
        )
        .map_err(|error| error.to_string())?;
        let created_historical = db
            .get_spool_by_id("legacy-empty")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing imported historical spool".to_string())?;
        assert!(created_historical.purchase_price_batch_locked);

        db.import_data_content(
            r#"[{"spool_id":"legacy-update","material":"PETG","filament_name":"Basic","color_name":"Black","status":"IN_STOCK","purchase_price_batch_locked":false}]"#,
        )
        .map_err(|error| error.to_string())?;
        db.import_data_content(
            r#"[{"spool_id":"legacy-update","material":"PETG","filament_name":"Basic","color_name":"Black","status":"LOST","purchase_price_batch_locked":false}]"#,
        )
        .map_err(|error| error.to_string())?;
        let updated_historical = db
            .get_spool_by_id("legacy-update")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing updated historical spool".to_string())?;
        assert!(updated_historical.purchase_price_batch_locked);
        assert!(db
            .list_spool_history_events("legacy-update", 20)
            .map_err(|error| error.to_string())?
            .iter()
            .any(|event| {
                event.event_type == "PURCHASE_PRICE_BATCH_LOCK_UPDATED"
                    && event.payload_json["source"] == "INVENTORY_IMPORT"
            }));

        db.import_data_content(
            r#"[{"spool_id":"legacy-update","material":"PETG","filament_name":"Basic","color_name":"Black","status":"IN_STOCK"}]"#,
        )
        .map_err(|error| error.to_string())?;
        let reactivated = db
            .get_spool_by_id("legacy-update")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing reactivated historical spool".to_string())?;
        assert_eq!(reactivated.status, "IN_STOCK");
        assert!(reactivated.purchase_price_batch_locked);

        db.import_data_content(
            r#"[{"spool_id":"legacy-update","material":"PETG","filament_name":"Basic","color_name":"Black","remaining_g":"invalid"}]"#,
        )
        .expect_err("invalid weight must reject the import");
        db.import_data_content(
            "spool_id,material,filament_name,color_name,remaining_g\nlegacy-update,PETG,Basic,Black,-25\n",
        )
        .expect_err("negative CSV weight must reject the import");
        let after_invalid_weight = db
            .get_spool_by_id("legacy-update")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing spool after rejected weight import".to_string())?;
        assert_eq!(after_invalid_weight.remaining_g, reactivated.remaining_g);
        assert!(after_invalid_weight.purchase_price_batch_locked);
        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("lightweight_import_always_protects_historical_prices failed: {message}");
    }
}

#[test]
fn legacy_inventory_location_imports_keep_name_and_id_compatibility() {
    let db_path = temp_db_path("legacy-inventory-location-import");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let existing = db
            .create_inventory_location("Existing shelf", None)
            .map_err(|error| error.to_string())?;

        db.import_data_content(&format!(
            r#"[{{"spool_id":"legacy-id","material":"PLA","filament_name":"Basic","color_name":"Blue","location":"{}"}}]"#,
            existing.id
        ))
        .map_err(|error| error.to_string())?;
        let legacy_id = db
            .get_spool_by_id("legacy-id")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing legacy id spool".to_string())?;
        assert_eq!(legacy_id.location_id.as_deref(), Some(existing.id.as_str()));
        assert_eq!(legacy_id.home_location_id, legacy_id.location_id);
        let location_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM inventory_locations", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(
            location_count, 1,
            "an existing opaque id must not become a name"
        );

        db.import_data_content(
            "spool_id,material,filament_name,color_name,location\nlegacy-name,PETG,Basic,Red,Legacy CSV shelf\n",
        )
        .map_err(|error| error.to_string())?;
        let legacy_name = db
            .get_spool_by_id("legacy-name")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing legacy name spool".to_string())?;
        assert_eq!(legacy_name.location_id, legacy_name.home_location_id);
        let stored_name: String = db
            .conn
            .query_row(
                "SELECT name FROM inventory_locations WHERE id = ?1",
                [legacy_name.location_id.as_deref().unwrap_or_default()],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(stored_name, "Legacy CSV shelf");

        let unknown_json_location = "location_0123456789abcdef0123456789abcdef";
        db.import_data_content(&format!(
            r#"[{{"spool_id":"legacy-unknown-json-id","material":"PLA","filament_name":"Basic","color_name":"Black","location":"{unknown_json_location}"}}]"#
        ))
        .map_err(|error| error.to_string())?;
        let unknown_json_spool = db
            .get_spool_by_id("legacy-unknown-json-id")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing legacy unknown-id JSON spool".to_string())?;
        assert_eq!(unknown_json_spool.location_id, None);
        assert_eq!(unknown_json_spool.home_location_id, None);

        let unknown_csv_location = "location_fedcba9876543210fedcba9876543210";
        db.import_data_content(&format!(
            "spool_id,material,filament_name,color_name,location\nlegacy-unknown-csv-id,PETG,Basic,Black,{unknown_csv_location}\n"
        ))
        .map_err(|error| error.to_string())?;
        let unknown_csv_spool = db
            .get_spool_by_id("legacy-unknown-csv-id")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing legacy unknown-id CSV spool".to_string())?;
        assert_eq!(unknown_csv_spool.location_id, None);
        assert_eq!(unknown_csv_spool.home_location_id, None);

        let unknown_structured_location = "location_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        db.import_data_content(&format!(
            r#"[{{"spool_id":"structured-unknown-id","material":"ABS","filament_name":"Basic","color_name":"Gray","location_id":"{unknown_structured_location}","location_name":null,"home_location_id":null,"home_location_name":null}}]"#
        ))
        .map_err(|error| error.to_string())?;
        let unknown_structured_spool = db
            .get_spool_by_id("structured-unknown-id")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "missing structured unknown-id spool".to_string())?;
        assert_eq!(unknown_structured_spool.location_id, None);
        assert_eq!(unknown_structured_spool.home_location_id, None);

        let final_location_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM inventory_locations", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(
            final_location_count, 2,
            "unknown generated ids must not become visible generic locations"
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "legacy_inventory_location_imports_keep_name_and_id_compatibility failed: {message}"
        );
    }
}

#[test]
fn reset_app_state_clears_trusted_lan_pairings_and_paired_browsers() {
    let db_path = temp_db_path("reset-clears-trusted-lan");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.save_trusted_lan_settings(&TrustedLanSettingsRow {
            enabled: true,
            selected_interface_name: Some("Wi-Fi".to_string()),
            selected_interface_address: Some("192.168.1.50".to_string()),
            listen_port: 4278,
        })
        .map_err(|error| error.to_string())?;

        db.create_trusted_lan_pairing(Some("Phone"), "pairing_hash_1", 600)
            .map_err(|error| error.to_string())?;
        db.create_trusted_lan_paired_browser(
            Some("Phone Safari"),
            "device_hash_1",
            Some("https://192.168.1.50:4278"),
        )
        .map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "P1S", "BambuLab P1S", 1, 4)
            .map_err(|error| error.to_string())?;
        db.insert_printer_live_event(
            "printer_1",
            "poll_error",
            &json!({ "message": "temporary live failure" }),
        )
        .map_err(|error| error.to_string())?;

        let pairings_before: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM trusted_lan_pairings", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let browsers_before: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM trusted_lan_paired_browsers",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let live_events_before: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM printer_live_events", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        assert!(pairings_before > 0);
        assert!(browsers_before > 0);
        assert!(live_events_before > 0);

        db.reset_app_state_data()
            .map_err(|error| error.to_string())?;

        let pairings_after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM trusted_lan_pairings", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let browsers_after: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM trusted_lan_paired_browsers",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let live_events_after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM printer_live_events", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let printers_after: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM printers", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert_eq!(pairings_after, 0);
        assert_eq!(browsers_after, 0);
        assert_eq!(live_events_after, 0);
        assert_eq!(printers_after, 0);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("reset_app_state_clears_trusted_lan_pairings_and_paired_browsers failed: {message}");
    }
}

#[test]
fn reset_app_state_clears_fk_graph_without_dropping_catalog_data() {
    let db_path = temp_db_path("reset-app-state-fk-graph");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.conn
            .execute_batch(
                "
                INSERT INTO filament_master_list (
                  id, material, filament_name, color_name, default_weight, vendor
                ) VALUES ('master_1', 'PLA', 'Basic', 'Blue', 1000, 'Bambu');

                INSERT INTO inventory_locations (id, name, type)
                VALUES ('location_1', 'Shelf A', 'SHELF');

                INSERT INTO filament_spools (
                  id, master_id, status, initial_weight_g, remaining_g, location_id, home_location_id
                ) VALUES ('spool_1', 'master_1', 'IN_STOCK', 1000, 900, 'location_1', 'location_1');

                INSERT INTO spool_history_events (id, spool_id, event_type, payload_json)
                VALUES ('history_1', 'spool_1', 'CREATED', '{}');

                INSERT INTO spool_loans (id, spool_id, borrower_name, grams_out)
                VALUES ('loan_1', 'spool_1', 'Alex', 100);

                INSERT INTO printers (id, model, name)
                VALUES ('printer_1', 'P1S', 'Workshop P1S');

                INSERT INTO ams_units (id, printer_id, slot_count)
                VALUES ('ams_1', 'printer_1', 4);

                INSERT INTO ams_slots (id, ams_id, slot_index, spool_id, last_seen_at)
                VALUES ('slot_1', 'ams_1', 1, 'spool_1', datetime('now'));

                INSERT INTO print_jobs (
                  id, printer_id, spool_id, job_name, started_at, ended_at, material_used_g, success
                ) VALUES ('print_1', 'printer_1', 'spool_1', 'Calibration', datetime('now'), datetime('now'), 10, 1);

                INSERT INTO printer_live_events (id, printer_id, event_type, payload_json)
                VALUES ('live_1', 'printer_1', 'poll', '{}');

                INSERT INTO scales (id, name, protocol)
                VALUES ('scale_1', 'Bench scale', 'manual');

                INSERT INTO weight_readings (id, scale_id, spool_id, grams, captured_at, source)
                VALUES ('reading_1', 'scale_1', 'spool_1', 900, datetime('now'), 'manual');

                INSERT INTO scan_events (id, spool_id, qr_code, source)
                VALUES ('scan_1', 'spool_1', 'qr_1', 'manual');

                INSERT INTO label_templates (id, name, layout_json)
                VALUES ('template_1', 'Default', '{}');

                INSERT INTO label_print_jobs (id, template_id, spool_id, status)
                VALUES ('label_job_1', 'template_1', 'spool_1', 'DONE');

                INSERT INTO purchase_recommendations (id, material, color_name, reason, confidence)
                VALUES ('recommendation_1', 'PLA', 'Blue', 'Low stock', 0.9);

                INSERT INTO wishlist_items (
                  id, master_id, material, filament_name, color_name, vendor
                ) VALUES ('wishlist_1', 'master_1', 'PLA', 'Basic', 'Blue', 'Bambu');

                INSERT INTO alerts (id, type, payload_json)
                VALUES ('alert_1', 'LOW_STOCK', '{}');

                INSERT INTO settings (key, value)
                VALUES ('theme', 'dark');

                INSERT INTO trusted_lan_pairings (id, display_name, pairing_token_hash, expires_at)
                VALUES ('pairing_1', 'Phone', 'pairing_hash_1', datetime('now', '+10 minutes'));

                INSERT INTO trusted_lan_paired_browsers (id, display_name, device_token_hash)
                VALUES ('browser_1', 'Phone Safari', 'device_hash_1');

                INSERT INTO sync_queue (id, action_type, payload_json)
                VALUES ('sync_1', 'UPSERT', '{}');
                ",
            )
            .map_err(|error| error.to_string())?;

        db.reset_app_state_data()
            .map_err(|error| error.to_string())?;

        for table in RESET_APP_STATE_TABLES {
            let count: i64 = db
                .conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .map_err(|error| error.to_string())?;
            assert_eq!(count, 0, "{table} should be empty after app-state reset");
        }

        let master_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM filament_master_list", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        let template_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM label_templates", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert_eq!(master_count, EXPECTED_SEEDED_CATALOG_COUNT + 1);
        let preserved_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(preserved_master_count, 1);
        assert_eq!(template_count, 1);

        let mut statement = db
            .conn
            .prepare("PRAGMA foreign_key_check")
            .map_err(|error| error.to_string())?;
        let mut rows = statement.query([]).map_err(|error| error.to_string())?;
        assert!(
            rows.next().map_err(|error| error.to_string())?.is_none(),
            "app-state reset should not leave foreign key violations"
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("reset_app_state_clears_fk_graph_without_dropping_catalog_data failed: {message}");
    }
}

#[test]
fn library_sync_settings_default_and_persist_cleanly() {
    let db_path = temp_db_path("library-sync-settings");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let defaults = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert_eq!(defaults.mode, "STANDALONE");
        assert!(!defaults.device_name.trim().is_empty());
        assert!(!defaults.library_id.trim().is_empty());
        assert_eq!(defaults.host_base_url, None);

        let saved = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "CLIENT".to_string(),
                device_name: "Workshop Windows".to_string(),
                library_id: defaults.library_id.clone(),
                host_base_url: Some("http://192.168.1.25:4278/".to_string()),
                target_generation: defaults.target_generation,
                host_device_name: Some("Main Host".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: None,
                last_reachable_at: None,
                last_validation_message: None,
                low_stock_policy: Default::default(),
                low_stock_policy_valid: true,
                cached_snapshot: None,
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
                cached_consumption: None,
                cached_wishlist: None,
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(saved.mode, "CLIENT");
        assert_eq!(saved.device_name, "Workshop Windows");
        assert_eq!(
            saved.host_base_url.as_deref(),
            Some("http://192.168.1.25:4278")
        );
        assert_eq!(saved.host_device_name.as_deref(), Some("Main Host"));

        db.save_library_sync_cached_consumption(&[FilamentConsumptionRow {
            printer_id: Some("printer-1".to_string()),
            printer_name: Some("Main printer".to_string()),
            material: "PLA".to_string(),
            filament_name: "Basic".to_string(),
            color_name: "Gray".to_string(),
            hex_color: Some("#808080".to_string()),
            vendor: "Bambu".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            used_grams: 250,
            jobs: 2,
        }])
        .map_err(|error| error.to_string())?;
        let cached = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        let cached_consumption = cached
            .cached_consumption
            .ok_or_else(|| "cached consumption was not persisted".to_string())?;
        assert_eq!(cached_consumption.rows.len(), 1);
        assert_eq!(cached_consumption.rows[0].material, "PLA");
        assert_eq!(cached_consumption.rows[0].used_grams, 250);

        let host_saved = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "HOST".to_string(),
                device_name: "Always-on PC".to_string(),
                library_id: saved.library_id.clone(),
                host_base_url: Some("http://should-clear".to_string()),
                target_generation: defaults.target_generation,
                host_device_name: Some("Should clear".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: Some("should clear".to_string()),
                last_reachable_at: Some("should clear".to_string()),
                last_validation_message: Some("should clear".to_string()),
                low_stock_policy: Default::default(),
                low_stock_policy_valid: true,
                cached_snapshot: Some(LibrarySyncCachedSnapshotRow {
                    captured_at: "2026-04-09 10:00:00".to_string(),
                    library_id: saved.library_id.clone(),
                    device_name: "Main Host".to_string(),
                    sync_mode: "HOST".to_string(),
                    inventory: InventoryOverview {
                        total_spools: 42,
                        total_owned_spools: 40,
                        total_borrowed_in_spools: 2,
                        in_use: 4,
                        owned_in_use: 3,
                        borrowed_in_in_use: 1,
                        low_stock: 3,
                        owned_low_stock: 2,
                        borrowed_in_low_stock: 1,
                        low_stock_policy: Default::default(),
                        total_consumption_30d: 1200,
                        owned_consumption_30d: 900,
                        borrowed_in_consumption_30d: 300,
                        consumption_12m_available: true,
                        total_consumption_12m: 3600,
                        consumption_12m: vec![MonthlyConsumptionPoint {
                            month: "2026-04".to_string(),
                            used_grams: 3600,
                        }],
                    },
                    total_spools: 42,
                    in_use: 4,
                    low_stock: 3,
                    active_loans: 1,
                    printers: 2,
                }),
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
                cached_consumption: None,
                cached_wishlist: None,
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(host_saved.mode, "HOST");
        assert_eq!(host_saved.host_base_url, None);
        assert_eq!(host_saved.host_device_name, None);
        assert_eq!(host_saved.last_checked_at, None);
        assert_eq!(host_saved.last_reachable_at, None);
        assert_eq!(host_saved.last_validation_message, None);
        assert_eq!(host_saved.cached_snapshot, None);
        assert!(host_saved.cached_spools.is_none());
        assert!(host_saved.cached_printers.is_none());
        assert!(host_saved.cached_loans.is_none());
        assert!(host_saved.cached_consumption.is_none());
        assert!(host_saved.cached_wishlist.is_none());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("library_sync_settings_default_and_persist_cleanly failed: {message}");
    }
}

#[test]
fn corrupt_low_stock_policy_fails_inventory_closed_but_settings_can_repair_it() {
    let db_path = temp_db_path("low-stock-policy-recovery");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.set_setting("low_stock_policy_json", "{damaged")
            .map_err(|error| error.to_string())?;

        let mut settings = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert!(!settings.low_stock_policy_valid);
        assert_eq!(settings.low_stock_policy.default_threshold_g, 200);
        assert!(db.inventory_overview().is_err());
        assert!(db.list_all_spools_with_master().is_err());

        db.save_library_sync_settings(&settings)
            .map_err(|error| error.to_string())?;
        let still_damaged = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert!(!still_damaged.low_stock_policy_valid);
        assert!(db.inventory_overview().is_err());

        settings.low_stock_policy = LowStockPolicy {
            default_threshold_g: 275,
            material_overrides: vec![LowStockMaterialOverride {
                material_key: String::new(),
                material: "PETG".to_string(),
                threshold_g: 325,
            }],
        };
        settings.low_stock_policy_valid = true;
        let repaired = db
            .save_library_sync_settings(&settings)
            .map_err(|error| error.to_string())?;
        assert!(repaired.low_stock_policy_valid);
        assert_eq!(repaired.low_stock_policy.threshold_for_material("PLA"), 275);
        assert_eq!(
            repaired.low_stock_policy.threshold_for_material("petg"),
            325
        );
        assert!(db.inventory_overview().is_ok());
        assert!(db.list_all_spools_with_master().is_ok());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "corrupt_low_stock_policy_fails_inventory_closed_but_settings_can_repair_it failed: {message}"
        );
    }
}

#[test]
fn library_sync_client_auth_and_all_host_caches_clear_when_client_target_changes() {
    let db_path = temp_db_path("library-sync-auth-host-change");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let defaults = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;

        let initial_client = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "CLIENT".to_string(),
                device_name: "Workshop Windows".to_string(),
                library_id: defaults.library_id.clone(),
                host_base_url: Some("http://192.168.1.25:4278".to_string()),
                target_generation: defaults.target_generation,
                host_device_name: Some("Main Host".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: None,
                last_reachable_at: None,
                last_validation_message: None,
                low_stock_policy: Default::default(),
                low_stock_policy_valid: true,
                cached_snapshot: None,
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
                cached_consumption: None,
                cached_wishlist: None,
            })
            .map_err(|error| error.to_string())?;
        assert!(initial_client.target_generation > defaults.target_generation);

        db.save_library_sync_client_auth_state(
            "session-1",
            "device-1",
            "csrf-1",
            Some("2026-04-09 10:30:00"),
        )
        .map_err(|error| error.to_string())?;
        assert!(db
            .get_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?
            .is_some());
        let cached_location = db
            .create_inventory_location("Host A shelf", None)
            .map_err(|error| error.to_string())?;
        seed_all_library_sync_host_caches(&db, &defaults.library_id, &cached_location)?;
        assert_all_library_sync_host_caches_present(&db)?;

        let changed = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "CLIENT".to_string(),
                device_name: "Workshop Windows".to_string(),
                library_id: defaults.library_id.clone(),
                host_base_url: Some("http://192.168.1.99:4278".to_string()),
                target_generation: defaults.target_generation,
                host_device_name: Some("Backup Host".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: None,
                last_reachable_at: None,
                last_validation_message: None,
                low_stock_policy: Default::default(),
                low_stock_policy_valid: true,
                cached_snapshot: None,
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
                cached_consumption: None,
                cached_wishlist: None,
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(
            changed.host_base_url.as_deref(),
            Some("http://192.168.1.99:4278")
        );
        assert!(changed.target_generation > initial_client.target_generation);
        assert!(!changed.client_auth_paired);
        assert!(changed.client_auth_paired_at.is_none());
        assert!(changed.client_auth_expires_at.is_none());
        assert!(db
            .get_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?
            .is_none());
        assert_all_library_sync_host_caches_cleared(&db)?;

        db.save_library_sync_client_auth_state(
            "session-2",
            "device-2",
            "csrf-2",
            Some("2026-04-09 11:00:00"),
        )
        .map_err(|error| error.to_string())?;
        seed_all_library_sync_host_caches(&db, &defaults.library_id, &cached_location)?;
        assert_all_library_sync_host_caches_present(&db)?;
        let mut library_changed_settings = changed.clone();
        library_changed_settings.library_id = "replacement-library".to_string();
        let library_changed = db
            .save_library_sync_settings(&library_changed_settings)
            .map_err(|error| error.to_string())?;

        assert_eq!(library_changed.library_id, "replacement-library");
        assert!(library_changed.target_generation > changed.target_generation);
        assert!(!library_changed.client_auth_paired);
        assert!(db
            .get_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?
            .is_none());
        assert_all_library_sync_host_caches_cleared(&db)?;

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "library_sync_client_auth_and_all_host_caches_clear_when_client_target_changes failed: {message}"
        );
    }
}

#[test]
fn library_sync_client_auth_metadata_survives_secret_scrubbing() {
    let db_path = temp_db_path("library-sync-auth-secret-scrub");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        db.save_library_sync_client_auth_state(
            "session-secret",
            "device-secret",
            "csrf-secret",
            Some("2026-08-01 10:30:00"),
        )
        .map_err(|error| error.to_string())?;
        db.scrub_library_sync_client_auth_secrets()
            .map_err(|error| error.to_string())?;

        assert!(db
            .get_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?
            .is_none());
        let settings = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert!(settings.client_auth_paired);
        assert!(settings.client_auth_paired_at.is_some());
        assert_eq!(
            settings.client_auth_expires_at.as_deref(),
            Some("2026-08-01 10:30:00")
        );

        db.clear_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?;
        assert!(
            !db.get_library_sync_settings()
                .map_err(|error| error.to_string())?
                .client_auth_paired
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("library_sync_client_auth_metadata_survives_secret_scrubbing failed: {message}");
    }
}

#[test]
fn full_backup_export_includes_schema_and_app_version_metadata() {
    let db_path = temp_db_path("backup-export-version-metadata");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let content = db
            .export_full_backup_json()
            .map_err(|error| error.to_string())?;
        let backup: serde_json::Value =
            serde_json::from_str(&content).map_err(|error| error.to_string())?;

        assert_eq!(
            backup
                .get("schema_version")
                .and_then(serde_json::Value::as_i64),
            Some(CURRENT_SCHEMA_VERSION)
        );
        assert_eq!(
            backup
                .get("app_version")
                .and_then(serde_json::Value::as_str),
            Some(env!("CARGO_PKG_VERSION"))
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("full_backup_export_includes_schema_and_app_version_metadata failed: {message}");
    }
}

#[test]
fn full_backup_round_trip_preserves_purchase_metadata_and_accepts_schema_three_rows() {
    let source_path = temp_db_path("backup-purchase-metadata-source");
    let restored_path = temp_db_path("backup-purchase-metadata-restored");
    let legacy_path = temp_db_path("backup-purchase-metadata-legacy");

    let result = (|| -> Result<(), String> {
        let source = FilamentDatabase::open(&source_path).map_err(|error| error.to_string())?;
        source.apply_schema().map_err(|error| error.to_string())?;
        source
            .conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor,
                    catalog_source, catalog_user_edited
                 ) VALUES (
                    'backup_receipt_master', 'PLA', 'Basic', 'Orange', 1000, 'Generic',
                    'manual', 1
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, purchase_price, purchase_currency,
                    purchase_date, batch_code, supplier_reference,
                    purchase_price_batch_locked, purchase_price_source
                 ) VALUES (
                    'backup_receipt_spool', 'backup_receipt_master', 'IN_STOCK', 'OWNED',
                    1000, 900, 900, 349.5, 'NOK', '2026-08-21', 'backup-batch',
                    'invoice-backup-7', 1, 'MANUAL'
                 );
                 INSERT INTO filament_spools (
                    id, master_id, status, ownership_type, initial_weight_g,
                    current_weight_g, remaining_g, purchase_price, purchase_currency,
                    purchase_date, batch_code, supplier_reference
                 ) VALUES (
                    'backup_receipt_legacy_dirty', 'backup_receipt_master', 'IN_STOCK', 'OWNED',
                    1000, 800, 800, -1, NULL, 'legacy-not-a-date', printf('%0121d', 0), NULL
                 );",
            )
            .map_err(|error| error.to_string())?;

        let content = source
            .export_full_backup_json()
            .map_err(|error| error.to_string())?;
        let mut backup: serde_json::Value =
            serde_json::from_str(&content).map_err(|error| error.to_string())?;
        let exported_spool = backup["tables"]["filament_spools"]
            .as_array()
            .and_then(|rows| rows.iter().find(|row| row["id"] == "backup_receipt_spool"))
            .ok_or_else(|| "backup omitted receipt spool".to_string())?;
        assert_eq!(exported_spool["purchase_price"], json!(349.5));
        assert_eq!(exported_spool["purchase_currency"], "NOK");
        assert_eq!(exported_spool["purchase_date"], "2026-08-21");
        assert_eq!(exported_spool["batch_code"], "backup-batch");
        assert_eq!(exported_spool["supplier_reference"], "invoice-backup-7");
        assert_eq!(exported_spool["purchase_price_batch_locked"], 1);
        assert_eq!(exported_spool["purchase_price_source"], "MANUAL");
        let exported_legacy_spool = backup["tables"]["filament_spools"]
            .as_array()
            .and_then(|rows| {
                rows.iter()
                    .find(|row| row["id"] == "backup_receipt_legacy_dirty")
            })
            .ok_or_else(|| "backup omitted dirty legacy receipt spool".to_string())?;
        assert_eq!(exported_legacy_spool["purchase_price"], json!(-1.0));
        assert_eq!(exported_legacy_spool["purchase_currency"], json!(null));
        assert_eq!(exported_legacy_spool["purchase_date"], "legacy-not-a-date");
        assert_eq!(
            exported_legacy_spool["batch_code"].as_str().map(str::len),
            Some(121)
        );

        let restored = FilamentDatabase::open(&restored_path).map_err(|error| error.to_string())?;
        restored.apply_schema().map_err(|error| error.to_string())?;
        let mut invalid_backup = backup.clone();
        let invalid_spool = invalid_backup["tables"]["filament_spools"]
            .as_array_mut()
            .and_then(|rows| {
                rows.iter_mut()
                    .find(|row| row["id"] == "backup_receipt_spool")
            })
            .ok_or_else(|| "could not prepare invalid receipt backup".to_string())?;
        invalid_spool["purchase_price"] = json!({ "invalid": true });
        let invalid_content = invalid_backup.to_string();
        for error in [
            restored
                .validate_full_backup_json(&invalid_content)
                .expect_err("validation must reject invalid backed-up receipt metadata"),
            restored
                .import_full_backup_json(&invalid_content)
                .expect_err("restore must reject invalid backed-up receipt metadata"),
        ] {
            let message = error.to_string();
            assert!(message.contains("field `purchase_price`"), "{message}");
            assert!(message.contains("must be a number or null"), "{message}");
        }
        assert!(
            restored
                .get_spool_by_id("backup_receipt_spool")
                .map_err(|error| error.to_string())?
                .is_none(),
            "invalid backup preflight must not mutate the destination"
        );
        restored
            .import_full_backup_json(&content)
            .map_err(|error| error.to_string())?;
        let restored_spool = restored
            .get_spool_by_id("backup_receipt_spool")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "restored backup omitted receipt spool".to_string())?;
        assert_eq!(restored_spool.purchase_price, Some(349.5));
        assert_eq!(restored_spool.purchase_currency.as_deref(), Some("NOK"));
        assert_eq!(restored_spool.purchase_date.as_deref(), Some("2026-08-21"));
        assert_eq!(restored_spool.batch_code.as_deref(), Some("backup-batch"));
        assert!(restored_spool.purchase_price_batch_locked);
        assert_eq!(
            restored_spool.purchase_price_source.as_deref(),
            Some("MANUAL")
        );
        assert_eq!(
            restored_spool.supplier_reference.as_deref(),
            Some("invoice-backup-7")
        );
        let restored_legacy_spool = restored
            .get_spool_by_id("backup_receipt_legacy_dirty")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "restore omitted dirty legacy receipt spool".to_string())?;
        assert_eq!(restored_legacy_spool.purchase_price, Some(-1.0));
        assert_eq!(restored_legacy_spool.purchase_currency, None);
        assert_eq!(
            restored_legacy_spool.purchase_date.as_deref(),
            Some("legacy-not-a-date")
        );
        assert_eq!(
            restored_legacy_spool.batch_code.as_deref().map(str::len),
            Some(121)
        );

        backup["schema_version"] = json!(3);
        let legacy_spools = backup["tables"]["filament_spools"]
            .as_array_mut()
            .ok_or_else(|| "could not prepare schema-three backup rows".to_string())?;
        for legacy_spool in legacy_spools {
            let legacy_spool = legacy_spool
                .as_object_mut()
                .ok_or_else(|| "schema-three spool row was not an object".to_string())?;
            legacy_spool.remove("purchase_currency");
            legacy_spool.remove("supplier_reference");
            legacy_spool.remove("purchase_price_batch_locked");
            legacy_spool.remove("purchase_price_source");
        }

        let legacy = FilamentDatabase::open(&legacy_path).map_err(|error| error.to_string())?;
        legacy.apply_schema().map_err(|error| error.to_string())?;
        legacy
            .import_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;
        let legacy_spool = legacy
            .get_spool_by_id("backup_receipt_spool")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "legacy backup omitted receipt spool".to_string())?;
        assert_eq!(legacy_spool.purchase_price, Some(349.5));
        assert_eq!(legacy_spool.purchase_currency, None);
        assert_eq!(legacy_spool.supplier_reference, None);
        assert!(!legacy_spool.purchase_price_batch_locked);
        assert_eq!(legacy_spool.purchase_price_source, None);
        assert_eq!(legacy_spool.batch_code.as_deref(), Some("backup-batch"));
        Ok(())
    })();

    let _ = std::fs::remove_file(&source_path);
    let _ = std::fs::remove_file(&restored_path);
    let _ = std::fs::remove_file(&legacy_path);
    if let Err(message) = result {
        panic!("full_backup_round_trip_preserves_purchase_metadata_and_accepts_schema_three_rows failed: {message}");
    }
}

#[test]
fn legacy_full_backup_without_version_metadata_still_imports() {
    let db_path = temp_db_path("backup-import-without-version-metadata");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let mut backup = empty_current_full_backup();
        assert!(backup.get("schema_version").is_none());
        assert!(backup.get("app_version").is_none());
        backup
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .expect("test backup should have a tables object")
            .insert(
                "filament_master_list".to_string(),
                json!([{
                    "id": "master_legacy_metadata",
                    "material": "PLA",
                    "filament_name": "Legacy Basic",
                    "color_name": "Blue",
                    "default_weight": 1000,
                    "vendor": "Generic"
                }]),
            );

        db.validate_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;
        db.import_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;

        let imported_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_legacy_metadata'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(imported_count, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("legacy_full_backup_without_version_metadata_still_imports failed: {message}");
    }
}

#[test]
fn full_backup_rejects_newer_schema_version_without_mutation() {
    let db_path = temp_db_path("backup-rejects-newer-schema-version");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_existing', 'PLA', 'Basic', 'Red', 1000, 'Bambu')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let newer_schema_version = CURRENT_SCHEMA_VERSION + 1;
        let mut backup = empty_current_full_backup();
        backup["schema_version"] = json!(newer_schema_version);
        backup["app_version"] = json!("999.0.0");
        let content = backup.to_string();

        for error in [
            db.validate_full_backup_json(&content)
                .expect_err("validation should reject a newer schema version"),
            db.import_full_backup_json(&content)
                .expect_err("import should reject a newer schema version before mutation"),
        ] {
            let message = error.to_string();
            assert!(
                message.contains(&format!(
                    "Backup schema version {newer_schema_version} is newer than the supported schema version {CURRENT_SCHEMA_VERSION}"
                )),
                "unexpected error: {message}"
            );
        }

        let existing_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_existing'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(existing_master_count, 1);
        assert_eq!(foreign_keys_enabled, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("full_backup_rejects_newer_schema_version_without_mutation failed: {message}");
    }
}

#[test]
fn import_full_backup_ignores_unknown_legacy_columns() {
    let db_path = temp_db_path("backup-import-legacy-columns");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let backup = serde_json::json!({
            "exported_at": "2026-04-09T00:00:00Z",
            "format": "filament-manager-backup-v1",
            "tables": {
                "filament_master_list": [{
                    "id": "master_legacy_1",
                    "material": "PLA",
                    "filament_name": "Basic",
                    "color_name": "Blue",
                    "hex_color": "#3366ff",
                    "image_url": "https://example.invalid/legacy.png",
                    "product_url": "https://example.invalid/product",
                    "default_weight": 1000,
                    "vendor": "Generic",
                    "is_discontinued": 0,
                    "discontinued_at": null,
                    "last_seen_at": null,
                    "created_at": "2026-04-09 00:00:00",
                    "updated_at": "2026-04-09 00:00:00"
                }],
                "filament_spools": [],
                "spool_history_events": [],
                "spool_loans": [],
                "inventory_locations": [],
                "printers": [],
                "ams_units": [],
                "ams_slots": [],
                "print_jobs": [],
                "scales": [],
                "weight_readings": [],
                "scan_events": [],
                "label_templates": [],
                "label_print_jobs": [],
                "purchase_recommendations": [],
                "wishlist_items": [],
                "alerts": [],
                "settings": [],
                "trusted_lan_pairings": [],
                "trusted_lan_paired_browsers": [],
                "sync_queue": []
            }
        });

        let validation = db
            .validate_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;
        assert_eq!(
            validation.missing_tables,
            [
                "printer_live_events",
                "printer_live_usage_sessions",
                "printer_live_usage_session_spools",
            ]
        );

        db.import_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;

        let imported: (String, Option<String>) = db
            .conn
            .query_row(
                "SELECT id, product_url FROM filament_master_list WHERE id = ?1",
                ["master_legacy_1"],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(imported.0, "master_legacy_1");
        assert_eq!(
            imported.1.as_deref(),
            Some("https://example.invalid/product")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("import_full_backup_ignores_unknown_legacy_columns failed: {message}");
    }
}

#[test]
fn full_backup_validation_and_import_reject_missing_required_tables_without_mutation() {
    let db_path = temp_db_path("backup-import-rejects-missing-required-table");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_existing', 'PLA', 'Basic', 'Red', 1000, 'Bambu')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let mut backup = empty_current_full_backup();
        backup
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .expect("test backup should have a tables object")
            .remove("filament_spools");
        let content = backup.to_string();

        for error in [
            db.validate_full_backup_json(&content)
                .expect_err("validation should reject a missing required table"),
            db.import_full_backup_json(&content)
                .expect_err("import should reject a missing required table"),
            db.import_data_content(&content)
                .expect_err("generic file import should reject a declared incomplete backup"),
        ] {
            let message = error.to_string();
            assert!(
                message.contains("Backup is incomplete and cannot be imported safely"),
                "unexpected error: {message}"
            );
            assert!(
                message.contains("filament_spools"),
                "missing table should be named: {message}"
            );
        }

        let existing_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_existing'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(existing_master_count, 1);
        assert_eq!(foreign_keys_enabled, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "full_backup_validation_and_import_reject_missing_required_tables_without_mutation failed: {message}"
        );
    }
}

#[test]
fn full_backup_semantic_preflight_rejects_empty_rows_without_mutation() {
    if let Err(message) = assert_invalid_full_backup_master_row_leaves_database_unchanged(
        "backup-import-rejects-empty-row",
        json!({}),
    ) {
        panic!(
            "full_backup_semantic_preflight_rejects_empty_rows_without_mutation failed: {message}"
        );
    }
}

#[test]
fn full_backup_semantic_preflight_rejects_unknown_only_rows_without_mutation() {
    if let Err(message) = assert_invalid_full_backup_master_row_leaves_database_unchanged(
        "backup-import-rejects-unknown-only-row",
        json!({ "future_only_column": "must not be ignored" }),
    ) {
        panic!(
            "full_backup_semantic_preflight_rejects_unknown_only_rows_without_mutation failed: {message}"
        );
    }
}

#[test]
fn full_backup_import_rejects_truncated_json_without_mutation() {
    let db_path = temp_db_path("backup-import-rejects-truncated-json");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_existing', 'PLA', 'Basic', 'Red', 1000, 'Bambu')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let complete = empty_current_full_backup().to_string();
        let truncated = &complete[..complete.len() - 1];

        db.validate_full_backup_json(truncated)
            .expect_err("validation should reject truncated JSON");
        db.import_full_backup_json(truncated)
            .expect_err("import should reject truncated JSON");

        let existing_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_existing'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(existing_master_count, 1);
        assert_eq!(foreign_keys_enabled, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("full_backup_import_rejects_truncated_json_without_mutation failed: {message}");
    }
}

#[test]
fn import_full_backup_skips_machine_local_sync_and_trusted_lan_state() {
    let db_path = temp_db_path("backup-import-sanitizes-machine-local-state");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let backup = serde_json::json!({
            "exported_at": "2026-04-09T00:00:00Z",
            "format": "filament-manager-backup-v1",
            "tables": {
                "filament_master_list": [],
                "filament_spools": [],
                "spool_history_events": [],
                "spool_loans": [],
                "inventory_locations": [],
                "printers": [],
                "ams_units": [],
                "ams_slots": [],
                "print_jobs": [],
                "scales": [],
                "weight_readings": [],
                "scan_events": [],
                "label_templates": [],
                "label_print_jobs": [],
                "purchase_recommendations": [],
                "wishlist_items": [],
                "alerts": [],
                "settings": [
                    { "key": "library_sync_mode", "value": "HOST" },
                    { "key": "library_sync_host_base_url", "value": "http://192.168.1.10:4278" },
                    { "key": "library_sync_library_id", "value": "library_shared_123" },
                    { "key": "trusted_lan_enabled", "value": "1" },
                    { "key": "theme_mode", "value": "dark" }
                ],
                "trusted_lan_pairings": [
                    {
                        "id": "pairing_1",
                        "browser_label": "iPad",
                        "token_hash": "hash_1",
                        "expires_at": "2026-04-10 00:00:00",
                        "used_at": null,
                        "created_at": "2026-04-09 00:00:00"
                    }
                ],
                "trusted_lan_paired_browsers": [
                    {
                        "id": "browser_1",
                        "browser_label": "iPhone",
                        "device_token_hash": "device_hash_1",
                        "created_from_pairing_id": null,
                        "last_seen_ip": "192.168.1.20",
                        "paired_at": "2026-04-09 00:00:00",
                        "last_seen_at": "2026-04-09 00:00:00",
                        "revoked_at": null
                    }
                ],
                "sync_queue": [
                    {
                        "id": "sync_1",
                        "action_type": "UPDATE",
                        "payload_json": "{}",
                        "created_at": "2026-04-09 00:00:00"
                    }
                ]
            }
        });

        db.import_full_backup_json(&backup.to_string())
            .map_err(|error| error.to_string())?;

        let sync_settings = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;
        assert_eq!(sync_settings.mode, "STANDALONE");
        assert_eq!(sync_settings.library_id, "library_shared_123");
        assert!(sync_settings.host_base_url.is_none());

        let trusted_lan = db
            .get_trusted_lan_settings()
            .map_err(|error| error.to_string())?;
        assert!(!trusted_lan.enabled);

        let paired_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM trusted_lan_paired_browsers",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(paired_count, 0);

        let pairing_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM trusted_lan_pairings", [], |row| {
                row.get(0)
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(pairing_count, 0);

        let sync_queue_count: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM sync_queue", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        assert_eq!(sync_queue_count, 0);

        let theme_mode = db
            .get_setting("theme_mode")
            .map_err(|error| error.to_string())?;
        assert_eq!(theme_mode.as_deref(), Some("dark"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "import_full_backup_skips_machine_local_sync_and_trusted_lan_state failed: {message}"
        );
    }
}

#[test]
fn portable_full_backup_excludes_and_rejects_device_credentials() {
    let source_path = temp_db_path("portable-backup-source");
    let restored_path = temp_db_path("portable-backup-restored");

    let result = (|| -> Result<(), String> {
        let source = FilamentDatabase::open(&source_path).map_err(|error| error.to_string())?;
        source.apply_schema().map_err(|error| error.to_string())?;
        source
            .conn
            .execute_batch(
                r#"
                INSERT INTO printers (id, model, name, ip_address, access_token)
                VALUES ('printer_portable', 'P1S', 'Workshop', '192.168.1.42', 'legacy-token');
                INSERT INTO settings (key, value) VALUES
                    ('theme_mode', 'dark'),
                    ('library_sync_library_id', 'library_portable'),
                    ('trusted_lan_port', '4279'),
                    ('default_purchase_currency', 'NOK'),
                    ('filament_price_standards_json', '{"schema_version":1,"price_standards":[]}'),
                    ('low_stock_policy_json', '{"default_threshold_g":200,"material_overrides":[]}'),
                    ('credential_store_profile_id', 'credential_profile_11111111111111111111111111111111'),
                    ('credential_store_profile_migration_v1', 'complete'),
                    ('library_sync_client_session_id', 'session-secret'),
                    ('library_sync_client_device_token', 'device-secret'),
                    ('library_sync_client_csrf_token', 'csrf-secret'),
                    ('trusted_lan_interface_address', '192.168.1.42'),
                    ('bambu_live_integration:printer_portable',
                     '{"enabled":true,"host":"192.168.1.50","access_code":"bambu-secret","printer_serial":"SERIAL-SECRET","last_error":null,"observed_state":null}');
                INSERT INTO trusted_lan_pairings
                    (id, display_name, pairing_token_hash, expires_at)
                VALUES ('pairing_secret', 'Tablet', 'pairing-secret-hash', '2099-01-01 00:00:00');
                INSERT INTO trusted_lan_paired_browsers
                    (id, display_name, device_token_hash)
                VALUES ('browser_secret', 'Phone', 'browser-secret-hash');
                INSERT INTO sync_queue (id, action_type, payload_json)
                VALUES ('sync_secret', 'WRITE', '{"token":"queued-secret"}');
                "#,
            )
            .map_err(|error| error.to_string())?;

        let exported = source
            .export_full_backup_json()
            .map_err(|error| error.to_string())?;
        for (sensitive_field, marker) in [
            ("legacy printer access token", "legacy-token"),
            ("library session identifier", "session-secret"),
            ("library device token", "device-secret"),
            ("library CSRF token", "csrf-secret"),
            ("Bambu access code", "bambu-secret"),
            ("printer serial number", "SERIAL-SECRET"),
            ("pairing token hash", "pairing-secret-hash"),
            ("browser device token hash", "browser-secret-hash"),
            ("queued synchronization payload", "queued-secret"),
            (
                "credential-store profile identifier",
                "credential_profile_11111111111111111111111111111111",
            ),
            ("trusted LAN interface address", "192.168.1.42"),
            ("Bambu printer address", "192.168.1.50"),
        ] {
            assert!(
                !exported.contains(marker),
                "portable backup retained prohibited device-local field: {sensitive_field}"
            );
        }

        let mut parsed: serde_json::Value =
            serde_json::from_str(&exported).map_err(|error| error.to_string())?;
        let tables = parsed
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| "portable backup tables were missing".to_string())?;
        assert_eq!(
            tables
                .get("trusted_lan_pairings")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        assert_eq!(
            tables
                .get("trusted_lan_paired_browsers")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        assert_eq!(
            tables
                .get("sync_queue")
                .and_then(serde_json::Value::as_array)
                .map(Vec::len),
            Some(0)
        );
        let exported_printer = tables
            .get("printers")
            .and_then(serde_json::Value::as_array)
            .and_then(|rows| rows.first())
            .and_then(serde_json::Value::as_object)
            .ok_or_else(|| "portable printer row was missing".to_string())?;
        assert!(!exported_printer.contains_key("ip_address"));
        assert!(!exported_printer.contains_key("access_token"));
        let exported_setting_keys = tables
            .get("settings")
            .and_then(serde_json::Value::as_array)
            .ok_or_else(|| "portable settings rows were missing".to_string())?
            .iter()
            .filter_map(|row| row.get("key").and_then(serde_json::Value::as_str))
            .collect::<HashSet<_>>();
        assert_eq!(
            exported_setting_keys,
            HashSet::from([
                "theme_mode",
                "library_sync_library_id",
                "trusted_lan_port",
                "default_purchase_currency",
                "filament_price_standards_json",
                "low_stock_policy_json",
            ])
        );

        // Simulate a backup created by an older build that still carried
        // machine-local credentials. The restore path must sanitize it too.
        let printer = tables
            .get_mut("printers")
            .and_then(serde_json::Value::as_array_mut)
            .and_then(|rows| rows.first_mut())
            .and_then(serde_json::Value::as_object_mut)
            .ok_or_else(|| "portable printer row was missing".to_string())?;
        printer.insert(
            "ip_address".to_string(),
            serde_json::Value::String("192.168.1.77".to_string()),
        );
        printer.insert(
            "access_token".to_string(),
            serde_json::Value::String("legacy-import-token".to_string()),
        );
        tables
            .get_mut("settings")
            .and_then(serde_json::Value::as_array_mut)
            .ok_or_else(|| "portable settings rows were missing".to_string())?
            .push(json!({
                "key": "bambu_live_integration:printer_portable",
                "value": "{\"enabled\":true,\"host\":\"192.168.1.77\",\"access_code\":\"import-secret\",\"printer_serial\":\"IMPORT-SERIAL\",\"last_error\":null,\"observed_state\":null}"
            }));

        let restored = FilamentDatabase::open(&restored_path).map_err(|error| error.to_string())?;
        restored.apply_schema().map_err(|error| error.to_string())?;
        restored
            .import_full_backup_json(&parsed.to_string())
            .map_err(|error| error.to_string())?;

        let restored_credentials: (Option<String>, Option<String>) = restored
            .conn
            .query_row(
                "SELECT ip_address, access_token FROM printers WHERE id = 'printer_portable'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(restored_credentials, (None, None));
        assert!(restored
            .list_bambu_live_integrations()
            .map_err(|error| error.to_string())?
            .is_empty());
        assert_eq!(
            restored
                .get_setting("theme_mode")
                .map_err(|error| error.to_string())?
                .as_deref(),
            Some("dark")
        );
        assert_eq!(
            restored
                .get_setting("trusted_lan_port")
                .map_err(|error| error.to_string())?
                .as_deref(),
            Some("4279")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&source_path);
    let _ = std::fs::remove_file(&restored_path);
    if let Err(message) = result {
        panic!("portable_full_backup_excludes_and_rejects_device_credentials failed: {message}");
    }
}

#[test]
fn import_full_backup_rejects_foreign_key_violations_and_rolls_back() {
    let db_path = temp_db_path("backup-import-rejects-fk-violations");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_existing', 'PLA', 'Basic', 'Red', 1000, 'Bambu')",
                [],
            )
            .map_err(|error| error.to_string())?;

        let mut backup = empty_current_full_backup();
        backup
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .expect("test backup should have a tables object")
            .insert(
                "filament_spools".to_string(),
                json!([{
                    "id": "spool_orphan",
                    "master_id": "missing_master",
                    "status": "IN_STOCK"
                }]),
            );

        let error = db
            .import_full_backup_json(&backup.to_string())
            .expect_err("orphaned backup rows should fail before commit");
        let message = error.to_string();
        assert!(
            message.contains("Full backup preflight would leave a foreign key violation"),
            "unexpected error: {message}"
        );

        let existing_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_existing'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let orphan_spool_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_spools WHERE id = 'spool_orphan'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(existing_master_count, 1);
        assert_eq!(orphan_spool_count, 0);
        assert_eq!(foreign_keys_enabled, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "import_full_backup_rejects_foreign_key_violations_and_rolls_back failed: {message}"
        );
    }
}

#[test]
fn import_full_backup_rolls_back_when_post_import_schema_fails() {
    let db_path = temp_db_path("backup-import-post-schema-rollback");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.conn
            .execute_batch(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('master_existing', 'PLA', 'Basic', 'Red', 1000, 'Bambu');

                 CREATE TRIGGER fail_external_ams_after_import
                 BEFORE INSERT ON ams_units
                 WHEN NEW.id LIKE '%_ext'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced post-import schema failure');
                 END;",
            )
            .map_err(|error| error.to_string())?;

        let mut backup = empty_current_full_backup();
        backup
            .get_mut("tables")
            .and_then(serde_json::Value::as_object_mut)
            .expect("test backup should have a tables object")
            .insert(
                "printers".to_string(),
                json!([{
                    "id": "printer_imported",
                    "model": "P1S",
                    "name": "Imported printer"
                }]),
            );

        let error = db
            .import_full_backup_json(&backup.to_string())
            .expect_err("post-import schema failure should abort the restore");
        assert!(error
            .to_string()
            .contains("forced post-import schema failure"));

        let existing_master_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM filament_master_list WHERE id = 'master_existing'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let imported_printer_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM printers WHERE id = 'printer_imported'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let imported_external_ams_count: i64 = db
            .conn
            .query_row(
                "SELECT COUNT(*) FROM ams_units WHERE id = 'printer_imported_ext'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let foreign_keys_enabled: i64 = db
            .conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        let deferred_foreign_keys: i64 = db
            .conn
            .query_row("PRAGMA defer_foreign_keys", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;

        assert_eq!(existing_master_count, 1);
        assert_eq!(imported_printer_count, 0);
        assert_eq!(imported_external_ams_count, 0);
        assert_eq!(foreign_keys_enabled, 1);
        assert_eq!(deferred_foreign_keys, 0);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("import_full_backup_rolls_back_when_post_import_schema_fails failed: {message}");
    }
}

#[test]
fn trusted_lan_pairing_token_is_not_consumed_when_browser_creation_fails() {
    let db_path = temp_db_path("trusted-lan-atomic-pairing");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.create_trusted_lan_paired_browser(Some("Existing"), "duplicate-device", None)
            .map_err(|error| error.to_string())?;
        db.create_trusted_lan_pairing(Some("Tablet"), "one-time-pairing", 600)
            .map_err(|error| error.to_string())?;

        db.consume_trusted_lan_pairing_and_create_browser(
            "one-time-pairing",
            "duplicate-device",
            Some("http://host.local:4278"),
        )
        .expect_err("duplicate device must roll back the entire pairing transaction");

        let paired = db
            .consume_trusted_lan_pairing_and_create_browser(
                "one-time-pairing",
                "fresh-device",
                Some("http://host.local:4278"),
            )
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "pairing token was consumed by the failed transaction".to_string())?;
        assert_eq!(paired.display_name.as_deref(), Some("Tablet"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("trusted_lan_pairing_token_is_not_consumed_when_browser_creation_fails: {message}");
    }
}
