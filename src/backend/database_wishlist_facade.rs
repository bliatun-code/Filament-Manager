use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_wishlist::{
    delete_wishlist_item as delete_wishlist_item_row,
    insert_wishlist_item as insert_wishlist_item_row,
    list_wishlist_items as list_wishlist_item_rows,
    receive_wishlist_item as receive_wishlist_item_rows,
    update_wishlist_item_status as update_wishlist_item_status_row,
};
use super::database_wishlist_models::{
    DashboardPurchaseResult, WishlistItemRow, WishlistReceiptResult,
};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

impl FilamentDatabase {
    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        list_wishlist_item_rows(self.connection(), limit)
    }

    pub fn wishlist_page_with_reviewed_item(
        &self,
        limit: i64,
        item_id: &str,
    ) -> InventoryResult<Vec<WishlistItemRow>> {
        self.with_read_transaction(|db| {
            let mut rows = db.list_wishlist_items(limit)?;
            if let Some(index) = rows.iter().position(|row| row.id == item_id) {
                rows[..=index].rotate_right(1);
            } else if let Some(item) =
                super::database_wishlist::wishlist_item_by_id(db.connection(), item_id)?
            {
                rows.insert(0, item);
            }
            Ok(rows)
        })
    }

    pub fn ensure_dashboard_purchase(
        &self,
        item: &WishlistItemRow,
    ) -> InventoryResult<DashboardPurchaseResult> {
        use rusqlite::{functions::FunctionFlags, params, OptionalExtension};
        self.connection().create_scalar_function(
            "purchase_identity_token",
            1,
            FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
            |ctx| {
                let value: Option<String> = ctx.get(0)?;
                Ok(value
                    .unwrap_or_default()
                    .split_whitespace()
                    .collect::<Vec<_>>()
                    .join(" ")
                    .to_uppercase())
            },
        )?;
        self.with_inventory_transaction(|conn| {
            let existing = conn.query_row(
                "WITH candidates AS (
                   SELECT id, upper(trim(status)) AS state,
                          coalesce(nullif(trim(master_id),'') = nullif(trim(?1),''), 0) AS by_master,
                          vendor, material, filament_name, color_name
                   FROM wishlist_items WHERE upper(trim(status)) IN ('WISHLIST','ON_ORDER')
                 ) SELECT id, state, by_master FROM candidates
                   WHERE by_master OR (purchase_identity_token(vendor)=purchase_identity_token(?2)
                     AND purchase_identity_token(material)=purchase_identity_token(?3)
                     AND purchase_identity_token(filament_name)=purchase_identity_token(?4)
                     AND purchase_identity_token(color_name)=purchase_identity_token(?5))
                   ORDER BY by_master DESC, (state='ON_ORDER') DESC, id LIMIT 1",
                params![item.master_id, item.vendor, item.material, item.filament_name, item.color_name],
                |row| {
                    let by_master: bool = row.get(2)?;
                    Ok(DashboardPurchaseResult::Reused {
                        item_id: row.get(0)?,
                        status: row.get(1)?,
                        matched_by: if by_master { "MASTER_ID" } else { "IDENTITY" }.into(),
                    })
                },
            ).optional()?;
            if let Some(result) = existing {
                return Ok(result);
            }
            insert_wishlist_item_row(conn, item)?;
            Ok(DashboardPurchaseResult::Created {
                item_id: item.id.clone(),
                status: item.status.clone(),
            })
        })
    }

    pub fn insert_wishlist_item(&self, item: &WishlistItemRow) -> InventoryResult<()> {
        insert_wishlist_item_row(self.connection(), item)
    }

    pub fn update_wishlist_item_status(&self, item_id: &str, status: &str) -> InventoryResult<()> {
        update_wishlist_item_status_row(self.connection(), item_id, status)
    }

    pub fn receive_wishlist_item(
        &self,
        item_id: &str,
        quantity: i64,
        purchase_metadata: PurchaseReceiptMetadata,
        home_location: Option<&str>,
        request_id: Option<&str>,
    ) -> InventoryResult<WishlistReceiptResult> {
        receive_wishlist_item_rows(
            self.connection(),
            item_id,
            quantity,
            purchase_metadata,
            home_location,
            request_id,
        )
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        delete_wishlist_item_row(self.connection(), item_id)
    }
}

#[cfg(test)]
mod dashboard_purchase_tests {
    use super::*;
    use crate::backend::database_wishlist_models::DashboardPurchaseResult;

    fn item(id: &str) -> WishlistItemRow {
        WishlistItemRow {
            id: id.into(),
            master_id: None,
            material: "PLA".into(),
            filament_name: "Silk".into(),
            color_name: "Blå".into(),
            vendor: "Norsk Filament".into(),
            status: "WISHLIST".into(),
            quantity: 1,
            note: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn dashboard_purchase_reuses_old_open_order_beyond_the_queue_limit() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let mut old = item("old");
        old.status = "ON_ORDER".into();
        old.quantity = 7;
        old.vendor = "NORSK  FILAMENT".into();
        old.color_name = "BLÅ".into();
        db.insert_wishlist_item(&old).unwrap();
        db.connection().execute_batch("UPDATE wishlist_items SET updated_at='2000-01-01';
            WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<501)
            INSERT INTO wishlist_items(id,vendor,material,filament_name,color_name,status,quantity)
            SELECT printf('received-%03d',i),'Norsk Filament','PLA','Silk','Blå','RECEIVED',1 FROM n;").unwrap();
        assert!(db
            .list_wishlist_items(500)
            .unwrap()
            .iter()
            .all(|r| r.status == "RECEIVED"));
        let page = db.list_wishlist_items(500).unwrap();
        let pinned = db.wishlist_page_with_reviewed_item(500, "old").unwrap();
        assert_eq!(pinned.len(), 501);
        assert_eq!(pinned[0].id, "old");
        assert_eq!(pinned[0].quantity, 7);
        assert!(pinned[1..].iter().zip(&page).all(|(a, b)| a.id == b.id));
        let present = db
            .wishlist_page_with_reviewed_item(500, &page[10].id)
            .unwrap();
        assert_eq!(present.len(), 500);
        assert_eq!(present[0].id, page[10].id);
        assert_eq!(
            db.wishlist_page_with_reviewed_item(500, "deleted")
                .unwrap()
                .len(),
            500
        );
        let expected = DashboardPurchaseResult::Reused {
            item_id: "old".into(),
            status: "ON_ORDER".into(),
            matched_by: "IDENTITY".into(),
        };
        assert_eq!(
            db.ensure_dashboard_purchase(&item("new")).unwrap(),
            expected
        );
        let rows = db.list_wishlist_items(600).unwrap();
        assert_eq!(rows.len(), 502);
        assert_eq!(rows.iter().find(|r| r.id == "old").unwrap().quantity, 7);
        db.connection()
            .execute(
                "INSERT INTO filament_master_list (id, material, filament_name, color_name)
             VALUES ('catalog', 'PLA', 'Silk', 'Blå')",
                [],
            )
            .unwrap();
        let mut exact = item("exact");
        exact.master_id = Some("catalog".into());
        exact.color_name = "renamed".into();
        db.insert_wishlist_item(&exact).unwrap();
        let mut candidate = item("new");
        candidate.master_id = exact.master_id.clone();
        assert_eq!(
            db.ensure_dashboard_purchase(&candidate).unwrap(),
            DashboardPurchaseResult::Reused {
                item_id: "exact".into(),
                status: "WISHLIST".into(),
                matched_by: "MASTER_ID".into()
            }
        );
    }

    #[test]
    fn concurrent_dashboard_purchases_share_one_open_item() {
        let path = std::env::temp_dir().join(format!(
            "dashboard-purchase-{}.db",
            super::super::database_ids::new_id()
        ));
        let db = FilamentDatabase::open(&path).unwrap();
        db.apply_schema().unwrap();
        let ready = std::sync::Barrier::new(2);
        let path_ref = &path;
        let ready = &ready;
        let results = std::thread::scope(|scope| {
            ["one", "two"]
                .map(|id| {
                    scope.spawn(move || {
                        let other = FilamentDatabase::open(path_ref).unwrap();
                        ready.wait();
                        other.ensure_dashboard_purchase(&item(id)).unwrap()
                    })
                })
                .map(|thread| thread.join().unwrap())
        });
        let rows = db.list_wishlist_items(10).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            results
                .iter()
                .filter(|r| matches!(r, DashboardPurchaseResult::Created { .. }))
                .count(),
            1
        );
        for result in results {
            let id = match result {
                DashboardPurchaseResult::Created { item_id, .. }
                | DashboardPurchaseResult::Reused { item_id, .. } => item_id,
            };
            assert_eq!(id, rows[0].id);
        }
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
