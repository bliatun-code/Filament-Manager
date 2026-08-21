use super::database_core::FilamentDatabase;
use super::database_result::InventoryResult;
use super::database_wishlist::{
    delete_wishlist_item as delete_wishlist_item_row,
    insert_wishlist_item as insert_wishlist_item_row,
    list_wishlist_items as list_wishlist_item_rows,
    receive_wishlist_item as receive_wishlist_item_rows,
    update_wishlist_item_status as update_wishlist_item_status_row,
};
use super::database_wishlist_models::{WishlistItemRow, WishlistReceiptResult};
use super::purchase_receipt_metadata::PurchaseReceiptMetadata;

impl FilamentDatabase {
    pub fn list_wishlist_items(&self, limit: i64) -> InventoryResult<Vec<WishlistItemRow>> {
        list_wishlist_item_rows(self.connection(), limit)
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
    ) -> InventoryResult<WishlistReceiptResult> {
        receive_wishlist_item_rows(self.connection(), item_id, quantity, purchase_metadata)
    }

    pub fn delete_wishlist_item(&self, item_id: &str) -> InventoryResult<()> {
        delete_wishlist_item_row(self.connection(), item_id)
    }
}
