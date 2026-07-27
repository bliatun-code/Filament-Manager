use super::{
    BambuLiveIntegrationRow, BambuLiveObservedStateRow, FilamentDatabase,
    LibrarySyncCachedSnapshotRow, LibrarySyncSettingsRow, ManualMasterInput, SpoolRow,
    TrustedLanSettingsRow, FULL_BACKUP_TABLES, RESET_APP_STATE_TABLES,
};
use crate::backend::database_schema::{
    ensure_no_foreign_key_violations, table_has_column, CURRENT_SCHEMA_VERSION,
};
use crate::backend::statistics::InventoryOverview;
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
                printer_serial: Some("TEST-SERIAL".to_string()),
                last_error: None,
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
            printer_serial: Some("TEST-SERIAL".to_string()),
            last_error: None,
            observed_state: None,
        };
        let before = db
            .library_domain_revisions()
            .map_err(|error| error.to_string())?
            .printers;

        db.save_bambu_live_integration("printer_1", &config)
            .map_err(|error| error.to_string())?;
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
            access_code: Some("test-access-code".to_string()),
            printer_serial: Some("TEST-SERIAL".to_string()),
            last_error: None,
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
                host_device_name: Some("Main Host".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: None,
                last_reachable_at: None,
                last_validation_message: None,
                cached_snapshot: None,
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
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

        let host_saved = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "HOST".to_string(),
                device_name: "Always-on PC".to_string(),
                library_id: saved.library_id.clone(),
                host_base_url: Some("http://should-clear".to_string()),
                host_device_name: Some("Should clear".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: Some("should clear".to_string()),
                last_reachable_at: Some("should clear".to_string()),
                last_validation_message: Some("should clear".to_string()),
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
                        total_consumption_30d: 1200,
                        owned_consumption_30d: 900,
                        borrowed_in_consumption_30d: 300,
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
        assert!(host_saved.cached_wishlist.is_none());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("library_sync_settings_default_and_persist_cleanly failed: {message}");
    }
}

#[test]
fn library_sync_client_auth_clears_when_client_host_changes() {
    let db_path = temp_db_path("library-sync-auth-host-change");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let defaults = db
            .get_library_sync_settings()
            .map_err(|error| error.to_string())?;

        db.save_library_sync_settings(&LibrarySyncSettingsRow {
            mode: "CLIENT".to_string(),
            device_name: "Workshop Windows".to_string(),
            library_id: defaults.library_id.clone(),
            host_base_url: Some("http://192.168.1.25:4278".to_string()),
            host_device_name: Some("Main Host".to_string()),
            client_auth_paired: false,
            client_auth_paired_at: None,
            client_auth_expires_at: None,
            last_checked_at: None,
            last_reachable_at: None,
            last_validation_message: None,
            cached_snapshot: None,
            cached_spools: None,
            cached_printers: None,
            cached_loans: None,
            cached_wishlist: None,
        })
        .map_err(|error| error.to_string())?;

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

        let changed = db
            .save_library_sync_settings(&LibrarySyncSettingsRow {
                mode: "CLIENT".to_string(),
                device_name: "Workshop Windows".to_string(),
                library_id: defaults.library_id,
                host_base_url: Some("http://192.168.1.99:4278".to_string()),
                host_device_name: Some("Backup Host".to_string()),
                client_auth_paired: false,
                client_auth_paired_at: None,
                client_auth_expires_at: None,
                last_checked_at: None,
                last_reachable_at: None,
                last_validation_message: None,
                cached_snapshot: None,
                cached_spools: None,
                cached_printers: None,
                cached_loans: None,
                cached_wishlist: None,
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(
            changed.host_base_url.as_deref(),
            Some("http://192.168.1.99:4278")
        );
        assert!(!changed.client_auth_paired);
        assert!(changed.client_auth_paired_at.is_none());
        assert!(changed.client_auth_expires_at.is_none());
        assert!(db
            .get_library_sync_client_auth_state()
            .map_err(|error| error.to_string())?
            .is_none());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("library_sync_client_auth_clears_when_client_host_changes failed: {message}");
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
        for secret in [
            "legacy-token",
            "session-secret",
            "device-secret",
            "csrf-secret",
            "bambu-secret",
            "SERIAL-SECRET",
            "pairing-secret-hash",
            "browser-secret-hash",
            "queued-secret",
            "192.168.1.42",
            "192.168.1.50",
        ] {
            assert!(
                !exported.contains(secret),
                "portable backup leaked device-local value: {secret}"
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
            HashSet::from(["theme_mode", "library_sync_library_id"])
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
