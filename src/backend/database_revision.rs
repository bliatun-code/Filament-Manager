use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::database_result::{InventoryError, InventoryResult};

pub(crate) const INVENTORY_REVISION_DOMAIN: &str = "inventory";
pub(crate) const CATALOG_REVISION_DOMAIN: &str = "catalog";
pub(crate) const LOANS_REVISION_DOMAIN: &str = "loans";
pub(crate) const PRINTERS_REVISION_DOMAIN: &str = "printers";
pub(crate) const JOBS_REVISION_DOMAIN: &str = "jobs";
pub(crate) const WISHLIST_REVISION_DOMAIN: &str = "wishlist";

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct LibraryDomainRevisions {
    pub inventory: i64,
    pub catalog: i64,
    pub loans: i64,
    pub printers: i64,
    pub jobs: i64,
    pub wishlist: i64,
}

pub(crate) fn read_library_domain_revisions(
    conn: &Connection,
) -> InventoryResult<LibraryDomainRevisions> {
    conn.query_row(
        "SELECT
            COALESCE(MAX(CASE WHEN domain = 'inventory' THEN revision END), 0),
            COALESCE(MAX(CASE WHEN domain = 'catalog' THEN revision END), 0),
            COALESCE(MAX(CASE WHEN domain = 'loans' THEN revision END), 0),
            COALESCE(MAX(CASE WHEN domain = 'printers' THEN revision END), 0),
            COALESCE(MAX(CASE WHEN domain = 'jobs' THEN revision END), 0),
            COALESCE(MAX(CASE WHEN domain = 'wishlist' THEN revision END), 0)
         FROM library_domain_revisions",
        [],
        |row| {
            Ok(LibraryDomainRevisions {
                inventory: row.get(0)?,
                catalog: row.get(1)?,
                loans: row.get(2)?,
                printers: row.get(3)?,
                jobs: row.get(4)?,
                wishlist: row.get(5)?,
            })
        },
    )
    .map_err(InventoryError::from)
}

pub(crate) fn bump_library_domain_revision(conn: &Connection, domain: &str) -> InventoryResult<()> {
    if !matches!(
        domain,
        INVENTORY_REVISION_DOMAIN
            | CATALOG_REVISION_DOMAIN
            | LOANS_REVISION_DOMAIN
            | PRINTERS_REVISION_DOMAIN
            | JOBS_REVISION_DOMAIN
            | WISHLIST_REVISION_DOMAIN
    ) {
        return Err(InventoryError::Db(format!(
            "Unknown library revision domain: {domain}"
        )));
    }
    let updated = conn.execute(
        "UPDATE library_domain_revisions
         SET revision = revision + 1,
             updated_at = datetime('now')
         WHERE domain = ?1",
        params![domain],
    )?;
    if updated != 1 {
        return Err(InventoryError::Db(format!(
            "Library revision domain is not initialized: {domain}"
        )));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        bump_library_domain_revision, read_library_domain_revisions, INVENTORY_REVISION_DOMAIN,
    };
    use rusqlite::Connection;

    const SCHEMA_SQL: &str = include_str!("../database/schema.sql");
    const REVISION_SQL: &str =
        include_str!("../database/migrations/003_library_domain_revisions.sql");

    fn revision_database() -> Connection {
        let conn = Connection::open_in_memory().expect("open revision database");
        conn.execute_batch(SCHEMA_SQL).expect("apply schema");
        conn.execute_batch(REVISION_SQL)
            .expect("apply revision migration");
        conn
    }

    #[test]
    fn domain_tables_increment_only_their_revision() {
        let conn = revision_database();
        let initial = read_library_domain_revisions(&conn).expect("read initial revisions");

        conn.execute(
            "INSERT INTO filament_master_list (
                id, material, filament_name, color_name, default_weight, vendor
             ) VALUES ('master-1', 'PLA', 'Basic', 'Blue', 1000, 'Manual')",
            [],
        )
        .expect("insert catalog row");
        conn.execute(
            "INSERT INTO filament_spools (id, master_id, status)
             VALUES ('spool-1', 'master-1', 'IN_STOCK')",
            [],
        )
        .expect("insert spool");
        conn.execute(
            "INSERT INTO spool_loans (id, spool_id, borrower_name, grams_out)
             VALUES ('loan-1', 'spool-1', 'Ada', 500)",
            [],
        )
        .expect("insert loan");
        conn.execute(
            "INSERT INTO printers (id, model, name)
             VALUES ('printer-1', 'P1S', 'Workshop')",
            [],
        )
        .expect("insert printer");
        conn.execute(
            "INSERT INTO print_jobs (id, printer_id, spool_id, job_name)
             VALUES ('job-1', 'printer-1', 'spool-1', 'Test')",
            [],
        )
        .expect("insert job");
        conn.execute(
            "INSERT INTO wishlist_items (
                id, master_id, material, filament_name, color_name, vendor
             ) VALUES ('wish-1', 'master-1', 'PLA', 'Basic', 'Blue', 'Manual')",
            [],
        )
        .expect("insert wishlist item");

        let current = read_library_domain_revisions(&conn).expect("read current revisions");
        assert_eq!(current.inventory, initial.inventory + 1);
        assert_eq!(current.catalog, initial.catalog + 1);
        assert_eq!(current.loans, initial.loans + 1);
        assert_eq!(current.printers, initial.printers + 1);
        assert_eq!(current.jobs, initial.jobs + 1);
        assert_eq!(current.wishlist, initial.wishlist + 1);
    }

    #[test]
    fn ordinary_settings_writes_do_not_change_domain_revisions() {
        let conn = revision_database();
        let before = read_library_domain_revisions(&conn).expect("read revisions before setting");
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('library_sync_cache', '{}')",
            [],
        )
        .expect("write cache setting");
        assert_eq!(
            read_library_domain_revisions(&conn).expect("read revisions after setting"),
            before
        );
    }

    #[test]
    fn explicit_bump_validates_and_increments_known_domains() {
        let conn = revision_database();
        bump_library_domain_revision(&conn, INVENTORY_REVISION_DOMAIN)
            .expect("bump inventory revision");
        assert_eq!(
            read_library_domain_revisions(&conn)
                .expect("read bumped revision")
                .inventory,
            1
        );
        let error = bump_library_domain_revision(&conn, "settings")
            .expect_err("unknown revision domain should fail");
        assert!(error
            .to_string()
            .contains("Unknown library revision domain"));
    }
}
