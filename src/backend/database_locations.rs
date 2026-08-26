use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use super::database_ids::new_id;
use super::database_location_models::{
    canonicalize_location_type, is_user_managed_location_type, InventoryLocationMergeResult,
    InventoryLocationRow,
};
use super::database_result::{InventoryError, InventoryResult};

pub(crate) fn normalize_location_name(value: &str) -> InventoryResult<(String, String)> {
    let display_name = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if display_name.is_empty() {
        return Err(invalid_location(
            "inventory.location.name_required",
            "Location name is required.",
        ));
    }
    if display_name.chars().count() > 120 {
        return Err(invalid_location(
            "inventory.location.name_too_long",
            "Location name must be 120 characters or fewer.",
        ));
    }
    Ok((display_name.to_uppercase(), display_name))
}

pub(crate) fn list_locations(
    conn: &Connection,
    include_archived: bool,
) -> InventoryResult<Vec<InventoryLocationRow>> {
    let mut statement = conn.prepare(
        "SELECT location.id, location.name, location.type, location.parent_id,
                location.x, location.y, location.z, location.archived_at,
                COALESCE(location.created_at, ''), COALESCE(location.updated_at, ''),
                (SELECT COUNT(*) FROM filament_spools
                 WHERE location_id = location.id AND deleted_at IS NULL)
                  + (SELECT COUNT(*) FROM filament_spools
                     WHERE home_location_id = location.id AND deleted_at IS NULL)
                  + (SELECT COUNT(*) FROM inventory_locations child
                     WHERE child.parent_id = location.id) AS reference_count
         FROM inventory_locations location
         WHERE ?1 != 0 OR archived_at IS NULL
         ORDER BY archived_at IS NOT NULL, name COLLATE NOCASE, id",
    )?;
    let rows = statement.query_map(params![include_archived], map_location_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub(crate) fn get_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<Option<InventoryLocationRow>> {
    conn.query_row(
        "SELECT location.id, location.name, location.type, location.parent_id,
                location.x, location.y, location.z, location.archived_at,
                COALESCE(location.created_at, ''), COALESCE(location.updated_at, ''),
                (SELECT COUNT(*) FROM filament_spools
                 WHERE location_id = location.id AND deleted_at IS NULL)
                  + (SELECT COUNT(*) FROM filament_spools
                     WHERE home_location_id = location.id AND deleted_at IS NULL)
                  + (SELECT COUNT(*) FROM inventory_locations child
                     WHERE child.parent_id = location.id) AS reference_count
         FROM inventory_locations location
         WHERE location.id = ?1
         LIMIT 1",
        params![location_id.trim()],
        map_location_row,
    )
    .optional()
    .map_err(Into::into)
}

pub(crate) fn ensure_location(conn: &Connection, name: &str) -> InventoryResult<String> {
    let (normalized_name, display_name) = normalize_location_name(name)?;
    if let Some(existing_id) = find_active_generic_by_normalized_name(conn, &normalized_name, None)?
    {
        return Ok(existing_id);
    }

    let id = new_generic_location_id(conn)?;
    conn.execute(
        "INSERT INTO inventory_locations (
            id, name, type, created_at, updated_at
         ) VALUES (?1, ?2, 'GENERIC', datetime('now'), datetime('now'))",
        params![id, display_name],
    )?;
    Ok(id)
}

pub(crate) fn create_location(
    conn: &Connection,
    name: &str,
    parent_id: Option<&str>,
) -> InventoryResult<InventoryLocationRow> {
    let (normalized_name, display_name) = normalize_location_name(name)?;
    if find_active_generic_by_normalized_name(conn, &normalized_name, None)?.is_some() {
        return Err(invalid_location(
            "inventory.location.name_conflict",
            "An active location already uses that name.",
        ));
    }
    let parent_id = validate_optional_parent(conn, parent_id)?;
    let id = new_generic_location_id(conn)?;
    conn.execute(
        "INSERT INTO inventory_locations (
            id, name, type, parent_id, created_at, updated_at
         ) VALUES (?1, ?2, 'GENERIC', ?3, datetime('now'), datetime('now'))",
        params![id, display_name, parent_id],
    )?;
    get_location(conn, &id)?.ok_or(InventoryError::NotFound)
}

pub(crate) fn rename_location(
    conn: &Connection,
    location_id: &str,
    name: &str,
) -> InventoryResult<InventoryLocationRow> {
    let existing = require_generic_location(conn, location_id)?;
    let (normalized_name, display_name) = normalize_location_name(name)?;
    if existing.archived_at.is_none()
        && find_active_generic_by_normalized_name(
            conn,
            &normalized_name,
            Some(existing.id.as_str()),
        )?
        .is_some()
    {
        return Err(invalid_location(
            "inventory.location.name_conflict",
            "An active location already uses that name.",
        ));
    }
    conn.execute(
        "UPDATE inventory_locations
         SET name = ?2, updated_at = datetime('now')
         WHERE id = ?1",
        params![existing.id, display_name],
    )?;
    get_location(conn, location_id)?.ok_or(InventoryError::NotFound)
}

pub(crate) fn archive_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<InventoryLocationRow> {
    let existing = require_generic_location(conn, location_id)?;
    if existing.archived_at.is_some() {
        return Err(invalid_location(
            "inventory.location.already_archived",
            "Location is already archived.",
        ));
    }
    conn.execute(
        "UPDATE inventory_locations
         SET archived_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1",
        params![existing.id],
    )?;
    get_location(conn, location_id)?.ok_or(InventoryError::NotFound)
}

pub(crate) fn restore_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<InventoryLocationRow> {
    let existing = require_generic_location(conn, location_id)?;
    if existing.archived_at.is_none() {
        return Err(invalid_location(
            "inventory.location.not_archived",
            "Location is already active.",
        ));
    }
    let (normalized_name, _) = normalize_location_name(&existing.name)?;
    if find_active_generic_by_normalized_name(conn, &normalized_name, Some(&existing.id))?.is_some()
    {
        return Err(invalid_location(
            "inventory.location.name_conflict",
            "Rename the archived location before restoring it because an active location uses that name.",
        ));
    }
    conn.execute(
        "UPDATE inventory_locations
         SET archived_at = NULL, updated_at = datetime('now')
         WHERE id = ?1",
        params![existing.id],
    )?;
    get_location(conn, location_id)?.ok_or(InventoryError::NotFound)
}

pub(crate) fn delete_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<InventoryLocationRow> {
    let existing = require_generic_location(conn, location_id)?;
    let references = location_reference_counts(conn, &existing.id)?;
    if references.total() != 0 {
        return Err(invalid_location(
            "inventory.location.has_references",
            &format!(
                "Location cannot be deleted while it is referenced (current spool locations: {}, home locations: {}, child locations: {}).",
                references.current_spools, references.home_spools, references.child_locations
            ),
        ));
    }

    // Versions before location deletion was introduced kept a removed spool's
    // home-location foreign key. Its DELETED history snapshot already retains
    // the human context, so detach those legacy-only references atomically
    // before deleting an otherwise unreferenced location.
    conn.execute(
        "UPDATE filament_spools
         SET location_id = CASE WHEN location_id = ?1 THEN NULL ELSE location_id END,
             home_location_id = CASE WHEN home_location_id = ?1 THEN NULL ELSE home_location_id END,
             updated_at = datetime('now')
         WHERE deleted_at IS NOT NULL
           AND (location_id = ?1 OR home_location_id = ?1)",
        params![existing.id],
    )?;

    // Keep the guards in the DELETE as a second line of defence. The facade
    // runs this function in an IMMEDIATE transaction, so the read, decision,
    // and permanent deletion are one atomic mutation.
    let affected = conn.execute(
        "DELETE FROM inventory_locations
         WHERE id = ?1
           AND UPPER(TRIM(type)) IN ('GENERIC', 'SHELF')
           AND NOT EXISTS (
             SELECT 1 FROM filament_spools WHERE location_id = ?1
           )
           AND NOT EXISTS (
             SELECT 1 FROM filament_spools WHERE home_location_id = ?1
           )
           AND NOT EXISTS (
             SELECT 1 FROM inventory_locations child WHERE child.parent_id = ?1
           )",
        params![existing.id],
    )?;
    if affected != 1 {
        return Err(invalid_location(
            "inventory.location.has_references",
            "Location acquired a reference before it could be deleted.",
        ));
    }
    Ok(existing)
}

pub(crate) fn merge_locations(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> InventoryResult<InventoryLocationMergeResult> {
    let source = require_active_generic_location(conn, source_id)?;
    let target = require_active_generic_location(conn, target_id)?;
    if source.id == target.id {
        return Err(invalid_location(
            "inventory.location.merge_same_id",
            "Source and target locations must be different.",
        ));
    }
    ensure_target_is_not_descendant(conn, &source.id, &target.id)?;

    let affected = affected_spools(conn, &source.id)?;
    let moved_current_references = affected.iter().filter(|row| row.1).count() as i64;
    let moved_home_references = affected.iter().filter(|row| row.2).count() as i64;
    let moved_parent_references: i64 = conn.query_row(
        "SELECT COUNT(*) FROM inventory_locations WHERE parent_id = ?1",
        params![source.id],
        |row| row.get(0),
    )?;

    conn.execute(
        "UPDATE filament_spools
         SET location_id = CASE WHEN location_id = ?1 THEN ?2 ELSE location_id END,
             home_location_id = CASE WHEN home_location_id = ?1 THEN ?2 ELSE home_location_id END,
             updated_at = datetime('now')
         WHERE location_id = ?1 OR home_location_id = ?1",
        params![source.id, target.id],
    )?;
    conn.execute(
        "UPDATE inventory_locations
         SET parent_id = ?2, updated_at = datetime('now')
         WHERE parent_id = ?1",
        params![source.id, target.id],
    )?;

    for (spool_id, moved_current, moved_home) in &affected {
        let payload = serde_json::to_string(&json!({
            "source_location_id": source.id,
            "source_location_name": source.name,
            "target_location_id": target.id,
            "target_location_name": target.name,
            "moved_current_location": moved_current,
            "moved_home_location": moved_home,
        }))
        .map_err(|error| InventoryError::Db(error.to_string()))?;
        conn.execute(
            "INSERT INTO spool_history_events (
                id, spool_id, event_type, payload_json, created_at
             ) VALUES (?1, ?2, 'LOCATION_MERGED', ?3, datetime('now'))",
            params![new_id(), spool_id, payload],
        )?;
    }

    // Deliberately last: a constraint or trigger failure here must roll back
    // every moved FK and history row in the facade's IMMEDIATE transaction.
    conn.execute(
        "UPDATE inventory_locations
         SET archived_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1 AND archived_at IS NULL",
        params![source.id],
    )?;

    Ok(InventoryLocationMergeResult {
        source_id: source.id,
        target_id: target.id,
        affected_spools: affected.len() as i64,
        moved_current_references,
        moved_home_references,
        moved_parent_references,
    })
}

pub(crate) fn resolve_active_generic_location_reference(
    conn: &Connection,
    value: &str,
) -> InventoryResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(invalid_location(
            "inventory.location.name_required",
            "Location name is required.",
        ));
    }
    if let Some(row) = get_location(conn, trimmed)? {
        if row.is_system_owned() {
            return Err(system_owned_location_error());
        }
        if row.is_archived() {
            return Err(invalid_location(
                "inventory.location.archived",
                "Archived locations cannot be assigned. Restore the location first.",
            ));
        }
        return Ok(row.id);
    }
    ensure_location(conn, trimmed)
}

pub(crate) fn location_reference_matches(
    conn: &Connection,
    existing_id: &str,
    requested: &str,
) -> InventoryResult<bool> {
    let Some(existing) = get_location(conn, existing_id)? else {
        return Ok(existing_id.trim() == requested.trim());
    };
    let requested = requested.trim();
    if requested == existing.id {
        return Ok(true);
    }
    let (requested_key, _) = normalize_location_name(requested)?;
    let (existing_key, _) = normalize_location_name(&existing.name)?;
    Ok(requested_key == existing_key)
}

fn map_location_row(row: &rusqlite::Row<'_>) -> Result<InventoryLocationRow, rusqlite::Error> {
    let location_type: String = row.get(2)?;
    let reference_count: i64 = row.get(10)?;
    Ok(InventoryLocationRow {
        id: row.get(0)?,
        name: row.get(1)?,
        location_type: canonicalize_location_type(&location_type),
        parent_id: row.get(3)?,
        x: row.get(4)?,
        y: row.get(5)?,
        z: row.get(6)?,
        archived_at: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        reference_count: Some(reference_count),
        can_delete: is_user_managed_location_type(&location_type) && reference_count == 0,
    })
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct LocationReferenceCounts {
    current_spools: i64,
    home_spools: i64,
    child_locations: i64,
}

impl LocationReferenceCounts {
    fn total(self) -> i64 {
        self.current_spools + self.home_spools + self.child_locations
    }
}

fn location_reference_counts(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<LocationReferenceCounts> {
    conn.query_row(
        "SELECT
           (SELECT COUNT(*) FROM filament_spools WHERE location_id = ?1 AND deleted_at IS NULL),
           (SELECT COUNT(*) FROM filament_spools WHERE home_location_id = ?1 AND deleted_at IS NULL),
           (SELECT COUNT(*) FROM inventory_locations WHERE parent_id = ?1)",
        params![location_id],
        |row| {
            Ok(LocationReferenceCounts {
                current_spools: row.get(0)?,
                home_spools: row.get(1)?,
                child_locations: row.get(2)?,
            })
        },
    )
    .map_err(Into::into)
}

fn find_active_generic_by_normalized_name(
    conn: &Connection,
    normalized_name: &str,
    excluding_id: Option<&str>,
) -> InventoryResult<Option<String>> {
    let mut statement = conn.prepare(
        "SELECT id, name
         FROM inventory_locations
         WHERE UPPER(TRIM(type)) IN ('GENERIC', 'SHELF') AND archived_at IS NULL
         ORDER BY id",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (id, name) = row?;
        if excluding_id.is_some_and(|excluded| excluded == id) {
            continue;
        }
        if normalize_location_name(&name)?.0 == normalized_name {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

fn validate_optional_parent(
    conn: &Connection,
    parent_id: Option<&str>,
) -> InventoryResult<Option<String>> {
    let Some(parent_id) = parent_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    Ok(Some(require_active_generic_location(conn, parent_id)?.id))
}

fn require_generic_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<InventoryLocationRow> {
    let row = get_location(conn, location_id)?.ok_or(InventoryError::NotFound)?;
    if row.is_system_owned() {
        return Err(system_owned_location_error());
    }
    Ok(row)
}

fn require_active_generic_location(
    conn: &Connection,
    location_id: &str,
) -> InventoryResult<InventoryLocationRow> {
    let row = require_generic_location(conn, location_id)?;
    if row.is_archived() {
        return Err(invalid_location(
            "inventory.location.archived",
            "Archived locations cannot be used until they are restored.",
        ));
    }
    Ok(row)
}

fn ensure_target_is_not_descendant(
    conn: &Connection,
    source_id: &str,
    target_id: &str,
) -> InventoryResult<()> {
    let mut cursor = Some(target_id.to_string());
    let mut visited = HashSet::new();
    while let Some(location_id) = cursor {
        if !visited.insert(location_id.clone()) {
            return Err(invalid_location(
                "inventory.location.parent_cycle",
                "Location hierarchy contains a cycle.",
            ));
        }
        if location_id == source_id {
            return Err(invalid_location(
                "inventory.location.merge_descendant",
                "A location cannot be merged into one of its descendants.",
            ));
        }
        cursor = get_location(conn, &location_id)?.and_then(|row| row.parent_id);
    }
    Ok(())
}

fn affected_spools(
    conn: &Connection,
    source_id: &str,
) -> InventoryResult<Vec<(String, bool, bool)>> {
    let mut statement = conn.prepare(
        "SELECT id, location_id = ?1, home_location_id = ?1
         FROM filament_spools
         WHERE location_id = ?1 OR home_location_id = ?1
         ORDER BY id",
    )?;
    let rows = statement.query_map(params![source_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn new_generic_location_id(conn: &Connection) -> InventoryResult<String> {
    for _ in 0..8 {
        let id = format!("location_{:032x}", rand::random::<u128>());
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM inventory_locations WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Ok(id);
        }
    }
    Err(InventoryError::Db(
        "Could not allocate a unique location id.".to_string(),
    ))
}

fn system_owned_location_error() -> InventoryError {
    invalid_location(
        "inventory.location.system_owned",
        "Printer-slot and other system locations cannot be changed with generic location tools.",
    )
}

fn invalid_location(code: &'static str, message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code,
        message: message.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use rusqlite::params;

    use super::super::database_core::FilamentDatabase;
    use super::super::database_result::InventoryError;
    use super::super::database_revision::LibraryDomainRevisions;

    fn temp_db_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "filament-manager-location-{name}-{}-{}.db",
            std::process::id(),
            rand::random::<u64>()
        ))
    }

    fn open_db(name: &str) -> (PathBuf, FilamentDatabase) {
        let path = temp_db_path(name);
        let db = FilamentDatabase::open(&path).expect("open test database");
        db.apply_schema().expect("apply schema");
        (path, db)
    }

    fn seed_master_and_spool(
        db: &FilamentDatabase,
        spool_id: &str,
        location_id: &str,
        home_location_id: &str,
    ) {
        db.connection()
            .execute(
                "INSERT OR IGNORE INTO filament_master_list (
                    id, material, filament_name, color_name, default_weight, vendor
                 ) VALUES ('location-master', 'PLA', 'Basic', 'Blue', 1000, 'Manual')",
                [],
            )
            .expect("seed master");
        db.connection()
            .execute(
                "INSERT INTO filament_spools (
                    id, master_id, status, location_id, home_location_id
                 ) VALUES (?1, 'location-master', 'IN_STOCK', ?2, ?3)",
                params![spool_id, location_id, home_location_id],
            )
            .expect("seed spool");
    }

    fn assert_location_has_references(error: InventoryError) {
        match error {
            InventoryError::InvalidOperation { code, .. } => {
                assert_eq!(code, "inventory.location.has_references")
            }
            other => panic!("expected location reference rejection, got {other:?}"),
        }
    }

    #[test]
    fn ensure_reuses_normalized_legacy_name_and_new_ids_do_not_depend_on_names() {
        let (path, db) = open_db("ensure");
        db.connection()
            .execute(
                "INSERT INTO inventory_locations (
                    id, name, type, created_at, updated_at
                 ) VALUES ('legacy-shelf-id', 'Dry   Box', 'GENERIC', datetime('now'), datetime('now'))",
                [],
            )
            .expect("seed legacy location");

        let legacy = db.ensure_location("  dry\tbox ").expect("reuse legacy row");
        assert_eq!(legacy, "legacy-shelf-id");

        let created = db.ensure_location("Shelf Alpha").expect("create location");
        assert!(created.starts_with("location_"));
        assert_ne!(created, "Shelf Alpha");
        assert_eq!(
            db.ensure_location(" shelf   ALPHA ")
                .expect("reuse normalized location"),
            created
        );
        let rows = db
            .list_inventory_locations(false)
            .expect("list active locations");
        assert_eq!(
            rows.iter()
                .find(|row| row.id == created)
                .map(|row| row.name.as_str()),
            Some("Shelf Alpha")
        );

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn concurrent_ensure_reuses_one_normalized_location_and_explicit_create_rejects_duplicate() {
        let (path, db) = open_db("concurrent-ensure");
        drop(db);
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(2));
        let ids = std::thread::scope(|scope| {
            let first_path = path.clone();
            let first_barrier = barrier.clone();
            let first = scope.spawn(move || {
                let db = FilamentDatabase::open(first_path).expect("open first writer");
                first_barrier.wait();
                db.ensure_location(" Dry   Box ").expect("first ensure")
            });
            let second_path = path.clone();
            let second_barrier = barrier.clone();
            let second = scope.spawn(move || {
                let db = FilamentDatabase::open(second_path).expect("open second writer");
                second_barrier.wait();
                db.ensure_location("dry\tbox").expect("second ensure")
            });
            [
                first.join().expect("join first"),
                second.join().expect("join second"),
            ]
        });
        assert_eq!(ids[0], ids[1]);

        let db = FilamentDatabase::open(&path).expect("reopen database");
        let matching = db
            .list_inventory_locations(false)
            .expect("list locations")
            .into_iter()
            .filter(|row| {
                super::normalize_location_name(&row.name)
                    .is_ok_and(|normalized| normalized.0 == "DRY BOX")
            })
            .count();
        assert_eq!(matching, 1);
        let error = db
            .create_inventory_location("  DRY box ", None)
            .expect_err("explicit duplicate should be rejected");
        assert!(error.to_string().contains("already uses that name"));

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn rename_archive_restore_keep_id_and_advance_inventory_revision() {
        let (path, db) = open_db("lifecycle");
        let before: LibraryDomainRevisions = db
            .library_domain_revisions()
            .expect("read initial revisions");
        let created = db
            .create_inventory_location("Shelf One", None)
            .expect("create location");
        let renamed = db
            .rename_inventory_location(&created.id, "  Shelf   Renamed ")
            .expect("rename location");
        assert_eq!(renamed.id, created.id);
        assert_eq!(renamed.name, "Shelf Renamed");

        let archived = db
            .archive_inventory_location(&created.id)
            .expect("archive location");
        assert!(archived.archived_at.is_some());
        assert!(db
            .list_inventory_locations(false)
            .expect("list active")
            .iter()
            .all(|row| row.id != created.id));
        assert!(db
            .list_inventory_locations(true)
            .expect("list archived")
            .iter()
            .any(|row| row.id == created.id));

        let restored = db
            .restore_inventory_location(&created.id)
            .expect("restore location");
        assert_eq!(restored.id, created.id);
        assert!(restored.archived_at.is_none());
        let after = db
            .library_domain_revisions()
            .expect("read updated revisions");
        assert!(after.inventory >= before.inventory + 4);

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn archived_location_keeps_spool_links_and_a_same_named_replacement_is_distinct() {
        let (path, db) = open_db("archive-reference-identity");
        let original = db
            .create_inventory_location("Shelf One", None)
            .expect("create original location");
        seed_master_and_spool(&db, "linked-spool", &original.id, &original.id);

        db.archive_inventory_location(&original.id)
            .expect("archive original location");
        let replacement = db
            .create_inventory_location("Shelf One", None)
            .expect("create same-named replacement");
        assert_ne!(replacement.id, original.id);

        let restore_error = db
            .restore_inventory_location(&original.id)
            .expect_err("same-named active replacement must block restore");
        assert!(restore_error
            .to_string()
            .contains("active location uses that name"));

        let references_before_restore: (String, String) = db
            .connection()
            .query_row(
                "SELECT location_id, home_location_id
                 FROM filament_spools WHERE id = 'linked-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read archived references");
        assert_eq!(
            references_before_restore,
            (original.id.clone(), original.id.clone())
        );

        db.rename_inventory_location(&replacement.id, "Replacement Shelf")
            .expect("free original name");
        let restored = db
            .restore_inventory_location(&original.id)
            .expect("restore original location");
        assert_eq!(restored.id, original.id);

        let references_after_restore: (String, String) = db
            .connection()
            .query_row(
                "SELECT location_id, home_location_id
                 FROM filament_spools WHERE id = 'linked-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read restored references");
        assert_eq!(references_after_restore, references_before_restore);

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_removes_unreferenced_active_or_archived_generic_locations() {
        let (path, db) = open_db("delete-unreferenced");
        let before = db
            .library_domain_revisions()
            .expect("read revisions before deletes");
        let active = db
            .create_inventory_location("Temporary Shelf", None)
            .expect("create active location");
        assert_eq!(active.reference_count, Some(0));
        assert!(active.can_delete);

        let deleted_active = db
            .delete_inventory_location(&active.id)
            .expect("delete unreferenced active location");
        assert_eq!(deleted_active.id, active.id);
        assert!(db
            .list_inventory_locations(true)
            .expect("list after active delete")
            .into_iter()
            .all(|row| row.id != active.id));

        let archived = db
            .create_inventory_location("Temporary Archived Shelf", None)
            .expect("create location to archive");
        db.archive_inventory_location(&archived.id)
            .expect("archive unreferenced location");
        let archived_row = db
            .list_inventory_locations(true)
            .expect("list archived location")
            .into_iter()
            .find(|row| row.id == archived.id)
            .expect("find archived location");
        assert_eq!(archived_row.reference_count, Some(0));
        assert!(archived_row.can_delete);
        db.delete_inventory_location(&archived.id)
            .expect("delete unreferenced archived location");

        let after = db
            .library_domain_revisions()
            .expect("read revisions after deletes");
        assert!(after.inventory >= before.inventory + 5);

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_rejects_location_used_as_a_spool_current_location() {
        let (path, db) = open_db("delete-current-reference");
        let location = db
            .create_inventory_location("Current Shelf", None)
            .expect("create referenced location");
        let other = db
            .create_inventory_location("Home Shelf", None)
            .expect("create other location");
        seed_master_and_spool(&db, "current-reference-spool", &location.id, &other.id);

        let row = db
            .list_inventory_locations(false)
            .expect("list referenced location")
            .into_iter()
            .find(|row| row.id == location.id)
            .expect("find referenced location");
        assert_eq!(row.reference_count, Some(1));
        assert!(!row.can_delete);
        assert_location_has_references(
            db.delete_inventory_location(&location.id)
                .expect_err("current location reference must block delete"),
        );
        assert!(db
            .list_inventory_locations(false)
            .expect("list after rejected delete")
            .into_iter()
            .any(|row| row.id == location.id));

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_cleans_legacy_soft_deleted_spool_home_reference() {
        let (path, db) = open_db("delete-home-reference");
        let location = db
            .create_inventory_location("Home Shelf", None)
            .expect("create referenced location");
        let other = db
            .create_inventory_location("Current Shelf", None)
            .expect("create other location");
        seed_master_and_spool(&db, "home-reference-spool", &other.id, &location.id);
        db.connection()
            .execute(
                "UPDATE filament_spools
                 SET deleted_at = datetime('now'), status = 'DELETED', location_id = NULL
                 WHERE id = 'home-reference-spool'",
                [],
            )
            .expect("simulate legacy soft delete that preserved its home reference");

        let row = db
            .list_inventory_locations(false)
            .expect("list referenced location")
            .into_iter()
            .find(|row| row.id == location.id)
            .expect("find referenced location");
        assert_eq!(row.reference_count, Some(0));
        assert!(row.can_delete);
        db.delete_inventory_location(&location.id)
            .expect("legacy removed-spool reference should be detached during deletion");
        let stored_home: Option<String> = db
            .connection()
            .query_row(
                "SELECT home_location_id FROM filament_spools WHERE id = 'home-reference-spool'",
                [],
                |row| row.get(0),
            )
            .expect("read cleaned legacy home reference");
        assert_eq!(stored_home, None);
        assert!(db
            .list_inventory_locations(true)
            .expect("list after deleting legacy-referenced location")
            .into_iter()
            .all(|row| row.id != location.id));

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn delete_rejects_location_used_as_a_parent_location() {
        let (path, db) = open_db("delete-parent-reference");
        let location = db
            .create_inventory_location("Parent Shelf", None)
            .expect("create parent location");
        db.create_inventory_location("Child Shelf", Some(&location.id))
            .expect("create child location");

        let row = db
            .list_inventory_locations(false)
            .expect("list referenced location")
            .into_iter()
            .find(|row| row.id == location.id)
            .expect("find referenced location");
        assert_eq!(row.reference_count, Some(1));
        assert!(!row.can_delete);
        assert_location_has_references(
            db.delete_inventory_location(&location.id)
                .expect_err("child location reference must block delete"),
        );

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn merge_moves_all_references_writes_history_and_archives_source() {
        let (path, db) = open_db("merge");
        let source = db
            .create_inventory_location("Source Shelf", None)
            .expect("create source");
        let target = db
            .create_inventory_location("Target Shelf", None)
            .expect("create target");
        let child = db
            .create_inventory_location("Child Shelf", Some(&source.id))
            .expect("create child");
        seed_master_and_spool(&db, "spool-a", &source.id, &target.id);
        seed_master_and_spool(&db, "spool-b", &source.id, &source.id);

        let renamed = db
            .rename_inventory_location(&source.id, "Source Renamed")
            .expect("rename source");
        assert_eq!(renamed.id, source.id);
        let before_reference: String = db
            .connection()
            .query_row(
                "SELECT location_id FROM filament_spools WHERE id = 'spool-a'",
                [],
                |row| row.get(0),
            )
            .expect("read location after rename");
        assert_eq!(before_reference, source.id);

        let merged = db
            .merge_inventory_locations(&source.id, &target.id)
            .expect("merge locations");
        assert_eq!(merged.affected_spools, 2);
        assert_eq!(merged.moved_current_references, 2);
        assert_eq!(merged.moved_home_references, 1);
        assert_eq!(merged.moved_parent_references, 1);

        for spool_id in ["spool-a", "spool-b"] {
            let references: (String, String) = db
                .connection()
                .query_row(
                    "SELECT location_id, home_location_id
                     FROM filament_spools WHERE id = ?1",
                    params![spool_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .expect("read merged spool references");
            assert_eq!(references, (target.id.clone(), target.id.clone()));
            let history_count: i64 = db
                .connection()
                .query_row(
                    "SELECT COUNT(*) FROM spool_history_events
                     WHERE spool_id = ?1 AND event_type = 'LOCATION_MERGED'",
                    params![spool_id],
                    |row| row.get(0),
                )
                .expect("read merge history");
            assert_eq!(history_count, 1);
        }
        assert_eq!(
            db.list_inventory_locations(true)
                .expect("list locations")
                .into_iter()
                .find(|row| row.id == child.id)
                .and_then(|row| row.parent_id),
            Some(target.id.clone())
        );
        assert!(db
            .list_inventory_locations(true)
            .expect("list archived source")
            .into_iter()
            .find(|row| row.id == source.id)
            .and_then(|row| row.archived_at)
            .is_some());

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn merge_rolls_back_references_history_and_parent_when_late_archive_fails() {
        let (path, db) = open_db("merge-rollback");
        let source = db
            .create_inventory_location("Rollback Source", None)
            .expect("create source");
        let target = db
            .create_inventory_location("Rollback Target", None)
            .expect("create target");
        let child = db
            .create_inventory_location("Rollback Child", Some(&source.id))
            .expect("create child");
        seed_master_and_spool(&db, "rollback-spool", &source.id, &source.id);
        db.connection()
            .execute_batch(&format!(
                "CREATE TRIGGER fail_location_merge_archive
                 BEFORE UPDATE OF archived_at ON inventory_locations
                 WHEN OLD.id = '{}'
                 BEGIN
                   SELECT RAISE(ABORT, 'forced late archive failure');
                 END;",
                source.id.replace("'", "''")
            ))
            .expect("create failure trigger");

        let error = db
            .merge_inventory_locations(&source.id, &target.id)
            .expect_err("late archive failure should abort merge");
        assert!(error.to_string().contains("forced late archive failure"));
        let references: (String, String) = db
            .connection()
            .query_row(
                "SELECT location_id, home_location_id
                 FROM filament_spools WHERE id = 'rollback-spool'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read rolled-back references");
        assert_eq!(references, (source.id.clone(), source.id.clone()));
        let child_parent: String = db
            .connection()
            .query_row(
                "SELECT parent_id FROM inventory_locations WHERE id = ?1",
                params![child.id],
                |row| row.get(0),
            )
            .expect("read rolled-back parent");
        assert_eq!(child_parent, source.id);
        let history_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM spool_history_events
                 WHERE spool_id = 'rollback-spool' AND event_type = 'LOCATION_MERGED'",
                [],
                |row| row.get(0),
            )
            .expect("read rolled-back history");
        assert_eq!(history_count, 0);
        assert!(db
            .list_inventory_locations(true)
            .expect("list source")
            .into_iter()
            .find(|row| row.id == source.id)
            .and_then(|row| row.archived_at)
            .is_none());

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn generic_crud_rejects_printer_slot_locations() {
        let (path, db) = open_db("system-owned");
        db.connection()
            .execute(
                "INSERT INTO inventory_locations (
                    id, name, type, created_at, updated_at
                 ) VALUES (
                    'Printer:Studio:slot-1', 'Printer:Studio:slot-1', 'PRINTER_SLOT',
                    datetime('now'), datetime('now')
                 )",
                [],
            )
            .expect("seed printer location");
        for error in [
            db.rename_inventory_location("Printer:Studio:slot-1", "New name")
                .expect_err("rename should fail"),
            db.archive_inventory_location("Printer:Studio:slot-1")
                .expect_err("archive should fail"),
            db.restore_inventory_location("Printer:Studio:slot-1")
                .expect_err("restore should fail"),
            db.delete_inventory_location("Printer:Studio:slot-1")
                .expect_err("delete should fail"),
        ] {
            assert!(error.to_string().contains("system locations"));
        }

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn legacy_shelf_type_supports_the_full_user_managed_lifecycle() {
        let (path, db) = open_db("legacy-shelf-lifecycle");
        db.connection()
            .execute(
                "INSERT INTO inventory_locations (
                    id, name, type, created_at, updated_at
                 ) VALUES (
                    'legacy-shelf', 'Legacy shelf', 'SHELF', datetime('now'), datetime('now')
                 )",
                [],
            )
            .expect("seed legacy shelf");

        let listed = db
            .list_inventory_locations(false)
            .expect("list legacy shelf")
            .into_iter()
            .find(|row| row.id == "legacy-shelf")
            .expect("legacy shelf remains visible");
        assert_eq!(listed.location_type, "GENERIC");
        assert!(listed.can_delete);

        let renamed = db
            .rename_inventory_location("legacy-shelf", "Renamed shelf")
            .expect("rename legacy shelf");
        assert_eq!(renamed.name, "Renamed shelf");
        db.archive_inventory_location("legacy-shelf")
            .expect("archive legacy shelf");
        db.restore_inventory_location("legacy-shelf")
            .expect("restore legacy shelf");
        db.delete_inventory_location("legacy-shelf")
            .expect("delete unreferenced legacy shelf");
        let remaining: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM inventory_locations WHERE id = 'legacy-shelf'",
                [],
                |row| row.get(0),
            )
            .expect("read deleted shelf");
        assert_eq!(remaining, 0);

        drop(db);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn full_backup_round_trip_preserves_location_identity_and_archive_metadata() {
        let (source_path, source) = open_db("backup-source");
        let location = source
            .create_inventory_location("Archive Bin", None)
            .expect("create location");
        source
            .archive_inventory_location(&location.id)
            .expect("archive location");
        let backup = source.export_full_backup_json().expect("export backup");

        let (target_path, target) = open_db("backup-target");
        target
            .import_full_backup_json(&backup)
            .expect("import backup");
        let restored = target
            .list_inventory_locations(true)
            .expect("list restored locations")
            .into_iter()
            .find(|row| row.id == location.id)
            .expect("restored location");
        assert_eq!(restored.name, "Archive Bin");
        assert!(restored.archived_at.is_some());
        assert!(!restored.created_at.is_empty());
        assert!(!restored.updated_at.is_empty());

        drop(source);
        drop(target);
        let _ = std::fs::remove_file(source_path);
        let _ = std::fs::remove_file(target_path);
    }

    #[test]
    fn host_location_cache_round_trip_preserves_active_and_archived_objects() {
        let (path, db) = open_db("host-cache");
        let active = db
            .create_inventory_location("Cache Active", None)
            .expect("create active location");
        let archived = db
            .create_inventory_location("Cache Archived", None)
            .expect("create archived location");
        db.archive_inventory_location(&archived.id)
            .expect("archive cached location");
        let rows = db
            .list_inventory_locations(true)
            .expect("list cache source");
        let saved = db
            .save_library_sync_cached_locations(&rows)
            .expect("save location cache");
        let loaded = db
            .get_library_sync_cached_locations()
            .expect("load location cache")
            .expect("cached locations");
        assert_eq!(loaded.captured_at, saved.captured_at);
        assert!(loaded.rows.iter().any(|row| row.id == active.id));
        assert!(loaded
            .rows
            .iter()
            .any(|row| { row.id == archived.id && row.archived_at.is_some() }));

        drop(db);
        let _ = std::fs::remove_file(path);
    }
}
