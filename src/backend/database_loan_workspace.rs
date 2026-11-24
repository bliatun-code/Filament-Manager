use rusqlite::{OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase,
    database_result::{InventoryError, InventoryResult},
    database_settings::{get_setting, set_setting},
    loan_defaults::{ACTIVE_LOAN_PREDICATE_SQL_L, LOAN_DIRECTION_SELECT_SQL_L},
    spool_defaults::SPOOL_OWNERSHIP_SELECT_SQL_S,
};

pub(crate) const CACHED_COUNTS: &str = "library_sync_cached_loan_workspace_counts";

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoanWorkspaceCounts {
    pub stock: Option<i64>,
    pub loans: Option<i64>,
    pub locations: Option<i64>,
    pub purchases: Option<i64>,
}

impl FilamentDatabase {
    pub fn loan_workspace_counts(&self) -> InventoryResult<LoanWorkspaceCounts> {
        // The loan tab includes every non-deleted borrowed roll, including old
        // imports without a matching inbound loan. Purchases displays 500 rows.
        let sql = format!("WITH stock AS (
            SELECT count(*) AS total, count(*) FILTER (WHERE ({SPOOL_OWNERSHIP_SELECT_SQL_S}) = 'BORROWED_IN') AS borrowed
            FROM filament_spools s JOIN filament_master_list m ON m.id = s.master_id WHERE s.deleted_at IS NULL
        ) SELECT total, borrowed + (
            SELECT count(*) FROM spool_loans l JOIN filament_spools s ON s.id = l.spool_id
            JOIN filament_master_list m ON m.id = s.master_id WHERE s.deleted_at IS NULL
            AND {LOAN_DIRECTION_SELECT_SQL_L} = 'OUTBOUND' AND {ACTIVE_LOAN_PREDICATE_SQL_L}
        ), (SELECT count(*) FROM inventory_locations WHERE coalesce(archived_at, '') = ''
            AND upper(trim(type)) IN ('GENERIC', 'SHELF')),
           (SELECT count(*) FROM (SELECT 1 FROM wishlist_items LIMIT 500)) FROM stock");
        Ok(self.connection().query_row(&sql, [], |r| {
            Ok(LoanWorkspaceCounts {
                stock: r.get(0)?,
                loans: r.get(1)?,
                locations: r.get(2)?,
                purchases: r.get(3)?,
            })
        })?)
    }

    pub fn cached_loan_workspace_counts(&self) -> InventoryResult<LoanWorkspaceCounts> {
        if let Some(value) = get_setting(self.connection(), CACHED_COUNTS)? {
            return serde_json::from_str(&value).map_err(|e| InventoryError::Db(e.to_string()));
        }

        // An upgraded, disconnected Client may only have the previous list caches.
        // Reduce those inside SQLite once, without materializing any spool rows in the app.
        let stock = self.reduce_cached_rows("library_sync_cached_spools_json", &format!(
            "SELECT count(*), count(*) FILTER (WHERE ({SPOOL_OWNERSHIP_SELECT_SQL_S}) = 'BORROWED_IN')
             FROM (SELECT value ->> '$.spool.ownership_type' AS ownership_type FROM json_each((SELECT rows FROM valid_cache))) s"
        ), |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?;
        let outbound = self.reduce_cached_rows(super::database_library_sync_cache::CACHED_ACTIVE_LOANS_KEY,
            &format!("SELECT count(*) FROM (
                SELECT value ->> '$.loan.loan_direction' AS loan_direction, value ->> '$.loan.loan_status' AS loan_status,
                       value ->> '$.loan.returned_at' AS returned_at, value ->> '$.spool_status' AS spool_status
                FROM json_each((SELECT rows FROM valid_cache))) l WHERE {LOAN_DIRECTION_SELECT_SQL_L} = 'OUTBOUND'
                  AND {ACTIVE_LOAN_PREDICATE_SQL_L} AND upper(trim(coalesce(spool_status,''))) <> 'DELETED'"),
            |r| r.get::<_, i64>(0))?;
        let counts = LoanWorkspaceCounts {
            stock: stock.map(|(total, _)| total),
            loans: stock.zip(outbound).map(|((_, borrowed), lent)| borrowed + lent),
            locations: self.reduce_cached_rows("library_sync_cached_locations_json",
                "SELECT count(*) FROM json_each((SELECT rows FROM valid_cache)) WHERE upper(trim(value ->> '$.location_type')) IN ('GENERIC','SHELF')
                 AND coalesce(value ->> '$.archived_at','') = ''", |r| r.get(0))?,
            purchases: self.reduce_cached_rows("library_sync_cached_wishlist_json",
                "SELECT min(500, json_array_length((SELECT rows FROM valid_cache)))", |r| r.get(0))?,
        };
        if counts != LoanWorkspaceCounts::default() {
            self.save_loan_workspace_counts(&counts)?;
        }
        Ok(counts)
    }

    fn reduce_cached_rows<T>(
        &self,
        key: &str,
        aggregate: &str,
        read: impl FnOnce(&Row<'_>) -> rusqlite::Result<T>,
    ) -> InventoryResult<Option<T>> {
        // Joining the aggregate to a valid cache keeps a missing list distinct from [].
        let sql = format!("WITH cache AS (SELECT CASE WHEN json_valid(value) THEN value -> '$.rows' END AS rows
            FROM settings WHERE key = ?1), valid_cache AS (SELECT rows FROM cache WHERE json_type(rows) = 'array')
            SELECT * FROM ({aggregate}) WHERE EXISTS (SELECT 1 FROM valid_cache)");
        Ok(self.connection().query_row(&sql, [key], read).optional()?)
    }

    pub fn save_loan_workspace_counts(&self, counts: &LoanWorkspaceCounts) -> InventoryResult<()> {
        let json = serde_json::to_string(counts).map_err(|e| InventoryError::Db(e.to_string()))?;
        set_setting(self.connection(), CACHED_COUNTS, &json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upgraded_offline_loan_workspace_reuses_compact_counts_after_first_open() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        assert_eq!(
            db.cached_loan_workspace_counts().unwrap(),
            LoanWorkspaceCounts::default()
        );
        for (key, value) in [
            (
                "library_sync_cached_spools_json",
                r#"{"rows":[{"spool":{"ownership_type":"borrowed-in"}},{"spool":{}}]}"#,
            ),
            (
                super::super::database_library_sync_cache::CACHED_ACTIVE_LOANS_KEY,
                r#"{"rows":[{"loan":{}},{"loan":{"loan_direction":"INBOUND"}}]}"#,
            ),
            ("library_sync_cached_locations_json", "unreadable"),
            ("library_sync_cached_wishlist_json", r#"{"rows":[]}"#),
        ] {
            set_setting(db.connection(), key, value).unwrap();
        }
        let counts = db.cached_loan_workspace_counts().unwrap();
        assert_eq!(
            counts,
            LoanWorkspaceCounts {
                stock: Some(2),
                loans: Some(2),
                locations: None,
                purchases: Some(0)
            }
        );
        set_setting(
            db.connection(),
            "library_sync_cached_spools_json",
            "unreadable",
        )
        .unwrap();
        assert_eq!(db.cached_loan_workspace_counts().unwrap(), counts);
    }

    #[test]
    fn loan_workspace_badges_match_the_stock_tabs_after_lending_and_returning() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let conn = db.connection();
        conn.execute_batch("DELETE FROM inventory_locations;
            INSERT INTO inventory_locations(id,name,type) VALUES ('s','Shelf','SHELF'),('g','Box','GENERIC'),('p','Printer','PRINTER');
            INSERT INTO inventory_locations(id,name,type,archived_at) VALUES ('old','Old','GENERIC','yesterday');
            INSERT INTO filament_master_list(id,vendor,material,filament_name,color_name) VALUES ('m','V','PLA','PLA','Blue');
            INSERT INTO filament_spools(id,master_id,status,ownership_type) VALUES
              ('owned','m','IN_STOCK','OWNED'),('borrowed','m','IN_STOCK','BORROWED_IN'),('empty','m','EMPTY','borrowed-in'),
              ('gone','m','IN_STOCK','BORROWED_IN');
            UPDATE filament_spools SET deleted_at='yesterday' WHERE id='gone';
            INSERT INTO spool_loans(id,spool_id,borrower_name,grams_out,loan_direction) VALUES
              ('in','borrowed','Owner',20,'INBOUND'),('deleted','gone','Old',10,'OUTBOUND');
            INSERT INTO wishlist_items(id,material,filament_name,color_name,vendor) VALUES ('w','PLA','PLA','Red','V');").unwrap();
        let before = db.loan_workspace_counts().unwrap();
        assert_eq!(
            before,
            LoanWorkspaceCounts {
                stock: Some(3),
                loans: Some(2),
                locations: Some(2),
                purchases: Some(1)
            }
        );
        conn.execute("INSERT INTO spool_loans(id,spool_id,borrower_name,grams_out) VALUES ('out','owned','Borrower',500)", []).unwrap();
        assert_eq!(db.loan_workspace_counts().unwrap().loans, Some(3));
        conn.execute(
            "UPDATE spool_loans SET returned_at='now' WHERE id='out'",
            [],
        )
        .unwrap();
        assert_eq!(db.loan_workspace_counts().unwrap(), before);
    }
}
