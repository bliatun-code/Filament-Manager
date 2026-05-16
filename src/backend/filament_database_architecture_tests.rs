const FACADE_SOURCE: &str = include_str!("filament_database.rs");
const DATABASE_BACKUP_FACADE_SOURCE: &str = include_str!("database_backup_facade.rs");
const DATABASE_BAMBU_LIVE_FACADE_SOURCE: &str = include_str!("database_bambu_live_facade.rs");
const DATABASE_CATALOG_FACADE_SOURCE: &str = include_str!("database_catalog_facade.rs");
const DATABASE_EVENTS_FACADE_SOURCE: &str = include_str!("database_events_facade.rs");
const DATABASE_LIBRARY_SYNC_FACADE_SOURCE: &str = include_str!("database_library_sync_facade.rs");
const DATABASE_LOAN_FACADE_SOURCE: &str = include_str!("database_loan_facade.rs");
const DATABASE_PRINTER_FACADE_SOURCE: &str = include_str!("database_printer_facade.rs");
const DATABASE_RESET_FACADE_SOURCE: &str = include_str!("database_reset_facade.rs");
const DATABASE_SETTINGS_FACADE_SOURCE: &str = include_str!("database_settings_facade.rs");
const DATABASE_SPOOL_FACADE_SOURCE: &str = include_str!("database_spool_facade.rs");
const DATABASE_SPOOL_UPDATE_FACADE_SOURCE: &str = include_str!("database_spool_update_facade.rs");
const DATABASE_SYSTEM_FACADE_SOURCE: &str = include_str!("database_system_facade.rs");
const DATABASE_TRUSTED_LAN_FACADE_SOURCE: &str = include_str!("database_trusted_lan_facade.rs");
const DATABASE_WISHLIST_FACADE_SOURCE: &str = include_str!("database_wishlist_facade.rs");

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
        ("database_settings_facade.rs", DATABASE_SETTINGS_FACADE_SOURCE),
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
        ("database_wishlist_facade.rs", DATABASE_WISHLIST_FACADE_SOURCE),
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
