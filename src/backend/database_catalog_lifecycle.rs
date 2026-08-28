use rusqlite::{params, Connection};

use super::database_catalog_schema::{
    ensure_catalog_lifecycle_columns, ensure_catalog_seed_columns,
};
use super::database_result::InventoryResult;

pub(crate) fn reactivate_seen_vendor_material(
    conn: &Connection,
    vendor: &str,
    material: &str,
    refresh_started_at: &str,
) -> InventoryResult<i64> {
    ensure_catalog_lifecycle_columns(conn)?;
    ensure_catalog_seed_columns(conn)?;

    reactivate_seen_vendor_material_in_transaction(conn, vendor, material, refresh_started_at)
}

pub(crate) fn reactivate_seen_vendor_material_in_transaction(
    conn: &Connection,
    vendor: &str,
    material: &str,
    refresh_started_at: &str,
) -> InventoryResult<i64> {
    let reactivated = conn.execute(
        "UPDATE filament_master_list
         SET is_discontinued = 0,
             discontinued_at = NULL,
             updated_at = datetime('now')
         WHERE vendor = ?2 COLLATE NOCASE
           AND material = ?3 COLLATE NOCASE
           AND catalog_user_edited = 0
           AND is_discontinued != 0
           AND last_seen_at IS NOT NULL
           AND last_seen_at >= ?1",
        params![refresh_started_at, vendor, material],
    )? as i64;

    Ok(reactivated)
}

#[cfg(test)]
mod tests {
    use super::reactivate_seen_vendor_material;
    use rusqlite::{params, Connection};

    fn database() -> Connection {
        let connection = Connection::open_in_memory().expect("open catalog lifecycle database");
        connection
            .execute_batch(include_str!("../database/schema.sql"))
            .expect("apply schema");
        connection
    }

    fn insert_row(
        connection: &Connection,
        id: &str,
        material: &str,
        last_seen_at: Option<&str>,
        discontinued: bool,
    ) {
        connection
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, vendor, last_seen_at,
                    is_discontinued, discontinued_at
                 ) VALUES (?1, ?2, ?1, ?1, 'eSUN', ?3, ?4,
                           CASE WHEN ?4 = 1 THEN '2026-01-01 00:00:00' ELSE NULL END)",
                params![id, material, last_seen_at, i64::from(discontinued)],
            )
            .expect("insert catalog lifecycle row");
    }

    #[test]
    fn targeted_reactivation_never_changes_unseen_or_other_material_rows() {
        let connection = database();
        insert_row(
            &connection,
            "seen-pla",
            "PLA",
            Some("2026-08-28 00:00:01"),
            true,
        );
        insert_row(
            &connection,
            "old-pla",
            "PLA",
            Some("2026-08-27 00:00:00"),
            true,
        );
        insert_row(
            &connection,
            "seen-petg",
            "PETG",
            Some("2026-08-28 00:00:01"),
            true,
        );

        let count =
            reactivate_seen_vendor_material(&connection, "eSUN", "PLA", "2026-08-28 00:00:00")
                .expect("reactivate observed PLA");
        assert_eq!(count, 1);

        let states: Vec<(String, i64)> = connection
            .prepare("SELECT id, is_discontinued FROM filament_master_list ORDER BY id")
            .expect("prepare states")
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .expect("query states")
            .collect::<Result<_, _>>()
            .expect("collect states");
        assert_eq!(
            states,
            vec![
                ("old-pla".to_string(), 1),
                ("seen-petg".to_string(), 1),
                ("seen-pla".to_string(), 0),
            ]
        );
    }
}
