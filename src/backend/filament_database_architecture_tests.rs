const FACADE_SOURCE: &str = include_str!("filament_database.rs");

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
