const FACADE_SOURCE: &str = include_str!("filament_database.rs");
const DATABASE_BACKUP_FACADE_SOURCE: &str = include_str!("database_backup_facade.rs");
const DATABASE_BAMBU_LIVE_FACADE_SOURCE: &str = include_str!("database_bambu_live_facade.rs");
const DATABASE_CATALOG_FACADE_SOURCE: &str = include_str!("database_catalog_facade.rs");
const DATABASE_EVENTS_FACADE_SOURCE: &str = include_str!("database_events_facade.rs");
const DATABASE_LIBRARY_SYNC_FACADE_SOURCE: &str = include_str!("database_library_sync_facade.rs");
const DATABASE_LOAN_FACADE_SOURCE: &str = include_str!("database_loan_facade.rs");
const DATABASE_PRINTER_FACADE_SOURCE: &str = include_str!("database_printer_facade.rs");
const DATABASE_RESET_FACADE_SOURCE: &str = include_str!("database_reset_facade.rs");
const DATABASE_REVISION_FACADE_SOURCE: &str = include_str!("database_revision_facade.rs");
const DATABASE_SETTINGS_FACADE_SOURCE: &str = include_str!("database_settings_facade.rs");
const DATABASE_SPOOL_FACADE_SOURCE: &str = include_str!("database_spool_facade.rs");
const DATABASE_SPOOL_UPDATE_FACADE_SOURCE: &str = include_str!("database_spool_update_facade.rs");
const DATABASE_SYSTEM_FACADE_SOURCE: &str = include_str!("database_system_facade.rs");
const DATABASE_TRUSTED_LAN_FACADE_SOURCE: &str = include_str!("database_trusted_lan_facade.rs");
const DATABASE_WISHLIST_FACADE_SOURCE: &str = include_str!("database_wishlist_facade.rs");
const DATABASE_BACKUP_SOURCE: &str = include_str!("database_backup.rs");
const DATABASE_BACKUP_IMPORT_SOURCE: &str = include_str!("database_backup_import.rs");
const DATABASE_BAMBU_LIVE_SETTINGS_SOURCE: &str = include_str!("database_bambu_live_settings.rs");
const DATABASE_BORROWED_SCHEMA_SOURCE: &str = include_str!("database_borrowed_schema.rs");
const DATABASE_CATALOG_ESUN_SOURCE: &str = include_str!("database_catalog_esun.rs");
const DATABASE_CATALOG_LIFECYCLE_SOURCE: &str = include_str!("database_catalog_lifecycle.rs");
const DATABASE_CATALOG_MANUAL_SOURCE: &str = include_str!("database_catalog_manual.rs");
const DATABASE_CATALOG_QUERIES_SOURCE: &str = include_str!("database_catalog_queries.rs");
const DATABASE_CATALOG_SCHEMA_SOURCE: &str = include_str!("database_catalog_schema.rs");
const DATABASE_CATALOG_UPDATE_SOURCE: &str = include_str!("database_catalog_update.rs");
const DATABASE_CONNECTION_SOURCE: &str = include_str!("database_connection.rs");
const DATABASE_EVENTS_SOURCE: &str = include_str!("database_events.rs");
const DATABASE_EXPORT_SOURCE: &str = include_str!("database_export.rs");
const DATABASE_IMPORT_SOURCE: &str = include_str!("database_import.rs");
const DATABASE_INVENTORY_IMPORT_APPLY_SOURCE: &str =
    include_str!("database_inventory_import_apply.rs");
const DATABASE_LIBRARY_SYNC_AUTH_SOURCE: &str = include_str!("database_library_sync_auth.rs");
const DATABASE_LIBRARY_SYNC_CACHE_SOURCE: &str = include_str!("database_library_sync_cache.rs");
const DATABASE_LIBRARY_SYNC_SETTINGS_SOURCE: &str =
    include_str!("database_library_sync_settings.rs");
const DATABASE_LIBRARY_SYNC_VALIDATION_SOURCE: &str =
    include_str!("database_library_sync_validation.rs");
const DATABASE_LOAN_CREATE_SOURCE: &str = include_str!("database_loan_create.rs");
const DATABASE_LOAN_QUERIES_SOURCE: &str = include_str!("database_loan_queries.rs");
const DATABASE_LOAN_RETURN_SOURCE: &str = include_str!("database_loan_return.rs");
const DATABASE_LOAN_UPDATE_SOURCE: &str = include_str!("database_loan_update.rs");
const DATABASE_LOCATIONS_SOURCE: &str = include_str!("database_locations.rs");
const DATABASE_PRINT_JOBS_SOURCE: &str = include_str!("database_print_jobs.rs");
const DATABASE_PRINTER_LIVE_EVENTS_SOURCE: &str = include_str!("database_printer_live_events.rs");
const DATABASE_PRINTER_MUTATIONS_SOURCE: &str = include_str!("database_printer_mutations.rs");
const DATABASE_PRINTER_QUERIES_SOURCE: &str = include_str!("database_printer_queries.rs");
const DATABASE_PRINTER_SCHEMA_SOURCE: &str = include_str!("database_printer_schema.rs");
const DATABASE_PRINTER_SLOT_ASSIGNMENT_SOURCE: &str =
    include_str!("database_printer_slot_assignment.rs");
const DATABASE_PRINTER_USAGE_SESSIONS_SOURCE: &str =
    include_str!("database_printer_usage_sessions.rs");
const DATABASE_RESET_SOURCE: &str = include_str!("database_reset.rs");
const DATABASE_REVISION_SOURCE: &str = include_str!("database_revision.rs");
const DATABASE_ROWS_SOURCE: &str = include_str!("database_rows.rs");
const DATABASE_SCHEMA_SOURCE: &str = include_str!("database_schema.rs");
const DATABASE_SCHEMA_SETUP_SOURCE: &str = include_str!("database_schema_setup.rs");
const DATABASE_SETTINGS_SOURCE: &str = include_str!("database_settings.rs");
const DATABASE_SPOOL_ASSIGNMENT_SOURCE: &str = include_str!("database_spool_assignment.rs");
const DATABASE_SPOOL_DELETE_SOURCE: &str = include_str!("database_spool_delete.rs");
const DATABASE_SPOOL_INSERT_SOURCE: &str = include_str!("database_spool_insert.rs");
const DATABASE_SPOOL_QUERIES_SOURCE: &str = include_str!("database_spool_queries.rs");
const DATABASE_SPOOL_SCHEMA_SOURCE: &str = include_str!("database_spool_schema.rs");
const DATABASE_SPOOL_UPDATES_SOURCE: &str = include_str!("database_spool_updates.rs");
const DATABASE_TABLE_OPS_SOURCE: &str = include_str!("database_table_ops.rs");
const DATABASE_TIME_SOURCE: &str = include_str!("database_time.rs");
const DATABASE_TRUSTED_LAN_SOURCE: &str = include_str!("database_trusted_lan.rs");
const DATABASE_TRUSTED_LAN_SCHEMA_SOURCE: &str = include_str!("database_trusted_lan_schema.rs");
const DATABASE_TRUSTED_LAN_SETTINGS_SOURCE: &str = include_str!("database_trusted_lan_settings.rs");
const DATABASE_WISHLIST_SOURCE: &str = include_str!("database_wishlist.rs");

#[test]
fn filament_database_stays_a_thin_compatibility_facade() {
    let line_count = FACADE_SOURCE.lines().count();
    assert!(
        line_count <= 100,
        "filament_database.rs should stay a thin compatibility facade, found {line_count} lines"
    );

    assert!(
        FACADE_SOURCE.contains("pub use super::database_core::FilamentDatabase;"),
        "filament_database.rs should re-export the database core type"
    );
    assert!(
        !FACADE_SOURCE.contains("pub fn "),
        "public database methods should live in focused facade modules"
    );
    assert!(
        !FACADE_SOURCE.contains(" as "),
        "delegating row imports belong in focused facade modules, not filament_database.rs"
    );
}

#[test]
fn focused_facades_extend_database_core_directly() {
    let facade_sources = [
        ("database_backup_facade.rs", DATABASE_BACKUP_FACADE_SOURCE),
        (
            "database_bambu_live_facade.rs",
            DATABASE_BAMBU_LIVE_FACADE_SOURCE,
        ),
        ("database_catalog_facade.rs", DATABASE_CATALOG_FACADE_SOURCE),
        ("database_events_facade.rs", DATABASE_EVENTS_FACADE_SOURCE),
        (
            "database_library_sync_facade.rs",
            DATABASE_LIBRARY_SYNC_FACADE_SOURCE,
        ),
        ("database_loan_facade.rs", DATABASE_LOAN_FACADE_SOURCE),
        ("database_printer_facade.rs", DATABASE_PRINTER_FACADE_SOURCE),
        ("database_reset_facade.rs", DATABASE_RESET_FACADE_SOURCE),
        (
            "database_revision_facade.rs",
            DATABASE_REVISION_FACADE_SOURCE,
        ),
        (
            "database_settings_facade.rs",
            DATABASE_SETTINGS_FACADE_SOURCE,
        ),
        ("database_spool_facade.rs", DATABASE_SPOOL_FACADE_SOURCE),
        (
            "database_spool_update_facade.rs",
            DATABASE_SPOOL_UPDATE_FACADE_SOURCE,
        ),
        ("database_system_facade.rs", DATABASE_SYSTEM_FACADE_SOURCE),
        (
            "database_trusted_lan_facade.rs",
            DATABASE_TRUSTED_LAN_FACADE_SOURCE,
        ),
        (
            "database_wishlist_facade.rs",
            DATABASE_WISHLIST_FACADE_SOURCE,
        ),
    ];

    for (path, source) in facade_sources {
        assert!(
            source.contains("use super::database_core::FilamentDatabase;"),
            "{path} should extend the core database type directly"
        );
        assert!(
            !source.contains("use super::filament_database::FilamentDatabase;"),
            "{path} should not depend on the compatibility facade"
        );
    }
}

#[test]
fn low_level_database_modules_do_not_depend_on_compatibility_facade() {
    let database_sources = [
        ("database_backup.rs", DATABASE_BACKUP_SOURCE),
        ("database_backup_import.rs", DATABASE_BACKUP_IMPORT_SOURCE),
        (
            "database_bambu_live_settings.rs",
            DATABASE_BAMBU_LIVE_SETTINGS_SOURCE,
        ),
        (
            "database_borrowed_schema.rs",
            DATABASE_BORROWED_SCHEMA_SOURCE,
        ),
        ("database_catalog_esun.rs", DATABASE_CATALOG_ESUN_SOURCE),
        (
            "database_catalog_lifecycle.rs",
            DATABASE_CATALOG_LIFECYCLE_SOURCE,
        ),
        ("database_catalog_manual.rs", DATABASE_CATALOG_MANUAL_SOURCE),
        (
            "database_catalog_queries.rs",
            DATABASE_CATALOG_QUERIES_SOURCE,
        ),
        ("database_catalog_schema.rs", DATABASE_CATALOG_SCHEMA_SOURCE),
        ("database_catalog_update.rs", DATABASE_CATALOG_UPDATE_SOURCE),
        ("database_connection.rs", DATABASE_CONNECTION_SOURCE),
        ("database_events.rs", DATABASE_EVENTS_SOURCE),
        ("database_export.rs", DATABASE_EXPORT_SOURCE),
        ("database_import.rs", DATABASE_IMPORT_SOURCE),
        (
            "database_inventory_import_apply.rs",
            DATABASE_INVENTORY_IMPORT_APPLY_SOURCE,
        ),
        (
            "database_library_sync_auth.rs",
            DATABASE_LIBRARY_SYNC_AUTH_SOURCE,
        ),
        (
            "database_library_sync_cache.rs",
            DATABASE_LIBRARY_SYNC_CACHE_SOURCE,
        ),
        (
            "database_library_sync_settings.rs",
            DATABASE_LIBRARY_SYNC_SETTINGS_SOURCE,
        ),
        (
            "database_library_sync_validation.rs",
            DATABASE_LIBRARY_SYNC_VALIDATION_SOURCE,
        ),
        ("database_loan_create.rs", DATABASE_LOAN_CREATE_SOURCE),
        ("database_loan_queries.rs", DATABASE_LOAN_QUERIES_SOURCE),
        ("database_loan_return.rs", DATABASE_LOAN_RETURN_SOURCE),
        ("database_loan_update.rs", DATABASE_LOAN_UPDATE_SOURCE),
        ("database_locations.rs", DATABASE_LOCATIONS_SOURCE),
        ("database_print_jobs.rs", DATABASE_PRINT_JOBS_SOURCE),
        (
            "database_printer_live_events.rs",
            DATABASE_PRINTER_LIVE_EVENTS_SOURCE,
        ),
        (
            "database_printer_mutations.rs",
            DATABASE_PRINTER_MUTATIONS_SOURCE,
        ),
        (
            "database_printer_queries.rs",
            DATABASE_PRINTER_QUERIES_SOURCE,
        ),
        ("database_printer_schema.rs", DATABASE_PRINTER_SCHEMA_SOURCE),
        (
            "database_printer_slot_assignment.rs",
            DATABASE_PRINTER_SLOT_ASSIGNMENT_SOURCE,
        ),
        (
            "database_printer_usage_sessions.rs",
            DATABASE_PRINTER_USAGE_SESSIONS_SOURCE,
        ),
        ("database_reset.rs", DATABASE_RESET_SOURCE),
        ("database_revision.rs", DATABASE_REVISION_SOURCE),
        ("database_rows.rs", DATABASE_ROWS_SOURCE),
        ("database_schema.rs", DATABASE_SCHEMA_SOURCE),
        ("database_schema_setup.rs", DATABASE_SCHEMA_SETUP_SOURCE),
        ("database_settings.rs", DATABASE_SETTINGS_SOURCE),
        (
            "database_spool_assignment.rs",
            DATABASE_SPOOL_ASSIGNMENT_SOURCE,
        ),
        ("database_spool_delete.rs", DATABASE_SPOOL_DELETE_SOURCE),
        ("database_spool_insert.rs", DATABASE_SPOOL_INSERT_SOURCE),
        ("database_spool_queries.rs", DATABASE_SPOOL_QUERIES_SOURCE),
        ("database_spool_schema.rs", DATABASE_SPOOL_SCHEMA_SOURCE),
        ("database_spool_updates.rs", DATABASE_SPOOL_UPDATES_SOURCE),
        ("database_table_ops.rs", DATABASE_TABLE_OPS_SOURCE),
        ("database_time.rs", DATABASE_TIME_SOURCE),
        ("database_trusted_lan.rs", DATABASE_TRUSTED_LAN_SOURCE),
        (
            "database_trusted_lan_schema.rs",
            DATABASE_TRUSTED_LAN_SCHEMA_SOURCE,
        ),
        (
            "database_trusted_lan_settings.rs",
            DATABASE_TRUSTED_LAN_SETTINGS_SOURCE,
        ),
        ("database_wishlist.rs", DATABASE_WISHLIST_SOURCE),
    ];

    for (path, source) in database_sources {
        assert!(
            !source.contains("super::filament_database"),
            "{path} should import concrete result/model modules instead of the compatibility facade"
        );
    }
}
