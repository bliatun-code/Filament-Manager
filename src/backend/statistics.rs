use std::path::Path;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InventoryOverview {
    pub total_spools: i64,
    pub total_owned_spools: i64,
    pub total_borrowed_in_spools: i64,
    pub in_use: i64,
    pub owned_in_use: i64,
    pub borrowed_in_in_use: i64,
    pub low_stock: i64,
    pub owned_low_stock: i64,
    pub borrowed_in_low_stock: i64,
    pub total_consumption_30d: i64,
    pub owned_consumption_30d: i64,
    pub borrowed_in_consumption_30d: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MaterialUsageRow {
    pub material: String,
    pub used_grams: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FilamentConsumptionRow {
    pub printer_id: Option<String>,
    pub printer_name: Option<String>,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub hex_color: Option<String>,
    pub vendor: String,
    pub ownership_type: String,
    pub owner_name: Option<String>,
    pub used_grams: i64,
    pub jobs: i64,
}

pub struct StatisticsEngine {
    conn: Connection,
}

impl StatisticsEngine {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self { conn })
    }

    pub fn inventory_overview(&self) -> Result<InventoryOverview, rusqlite::Error> {
        let (
            total_spools,
            total_owned_spools,
            total_borrowed_in_spools,
            in_use,
            owned_in_use,
            borrowed_in_in_use,
            low_stock,
            owned_low_stock,
            borrowed_in_low_stock,
        ): (i64, i64, i64, i64, i64, i64, i64, i64, i64) = self.conn.query_row(
            "SELECT
                COUNT(*) AS total_spools,
                COALESCE(SUM(CASE
                    WHEN COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'OWNED'
                    THEN 1 ELSE 0
                END), 0) AS total_owned_spools,
                COALESCE(SUM(CASE
                    WHEN COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                    THEN 1 ELSE 0
                END), 0) AS total_borrowed_in_spools,
                COALESCE(SUM(CASE WHEN status = 'IN_USE' THEN 1 ELSE 0 END), 0) AS in_use,
                COALESCE(SUM(CASE
                    WHEN status = 'IN_USE'
                     AND COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'OWNED'
                    THEN 1 ELSE 0
                END), 0) AS owned_in_use,
                COALESCE(SUM(CASE
                    WHEN status = 'IN_USE'
                     AND COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                    THEN 1 ELSE 0
                END), 0) AS borrowed_in_in_use,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= 200
                     AND status NOT IN ('EMPTY', 'LOST')
                    THEN 1 ELSE 0
                END), 0) AS low_stock,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= 200
                     AND status NOT IN ('EMPTY', 'LOST')
                     AND COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'OWNED'
                    THEN 1 ELSE 0
                END), 0) AS owned_low_stock,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= 200
                     AND status NOT IN ('EMPTY', 'LOST')
                     AND COALESCE(NULLIF(ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                    THEN 1 ELSE 0
                END), 0) AS borrowed_in_low_stock
             FROM filament_spools
             WHERE deleted_at IS NULL",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                ))
            },
        )?;
        let (total_consumption_30d, owned_consumption_30d, borrowed_in_consumption_30d): (
            i64,
            i64,
            i64,
        ) = self.conn.query_row(
            "SELECT
                COALESCE(SUM(material_used_g), 0) AS total_consumption_30d,
                COALESCE(SUM(CASE
                    WHEN COALESCE(NULLIF(s.ownership_type, ''), 'OWNED') = 'OWNED'
                      OR s.id IS NULL
                    THEN p.material_used_g ELSE 0
                END), 0) AS owned_consumption_30d,
                COALESCE(SUM(CASE
                    WHEN COALESCE(NULLIF(s.ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                    THEN p.material_used_g ELSE 0
                END), 0) AS borrowed_in_consumption_30d
             FROM print_jobs p
             LEFT JOIN filament_spools s ON s.id = p.spool_id
             WHERE p.started_at >= datetime('now', '-30 days')",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        Ok(InventoryOverview {
            total_spools,
            total_owned_spools,
            total_borrowed_in_spools,
            in_use,
            owned_in_use,
            borrowed_in_in_use,
            low_stock,
            owned_low_stock,
            borrowed_in_low_stock,
            total_consumption_30d,
            owned_consumption_30d,
            borrowed_in_consumption_30d,
        })
    }

    pub fn top_materials(&self, limit: i64) -> Result<Vec<MaterialUsageRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT m.material, COALESCE(SUM(p.material_used_g), 0) AS used
             FROM print_jobs p
             LEFT JOIN filament_spools s ON p.spool_id = s.id
             LEFT JOIN filament_master_list m ON s.master_id = m.id
             GROUP BY m.material
             ORDER BY used DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![limit], |row| {
            Ok(MaterialUsageRow {
                material: row.get(0)?,
                used_grams: row.get(1)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }

    pub fn filament_consumption(
        &self,
        limit: i64,
        printer_id: Option<&str>,
    ) -> Result<Vec<FilamentConsumptionRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT
                p.printer_id,
                pr.name AS printer_name,
                COALESCE(NULLIF(m.material, ''), 'Unknown') AS material,
                COALESCE(NULLIF(m.filament_name, ''), 'Unknown') AS filament_name,
                COALESCE(NULLIF(m.color_name, ''), 'Unknown') AS color_name,
                m.hex_color,
                COALESCE(NULLIF(m.vendor, ''), 'Unknown') AS vendor,
                COALESCE(NULLIF(s.ownership_type, ''), 'OWNED') AS ownership_type,
                NULLIF(CASE
                    WHEN COALESCE(NULLIF(s.ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                    THEN COALESCE(NULLIF(s.owner_name, ''), '')
                    ELSE ''
                END, '') AS owner_name,
                COALESCE(SUM(p.material_used_g), 0) AS used_grams,
                COUNT(*) AS jobs
             FROM print_jobs p
             LEFT JOIN printers pr ON pr.id = p.printer_id
             LEFT JOIN filament_spools s ON p.spool_id = s.id
             LEFT JOIN filament_master_list m ON s.master_id = m.id
             WHERE (?1 IS NULL OR p.printer_id = ?1)
             GROUP BY
               p.printer_id,
               pr.name,
               m.material,
               m.filament_name,
               m.color_name,
               m.hex_color,
               m.vendor,
               COALESCE(NULLIF(s.ownership_type, ''), 'OWNED'),
               CASE
                   WHEN COALESCE(NULLIF(s.ownership_type, ''), 'OWNED') = 'BORROWED_IN'
                   THEN COALESCE(NULLIF(s.owner_name, ''), '')
                   ELSE ''
               END
             HAVING COALESCE(SUM(p.material_used_g), 0) > 0
             ORDER BY used_grams DESC
             LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![printer_id, limit], |row| {
            Ok(FilamentConsumptionRow {
                printer_id: row.get(0)?,
                printer_name: row.get(1)?,
                material: row.get(2)?,
                filament_name: row.get(3)?,
                color_name: row.get(4)?,
                hex_color: row.get(5)?,
                vendor: row.get(6)?,
                ownership_type: row.get(7)?,
                owner_name: row.get(8)?,
                used_grams: row.get(9)?,
                jobs: row.get(10)?,
            })
        })?;

        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
}

#[cfg(test)]
mod tests {
    use super::StatisticsEngine;
    use crate::backend::filament_database::{FilamentDatabase, SpoolRow};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("filament-manager-stats-{test_name}-{nanos}.db"))
    }

    #[test]
    fn inventory_overview_splits_owned_and_borrowed_in_metrics() {
        let db_path = temp_db_path("ownership-split");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(
                    "PLA",
                    "Basic",
                    "Red",
                    Some("#ff5544"),
                    None,
                    Some("Generic"),
                    Some(1000),
                )
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "IN_STOCK".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(650),
                remaining_g: Some(650),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_2".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(180),
                remaining_g: Some(180),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "borrowed_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "IN_USE".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Alice".to_string()),
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(900),
                current_weight_g: Some(140),
                remaining_g: Some(140),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "empty_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "EMPTY".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(0),
                remaining_g: Some(0),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "lost_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "LOST".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(120),
                remaining_g: Some(120),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "owned_2", Some("Owned job"), 125, true)
                .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "borrowed_1", Some("Borrowed job"), 55, true)
                .map_err(|error| error.to_string())?;

            let stats = StatisticsEngine::open(&db_path).map_err(|error| error.to_string())?;
            let overview = stats
                .inventory_overview()
                .map_err(|error| error.to_string())?;

            assert_eq!(overview.total_spools, 5);
            assert_eq!(overview.total_owned_spools, 4);
            assert_eq!(overview.total_borrowed_in_spools, 1);
            assert_eq!(overview.in_use, 2);
            assert_eq!(overview.owned_in_use, 1);
            assert_eq!(overview.borrowed_in_in_use, 1);
            assert_eq!(overview.low_stock, 2);
            assert_eq!(overview.owned_low_stock, 1);
            assert_eq!(overview.borrowed_in_low_stock, 1);
            assert_eq!(overview.total_consumption_30d, 180);
            assert_eq!(overview.owned_consumption_30d, 125);
            assert_eq!(overview.borrowed_in_consumption_30d, 55);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "inventory_overview_splits_owned_and_borrowed_in_metrics test failed: {message}"
            );
        }
    }

    #[test]
    fn filament_consumption_keeps_owned_and_borrowed_in_rows_separate() {
        let db_path = temp_db_path("consumption-ownership-split");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(
                    "PLA",
                    "Basic",
                    "Red",
                    Some("#ff5544"),
                    None,
                    Some("Generic"),
                    Some(1000),
                )
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(640),
                remaining_g: Some(640),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "borrowed_1".to_string(),
                master_id,
                qr_code: None,
                status: "IN_USE".to_string(),
                ownership_type: "BORROWED_IN".to_string(),
                owner_name: Some("Alice".to_string()),
                owner_contact: Some("alice@example.com".to_string()),
                ownership_note: Some("Prototype batch".to_string()),
                initial_weight_g: Some(900),
                current_weight_g: Some(520),
                remaining_g: Some(520),
                spool_tare_weight_g: None,
                location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "owned_1", Some("Owned job"), 120, true)
                .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "borrowed_1", Some("Borrowed job"), 65, true)
                .map_err(|error| error.to_string())?;

            let stats = StatisticsEngine::open(&db_path).map_err(|error| error.to_string())?;
            let rows = stats
                .filament_consumption(20, Some("printer_1"))
                .map_err(|error| error.to_string())?;

            assert_eq!(rows.len(), 2);

            let owned = rows
                .iter()
                .find(|row| row.ownership_type == "OWNED")
                .ok_or_else(|| "missing owned filament consumption row".to_string())?;
            assert_eq!(owned.owner_name, None);
            assert_eq!(owned.used_grams, 120);
            assert_eq!(owned.jobs, 1);

            let borrowed = rows
                .iter()
                .find(|row| row.ownership_type == "BORROWED_IN")
                .ok_or_else(|| "missing borrowed-in filament consumption row".to_string())?;
            assert_eq!(borrowed.owner_name.as_deref(), Some("Alice"));
            assert_eq!(borrowed.used_grams, 65);
            assert_eq!(borrowed.jobs, 1);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "filament_consumption_keeps_owned_and_borrowed_in_rows_separate test failed: {message}"
            );
        }
    }
}
