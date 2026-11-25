use rusqlite::{functions::FunctionFlags, params, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{
    database_core::FilamentDatabase, database_result::InventoryResult,
    database_wishlist::map_wishlist_item, database_wishlist_models::WishlistItemRow,
};

const PAGE_SIZE: i64 = 50;

#[derive(Debug, Deserialize, Serialize)]
pub struct PurchaseQueueQuery {
    pub status: String,
    pub search: String,
    pub offset: u32,
    pub reviewed_item_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurchaseQueueSummary {
    pub all: i64,
    pub wishlist: i64,
    pub on_order: i64,
    pub received: i64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PurchaseQueuePage {
    pub summary: PurchaseQueueSummary,
    pub matched: i64,
    pub offset: i64,
    pub revision: i64,
    pub rows: Vec<WishlistItemRow>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockPurchaseQuery {
    pub cached_revision: Option<i64>,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct StockPurchaseSnapshot {
    pub total: i64,
    pub revision: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rows: Option<Vec<WishlistItemRow>>,
}

impl FilamentDatabase {
    pub fn stock_purchase_count(&self) -> InventoryResult<i64> {
        Ok(self
            .connection()
            .query_row("SELECT count(*) FROM wishlist_items", [], |row| row.get(0))?)
    }

    pub fn stock_purchase_snapshot(
        &self,
        query: &StockPurchaseQuery,
    ) -> InventoryResult<StockPurchaseSnapshot> {
        self.with_read_transaction(|db| {
            let revision = db.library_domain_revisions()?.wishlist;
            Ok(StockPurchaseSnapshot {
                revision,
                total: db.stock_purchase_count()?,
                rows: if query.cached_revision == Some(revision) {
                    None
                } else {
                    Some(db.list_wishlist_items(PAGE_SIZE)?)
                },
            })
        })
    }

    pub fn cached_stock_purchase_revision(&self) -> InventoryResult<Option<i64>> {
        Ok(self.connection().query_row(
            "SELECT CASE WHEN json_valid(value) THEN CASE WHEN json_extract(value,'$.stock_page')=1
                   AND json_type(value,'$.rows')='array' THEN json_extract(value,'$.revision') END END
             FROM settings WHERE key='library_sync_cached_wishlist_json'", [], |row| row.get(0),
        ).optional()?.flatten())
    }

    pub fn purchase_queue_page(
        &self,
        query: &PurchaseQueueQuery,
    ) -> InventoryResult<PurchaseQueuePage> {
        self.with_read_transaction(|db| {
            let conn = db.connection();
            conn.create_scalar_function(
                "purchase_lower", 1,
                FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
                |ctx| Ok(ctx.get::<String>(0)?.to_lowercase()),
            )?;
            let search = query.search.trim().to_lowercase();
            let filter = "(?1='ALL' OR status=?1) AND (?2='' OR instr(
                purchase_lower(vendor||' '||material||' '||filament_name||' '||color_name), ?2)>0)";
            let (summary, matched): (_, i64) = conn.query_row(
                &format!("SELECT count(*), count(*) FILTER (WHERE status='WISHLIST'),
                    count(*) FILTER (WHERE status='ON_ORDER'), count(*) FILTER (WHERE status='RECEIVED'),
                    count(*) FILTER (WHERE {filter}) FROM wishlist_items"),
                params![query.status, search],
                |row| Ok((PurchaseQueueSummary {
                    all: row.get(0)?,
                    wishlist: row.get(1)?,
                    on_order: row.get(2)?,
                    received: row.get(3)?,
                }, row.get(4)?)),
            )?;
            let last_page = (matched - 1).max(0) / PAGE_SIZE * PAGE_SIZE;
            let offset = (i64::from(query.offset) / PAGE_SIZE * PAGE_SIZE).min(last_page);
            let mut statement = conn.prepare(&format!(
                "SELECT id,master_id,material,filament_name,color_name,vendor,status,quantity,note,created_at,updated_at
                 FROM wishlist_items WHERE {filter}
                 ORDER BY (id=?3) DESC, updated_at DESC, created_at DESC, id LIMIT ?4 OFFSET ?5"
            ))?;
            let rows = statement.query_map(
                params![query.status, search, query.reviewed_item_id, PAGE_SIZE, offset],
                map_wishlist_item,
            )?.collect::<Result<Vec<_>, _>>()?;
            Ok(PurchaseQueuePage {
                summary, matched, offset, rows,
                revision: db.library_domain_revisions()?.wishlist,
            })
        })
    }
}

// Keep the same scoped cache envelope used by previous clients. Full list captures
// omit the optional revision. Pages from different Host revisions must not mix.
#[derive(Deserialize, Serialize)]
struct CachedQueue {
    #[serde(default)]
    stock_page: bool,
    revision: Option<i64>,
    captured_at: String,
    rows: Vec<WishlistItemRow>,
}

impl FilamentDatabase {
    pub fn cache_purchase_queue_page(&self, page: &PurchaseQueuePage) -> InventoryResult<()> {
        self.cache_purchase_rows(&page.rows, page.summary.all, page.revision, false)
    }

    pub fn cache_purchase_rows(
        &self,
        page_rows: &[WishlistItemRow],
        total: i64,
        revision: i64,
        stock_page: bool,
    ) -> InventoryResult<()> {
        const KEY: &str = "library_sync_cached_wishlist_json";
        // An empty filter is not an empty library. Keep the last offline capture.
        if page_rows.is_empty() && total > 0 {
            return Ok(());
        }
        self.with_write_transaction(|db| {
            let previous: Option<CachedQueue> = db
                .get_setting(KEY)?
                .and_then(|json| serde_json::from_str(&json).ok());
            if previous
                .as_ref()
                .and_then(|cache| cache.revision)
                .is_some_and(|rev| rev > revision)
            {
                return Ok(());
            }
            let mut rows = page_rows.to_vec();
            if let Some(cache) = previous.filter(|cache| cache.revision == Some(revision)) {
                let seen: std::collections::HashSet<_> =
                    page_rows.iter().map(|row| &row.id).collect();
                rows.extend(
                    cache
                        .rows
                        .into_iter()
                        .filter(|row| !seen.contains(&row.id))
                        .take(500usize.saturating_sub(rows.len())),
                );
            }
            let cached = CachedQueue {
                stock_page,
                revision: Some(revision),
                captured_at: db.sqlite_now()?,
                rows,
            };
            let json = serde_json::to_string(&cached)
                .map_err(|e| super::database_result::InventoryError::Db(e.to_string()))?;
            db.set_setting(KEY, &json)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stock_count_distinguishes_a_saved_empty_page_from_a_missing_capture() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let read = || {
            db.stock_purchase_snapshot(&StockPurchaseQuery {
                cached_revision: db.cached_stock_purchase_revision().unwrap(),
            })
            .unwrap()
        };
        let empty = read();
        assert_eq!(empty.total, 0);
        let rows = empty.rows.unwrap();
        assert!(rows.is_empty());
        db.cache_purchase_rows(&rows, 0, empty.revision, true)
            .unwrap();
        assert!(read().rows.is_none());

        db.connection()
            .execute_batch(
                "WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<51)
             INSERT INTO wishlist_items(id,material,filament_name,color_name,status)
             SELECT printf('order-%02d',i),'PLA','Silk','Blue','ON_ORDER' FROM n",
            )
            .unwrap();
        let changed = read();
        assert_eq!(changed.total, 51);
        assert_eq!(changed.rows.unwrap().len(), 50);
    }

    #[test]
    fn searches_and_counts_the_entire_queue_and_caches_only_visited_rows() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        db.connection()
            .execute_batch(
                "INSERT INTO wishlist_items(id,material,filament_name,color_name,status,updated_at)
          VALUES ('old','PLA','Silk','BLÅ_100%','ON_ORDER','2000-01-01');
          WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<501)
          INSERT INTO wishlist_items(id,material,filament_name,color_name,status)
          SELECT printf('receipt-%03d',i),'PLA','Silk','Green','RECEIVED' FROM n;",
            )
            .unwrap();
        let mut query = PurchaseQueueQuery {
            status: "ON_ORDER".into(),
            search: "blå_100%".into(),
            offset: 0,
            reviewed_item_id: None,
        };
        let order = db.purchase_queue_page(&query).unwrap();
        assert_eq!(
            (order.summary.all, order.summary.on_order, order.matched),
            (502, 1, 1)
        );
        assert_eq!(order.rows[0].id, "old");
        db.cache_purchase_queue_page(&order).unwrap();
        query.status = "ALL".into();
        query.search.clear();
        query.reviewed_item_id = Some("old".into());
        let first = db.purchase_queue_page(&query).unwrap();
        assert_eq!(first.rows.len(), 50);
        assert_eq!(first.rows[0].id, "old");
        db.cache_purchase_queue_page(&first).unwrap();
        query.offset = 50;
        let next = db.purchase_queue_page(&query).unwrap();
        assert!(next
            .rows
            .iter()
            .all(|r| first.rows.iter().all(|p| r.id != p.id)));
        db.cache_purchase_queue_page(&next).unwrap();
        assert_eq!(
            db.get_library_sync_settings()
                .unwrap()
                .cached_wishlist
                .unwrap()
                .rows
                .len(),
            100
        );
        query.search = "missing".into();
        let no_match = db.purchase_queue_page(&query).unwrap();
        db.cache_purchase_queue_page(&no_match).unwrap();
        assert_eq!(
            db.get_library_sync_settings()
                .unwrap()
                .cached_wishlist
                .unwrap()
                .rows
                .len(),
            100
        );
        db.connection()
            .execute("DELETE FROM wishlist_items", [])
            .unwrap();
        let empty = db.purchase_queue_page(&query).unwrap();
        assert_eq!((empty.offset, empty.matched), (0, 0));
        db.cache_purchase_queue_page(&empty).unwrap();
        db.cache_purchase_queue_page(&first).unwrap();
        assert!(db
            .get_library_sync_settings()
            .unwrap()
            .cached_wishlist
            .unwrap()
            .rows
            .is_empty());
    }
}
