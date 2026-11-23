use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use super::database_result::InventoryResult;
use super::filament_database::FilamentDatabase;
use super::inventory_domain::OwnershipType;
use super::low_stock_policy::LowStockPolicy;
use super::spool_defaults::normalize_spool_status;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStock {
    pub metrics: DashboardStockMetrics,
    pub preview: Vec<DashboardPreviewRow>,
    pub groups: Vec<DashboardPurchaseGroup>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStockMetrics {
    pub total_spools: i64,
    pub active_spools: i64,
    pub placed_active_spools: i64,
    pub on_hand_owned: i64,
    pub on_hand_borrowed_in: i64,
    pub on_hand_in_use: i64,
    pub owned_low_stock: i64,
    pub borrowed_in_low_stock: i64,
    pub healthy_spools: i64,
    pub thresholds: BTreeSet<i64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPreviewRow {
    pub spool_id: String,
    pub vendor: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub remaining_g: i64,
    pub location_label: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardPurchaseGroup {
    pub master_id: String,
    pub vendor: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub lowest_remaining_g: i64,
    pub spool_count: i64,
    pub threshold_g: i64,
}

impl FilamentDatabase {
    pub fn dashboard_stock(&self, policy: &LowStockPolicy) -> InventoryResult<DashboardStock> {
        let mut statement = self.connection().prepare(
            "SELECT s.id, s.status, s.ownership_type, s.location_id,
                    COALESCE(s.remaining_g, s.current_weight_g, s.initial_weight_g, 0),
                    m.id, m.material, m.vendor, m.filament_name, m.color_name, m.hex_color, l.name
             FROM filament_spools s JOIN filament_master_list m ON m.id = s.master_id
             LEFT JOIN inventory_locations l ON l.id = s.location_id WHERE s.deleted_at IS NULL",
        )?;
        let mut stock = DashboardStock::default();
        let mut groups = BTreeMap::new();
        let mut rows = statement.query([])?;
        while let Some(row) = rows.next()? {
            let status = normalize_spool_status(row.get::<_, Option<String>>(1)?.as_deref());
            let metrics = &mut stock.metrics;
            metrics.total_spools += 1;
            if status != "EMPTY" && status != "LOST" {
                metrics.active_spools += 1;
                if row
                    .get::<_, Option<String>>(3)?
                    .is_some_and(|id| !id.trim().is_empty())
                {
                    metrics.placed_active_spools += 1;
                }
            }
            if status != "IN_STOCK" && status != "ASSIGNED" {
                continue;
            }
            let borrowed = OwnershipType::from_raw(row.get::<_, Option<String>>(2)?.as_deref())
                .is_borrowed_in();
            metrics.on_hand_owned += i64::from(!borrowed);
            metrics.on_hand_borrowed_in += i64::from(borrowed);
            metrics.on_hand_in_use += i64::from(status == "ASSIGNED");
            let remaining_g: i64 = row.get(4)?;
            let material: String = row.get(6)?;
            let threshold = policy.threshold_for_material(&material);
            metrics.thresholds.insert(threshold);
            if remaining_g > threshold {
                metrics.healthy_spools += 1;
                continue;
            }
            if remaining_g <= 0 {
                continue;
            }
            metrics.owned_low_stock += i64::from(!borrowed);
            metrics.borrowed_in_low_stock += i64::from(borrowed);
            let master_id: String = row.get(5)?;
            let group = match groups.entry(master_id) {
                std::collections::btree_map::Entry::Occupied(entry) => entry.into_mut(),
                std::collections::btree_map::Entry::Vacant(entry) => {
                    let master_id = entry.key().clone();
                    entry.insert(DashboardPurchaseGroup {
                        master_id,
                        material,
                        vendor: row.get(7)?,
                        filament_name: row.get(8)?,
                        color_name: row.get(9)?,
                        lowest_remaining_g: remaining_g,
                        spool_count: 0,
                        threshold_g: threshold,
                    })
                }
            };
            group.spool_count += 1;
            group.lowest_remaining_g = group.lowest_remaining_g.min(remaining_g);
            let spool_id: String = row.get(0)?;
            let position = stock.preview.partition_point(|p| {
                p.remaining_g < remaining_g
                    || (p.remaining_g == remaining_g
                        && p.spool_id
                            .encode_utf16()
                            .cmp(spool_id.encode_utf16())
                            .is_lt())
            });
            if position < 4 {
                stock.preview.insert(
                    position,
                    DashboardPreviewRow {
                        spool_id,
                        remaining_g,
                        material: group.material.clone(),
                        vendor: group.vendor.clone(),
                        filament_name: group.filament_name.clone(),
                        color_name: group.color_name.clone(),
                        hex_color: row.get(10)?,
                        location_label: row
                            .get::<_, Option<String>>(11)?
                            .map(|label| label.trim().to_owned())
                            .filter(|label| !label.is_empty()),
                    },
                );
                stock.preview.truncate(4);
            }
        }
        stock.groups = groups.into_values().collect();
        Ok(stock)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::filament_database::ManualMasterInput;

    #[test]
    fn ten_thousand_low_spools_keep_one_product_group_and_four_preview_rows() {
        let db = FilamentDatabase::open(":memory:").unwrap();
        db.apply_schema().unwrap();
        let policy = LowStockPolicy::default();
        assert_eq!(
            db.dashboard_stock(&policy).unwrap(),
            DashboardStock::default()
        );
        let master = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Gray",
                hex_color: None,
                product_url: None,
                vendor: Some("Sample"),
                default_weight: Some(1000),
            })
            .unwrap();
        db.connection().execute(
            "WITH RECURSIVE seq(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM seq WHERE n<10000)
             INSERT INTO filament_spools(id,master_id,status,ownership_type,initial_weight_g,remaining_g)
             SELECT printf('roll-%05d',n), ?1, 'IN_USE', 'BORROWED_IN', 200, NULL FROM seq",
            [master]).unwrap();
        let stock = db.dashboard_stock(&policy).unwrap();
        assert_eq!(stock.metrics.on_hand_in_use, 10000);
        assert_eq!(stock.metrics.borrowed_in_low_stock, 10000);
        assert_eq!(stock.groups.len(), 1);
        assert_eq!(stock.groups[0].spool_count, 10000);
        assert_eq!(
            stock
                .preview
                .iter()
                .map(|p| p.spool_id.as_str())
                .collect::<Vec<_>>(),
            ["roll-00001", "roll-00002", "roll-00003", "roll-00004"]
        );
        assert!(serde_json::to_vec(&stock).unwrap().len() < 2000);
        db.connection()
            .execute_batch(
                "UPDATE filament_spools SET status='LOANED_OUT' WHERE id='roll-00001';
            UPDATE filament_spools SET status='EMPTY' WHERE id='roll-00002';
            UPDATE filament_spools SET status='LOST' WHERE id='roll-00003';
            UPDATE filament_spools SET deleted_at='now' WHERE id='roll-00004';
            UPDATE filament_spools SET remaining_g=0 WHERE id='roll-00005';
            UPDATE filament_spools SET remaining_g=201 WHERE id='roll-00006';",
            )
            .unwrap();
        let stock = db.dashboard_stock(&policy).unwrap();
        assert_eq!(stock.metrics.total_spools, 9999);
        assert_eq!(stock.metrics.active_spools, 9997);
        assert_eq!(stock.metrics.on_hand_borrowed_in, 9996);
        assert_eq!(stock.metrics.healthy_spools, 1);
        assert_eq!(stock.groups[0].spool_count, 9994);
    }
}
