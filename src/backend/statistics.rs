use std::path::Path;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use super::inventory_domain::LOW_STOCK_THRESHOLD_G;
use super::spool_defaults::{
    SPOOL_OWNERSHIP_SELECT_SQL, SPOOL_OWNERSHIP_SELECT_SQL_S, SPOOL_STATUS_ASSIGNED_PREDICATE_SQL,
    SPOOL_STATUS_ON_HAND_PREDICATE_SQL,
};
use super::{database_result::InventoryResult, filament_database::FilamentDatabase};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
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
    #[serde(default)]
    pub consumption_12m_available: bool,
    #[serde(default)]
    pub total_consumption_12m: i64,
    #[serde(default)]
    pub consumption_12m: Vec<MonthlyConsumptionPoint>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct MonthlyConsumptionPoint {
    pub month: String,
    pub used_grams: i64,
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
        inventory_overview_from_connection(&self.conn)
    }

    pub fn top_materials(&self, limit: i64) -> Result<Vec<MaterialUsageRow>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "WITH usage_rows AS (
                SELECT p.spool_id, p.material_used_g AS used_g
                FROM print_jobs p
                UNION ALL
                SELECT us.spool_id, us.used_g
                FROM printer_live_usage_session_spools us
                JOIN printer_live_usage_sessions u ON u.id = us.session_id
                WHERE us.used_g > 0
             )
             SELECT m.material, COALESCE(SUM(u.used_g), 0) AS used
             FROM usage_rows u
             LEFT JOIN filament_spools s ON u.spool_id = s.id
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
        let mut stmt = self.conn.prepare(&format!(
            "WITH usage_rows AS (
                SELECT p.id AS usage_job_id,
                       p.printer_id,
                       p.spool_id,
                       p.material_used_g AS used_g
                FROM print_jobs p
                UNION ALL
                SELECT u.id AS usage_job_id,
                       u.printer_id,
                       us.spool_id,
                       us.used_g
                FROM printer_live_usage_session_spools us
                JOIN printer_live_usage_sessions u ON u.id = us.session_id
                WHERE us.used_g > 0
             )
             SELECT
                u.printer_id,
                pr.name AS printer_name,
                COALESCE(NULLIF(m.material, ''), 'Unknown') AS material,
                COALESCE(NULLIF(m.filament_name, ''), 'Unknown') AS filament_name,
                COALESCE(NULLIF(m.color_name, ''), 'Unknown') AS color_name,
                m.hex_color,
                COALESCE(NULLIF(m.vendor, ''), 'Unknown') AS vendor,
                {SPOOL_OWNERSHIP_SELECT_SQL_S} AS ownership_type,
                NULLIF(CASE
                    WHEN {SPOOL_OWNERSHIP_SELECT_SQL_S} = 'BORROWED_IN'
                    THEN COALESCE(NULLIF(s.owner_name, ''), '')
                    ELSE ''
                END, '') AS owner_name,
                COALESCE(SUM(u.used_g), 0) AS used_grams,
                COUNT(DISTINCT u.usage_job_id) AS jobs
             FROM usage_rows u
             LEFT JOIN printers pr ON pr.id = u.printer_id
             LEFT JOIN filament_spools s ON u.spool_id = s.id
             LEFT JOIN filament_master_list m ON s.master_id = m.id
             WHERE (?1 IS NULL OR u.printer_id = ?1)
             GROUP BY
               u.printer_id,
               pr.name,
               m.material,
               m.filament_name,
               m.color_name,
               m.hex_color,
               m.vendor,
               {SPOOL_OWNERSHIP_SELECT_SQL_S},
               CASE
                   WHEN {SPOOL_OWNERSHIP_SELECT_SQL_S} = 'BORROWED_IN'
                   THEN COALESCE(NULLIF(s.owner_name, ''), '')
                   ELSE ''
               END
             HAVING COALESCE(SUM(u.used_g), 0) > 0
             ORDER BY used_grams DESC
             LIMIT ?2",
        ))?;

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

impl FilamentDatabase {
    pub fn inventory_overview(&self) -> InventoryResult<InventoryOverview> {
        inventory_overview_from_connection(self.connection()).map_err(Into::into)
    }
}

fn inventory_overview_from_connection(
    connection: &Connection,
) -> Result<InventoryOverview, rusqlite::Error> {
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
        ): (i64, i64, i64, i64, i64, i64, i64, i64, i64) = connection.query_row(
            &format!(
                "SELECT
                COUNT(*) AS total_spools,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_OWNERSHIP_SELECT_SQL} = 'OWNED'
                     AND {SPOOL_STATUS_ON_HAND_PREDICATE_SQL}
                    THEN 1 ELSE 0
                END), 0) AS total_owned_spools,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_OWNERSHIP_SELECT_SQL} = 'BORROWED_IN'
                     AND {SPOOL_STATUS_ON_HAND_PREDICATE_SQL}
                    THEN 1 ELSE 0
                END), 0) AS total_borrowed_in_spools,
                COALESCE(SUM(CASE WHEN {SPOOL_STATUS_ASSIGNED_PREDICATE_SQL} THEN 1 ELSE 0 END), 0) AS in_use,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_STATUS_ASSIGNED_PREDICATE_SQL}
                     AND {SPOOL_OWNERSHIP_SELECT_SQL} = 'OWNED'
                    THEN 1 ELSE 0
                END), 0) AS owned_in_use,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_STATUS_ASSIGNED_PREDICATE_SQL}
                     AND {SPOOL_OWNERSHIP_SELECT_SQL} = 'BORROWED_IN'
                    THEN 1 ELSE 0
                END), 0) AS borrowed_in_in_use,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= ?1
                     AND {SPOOL_STATUS_ON_HAND_PREDICATE_SQL}
                    THEN 1 ELSE 0
                END), 0) AS low_stock,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= ?1
                     AND {SPOOL_STATUS_ON_HAND_PREDICATE_SQL}
                     AND {SPOOL_OWNERSHIP_SELECT_SQL} = 'OWNED'
                    THEN 1 ELSE 0
                END), 0) AS owned_low_stock,
                COALESCE(SUM(CASE
                    WHEN remaining_g IS NOT NULL
                     AND remaining_g > 0
                     AND remaining_g <= ?1
                     AND {SPOOL_STATUS_ON_HAND_PREDICATE_SQL}
                     AND {SPOOL_OWNERSHIP_SELECT_SQL} = 'BORROWED_IN'
                    THEN 1 ELSE 0
                END), 0) AS borrowed_in_low_stock
             FROM filament_spools
             WHERE deleted_at IS NULL"
            ),
            params![LOW_STOCK_THRESHOLD_G],
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
    ) = connection.query_row(
        &format!(
            "WITH usage_rows AS (
                SELECT p.spool_id, p.started_at AS used_at, p.material_used_g AS used_g
                FROM print_jobs p
                UNION ALL
                SELECT us.spool_id,
                       COALESCE(u.finished_at, u.last_seen_at, u.started_at) AS used_at,
                       us.used_g
                FROM printer_live_usage_session_spools us
                JOIN printer_live_usage_sessions u ON u.id = us.session_id
                WHERE us.used_g > 0
             )
             SELECT
                COALESCE(SUM(used_g), 0) AS total_consumption_30d,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_OWNERSHIP_SELECT_SQL_S} = 'OWNED'
                      OR s.id IS NULL
                    THEN u.used_g ELSE 0
                END), 0) AS owned_consumption_30d,
                COALESCE(SUM(CASE
                    WHEN {SPOOL_OWNERSHIP_SELECT_SQL_S} = 'BORROWED_IN'
                    THEN u.used_g ELSE 0
                END), 0) AS borrowed_in_consumption_30d
             FROM usage_rows u
             LEFT JOIN filament_spools s ON s.id = u.spool_id
             WHERE datetime(u.used_at) >= datetime('now', '-30 days')"
        ),
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let consumption_12m = monthly_consumption_12m_from_connection(connection)?;
    let total_consumption_12m = consumption_12m.iter().map(|point| point.used_grams).sum();

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
        consumption_12m_available: true,
        total_consumption_12m,
        consumption_12m,
    })
}

fn monthly_consumption_12m_from_connection(
    connection: &Connection,
) -> Result<Vec<MonthlyConsumptionPoint>, rusqlite::Error> {
    let mut stmt = connection.prepare(
        "WITH RECURSIVE months(month_start, month) AS (
            SELECT date('now', 'localtime', 'start of month', '-11 months'),
                   strftime('%Y-%m', date('now', 'localtime', 'start of month', '-11 months'))
            UNION ALL
            SELECT date(month_start, '+1 month'),
                   strftime('%Y-%m', date(month_start, '+1 month'))
            FROM months
            WHERE month_start < date('now', 'localtime', 'start of month')
         ),
         usage_rows AS (
            SELECT p.started_at AS used_at, p.material_used_g AS used_g
            FROM print_jobs p
            UNION ALL
            SELECT COALESCE(u.finished_at, u.last_seen_at, u.started_at) AS used_at,
                   us.used_g
            FROM printer_live_usage_session_spools us
            JOIN printer_live_usage_sessions u ON u.id = us.session_id
            WHERE us.used_g > 0
         ),
         monthly_usage AS (
            SELECT strftime('%Y-%m', datetime(used_at, 'localtime')) AS month,
                   COALESCE(SUM(used_g), 0) AS used_grams
            FROM usage_rows
            WHERE datetime(used_at, 'localtime') >=
                      datetime('now', 'localtime', 'start of month', '-11 months')
              AND datetime(used_at, 'localtime') <
                      datetime('now', 'localtime', 'start of month', '+1 month')
            GROUP BY strftime('%Y-%m', datetime(used_at, 'localtime'))
         )
         SELECT months.month, COALESCE(monthly_usage.used_grams, 0)
         FROM months
         LEFT JOIN monthly_usage ON monthly_usage.month = months.month
         ORDER BY months.month_start ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(MonthlyConsumptionPoint {
            month: row.get(0)?,
            used_grams: row.get(1)?,
        })
    })?;

    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::{InventoryOverview, StatisticsEngine};
    use crate::backend::database_printer_usage_sessions::{
        LiveUsageDeltaInput, LiveUsageSessionInput,
    };
    use crate::backend::filament_database::{FilamentDatabase, ManualMasterInput, SpoolRow};
    use crate::backend::inventory_domain::LOW_STOCK_THRESHOLD_G;
    use rusqlite::params;
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
    fn inventory_overview_deserializes_legacy_payload_without_12_month_fields() {
        let overview: InventoryOverview = serde_json::from_value(serde_json::json!({
            "total_spools": 3,
            "total_owned_spools": 2,
            "total_borrowed_in_spools": 1,
            "in_use": 1,
            "owned_in_use": 1,
            "borrowed_in_in_use": 0,
            "low_stock": 1,
            "owned_low_stock": 1,
            "borrowed_in_low_stock": 0,
            "total_consumption_30d": 75,
            "owned_consumption_30d": 75,
            "borrowed_in_consumption_30d": 0
        }))
        .expect("legacy inventory overview should deserialize");

        assert_eq!(overview.total_consumption_12m, 0);
        assert!(overview.consumption_12m.is_empty());
        assert!(!overview.consumption_12m_available);
    }

    #[test]
    fn inventory_overview_splits_owned_and_borrowed_in_metrics() {
        let db_path = temp_db_path("ownership-split");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
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
                home_location_id: None,
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
                rfid_tag: None,
                rfid_observed_at: None,
                status: "in-use".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(180),
                remaining_g: Some(180),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
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
                rfid_tag: None,
                rfid_observed_at: None,
                status: "assigned".to_string(),
                ownership_type: "borrowed-in".to_string(),
                owner_name: Some("Alice".to_string()),
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(900),
                current_weight_g: Some(140),
                remaining_g: Some(140),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
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
                rfid_tag: None,
                rfid_observed_at: None,
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
                home_location_id: None,
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
                rfid_tag: None,
                rfid_observed_at: None,
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
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "loaned_out_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "BORROWED".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(190),
                remaining_g: Some(190),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
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

            assert_eq!(overview.total_spools, 6);
            assert_eq!(overview.total_owned_spools, 2);
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
    fn inventory_overview_applies_low_stock_boundaries_without_truncating_count() {
        let db_path = temp_db_path("low-stock-boundaries");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Black",
                    hex_color: Some("#000000"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.connection()
                .execute(
                    "INSERT INTO filament_spools (
                        id, master_id, status, ownership_type,
                        initial_weight_g, current_weight_g, remaining_g
                     ) VALUES ('boundary_spool', ?1, 'IN_STOCK', 'OWNED', 1000, 0, 0)",
                    params![&master_id],
                )
                .map_err(|error| error.to_string())?;

            assert_eq!(LOW_STOCK_THRESHOLD_G, 200);
            for (remaining_g, expected_low_stock) in [(0, 0), (1, 1), (199, 1), (200, 1), (201, 0)]
            {
                db.connection()
                    .execute(
                        "UPDATE filament_spools
                         SET current_weight_g = ?1, remaining_g = ?1
                         WHERE id = 'boundary_spool'",
                        params![remaining_g],
                    )
                    .map_err(|error| error.to_string())?;

                let overview = db.inventory_overview().map_err(|error| error.to_string())?;
                assert_eq!(
                    overview.low_stock, expected_low_stock,
                    "unexpected low-stock result for {remaining_g} g"
                );
            }

            for index in 0..6 {
                db.connection()
                    .execute(
                        "INSERT INTO filament_spools (
                            id, master_id, status, ownership_type,
                            initial_weight_g, current_weight_g, remaining_g
                         ) VALUES (?1, ?2, 'IN_STOCK', 'OWNED', 1000, 100, 100)",
                        params![format!("low_stock_{index}"), &master_id],
                    )
                    .map_err(|error| error.to_string())?;
            }

            let overview = db.inventory_overview().map_err(|error| error.to_string())?;
            assert_eq!(overview.low_stock, 6);
            assert_eq!(overview.owned_low_stock, 6);
            assert_eq!(overview.borrowed_in_low_stock, 0);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "inventory_overview_applies_low_stock_boundaries_without_truncating_count failed: {message}"
            );
        }
    }

    #[test]
    fn inventory_overview_builds_chronological_12_month_consumption_with_zero_months() {
        let db_path = temp_db_path("12-month-consumption");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(650),
                remaining_g: Some(650),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;

            db.insert_print_job("printer_1", "owned_1", Some("Current month"), 25, true)
                .map_err(|error| error.to_string())?;
            db.insert_print_job(
                "printer_1",
                "owned_1",
                Some("First included month"),
                100,
                true,
            )
            .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "owned_1", Some("Outside window"), 999, true)
                .map_err(|error| error.to_string())?;
            db.connection()
                .execute_batch(
                    "UPDATE print_jobs
                     SET started_at = datetime('now', 'localtime', 'start of month',
                                               '+12 hours', 'utc')
                     WHERE job_name = 'Current month';
                     UPDATE print_jobs
                     SET started_at = datetime('now', 'localtime', 'start of month',
                                               '-11 months', '+12 hours', 'utc')
                     WHERE job_name = 'First included month';
                     UPDATE print_jobs
                     SET started_at = datetime('now', 'localtime', 'start of month',
                                               '-12 months', '+12 hours', 'utc')
                     WHERE job_name = 'Outside window';",
                )
                .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:middle-month",
                job_name: Some("Middle live job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 40,
                observed_at: Some("2026-05-17T20:30:00Z"),
                defer_initial_delta: false,
            })
            .map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "UPDATE printer_live_usage_sessions
                     SET finished_at = strftime(
                                                '%Y-%m-%dT%H:%M:%SZ',
                                                datetime('now', 'localtime', 'start of month',
                                                         '-5 months', '+12 hours', 'utc')),
                         last_seen_at = datetime('now'),
                         status = 'COMPLETED',
                         success = 1
                     WHERE session_key = 'subtask:middle-month'",
                    [],
                )
                .map_err(|error| error.to_string())?;

            let expected_first_month: String = db
                .connection()
                .query_row(
                    "SELECT strftime('%Y-%m', date('now', 'localtime', 'start of month', '-11 months'))",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let expected_middle_month: String = db
                .connection()
                .query_row(
                    "SELECT strftime('%Y-%m', date('now', 'localtime', 'start of month', '-5 months'))",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let expected_current_month: String = db
                .connection()
                .query_row(
                    "SELECT strftime('%Y-%m', date('now', 'localtime', 'start of month'))",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;

            let overview = db.inventory_overview().map_err(|error| error.to_string())?;

            assert_eq!(overview.consumption_12m.len(), 12);
            assert!(overview.consumption_12m_available);
            assert_eq!(overview.total_consumption_12m, 165);
            assert_eq!(overview.consumption_12m[0].month, expected_first_month);
            assert_eq!(overview.consumption_12m[0].used_grams, 100);
            assert_eq!(overview.consumption_12m[6].month, expected_middle_month);
            assert_eq!(overview.consumption_12m[6].used_grams, 40);
            assert_eq!(overview.consumption_12m[11].month, expected_current_month);
            assert_eq!(overview.consumption_12m[11].used_grams, 25);
            assert_eq!(
                overview
                    .consumption_12m
                    .iter()
                    .filter(|point| point.used_grams == 0)
                    .count(),
                9
            );

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "inventory_overview_builds_chronological_12_month_consumption_with_zero_months failed: {message}"
            );
        }
    }

    #[test]
    fn inventory_overview_normalizes_live_usage_timestamps_for_30_day_cutoff() {
        let db_path = temp_db_path("live-usage-cutoff-normalized");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(650),
                remaining_g: Some(650),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:included-live",
                job_name: Some("Included live job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 40,
                observed_at: Some("2026-05-17T20:30:00Z"),
                defer_initial_delta: false,
            })
            .map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "UPDATE printer_live_usage_sessions
                     SET finished_at = datetime('now', '-1 day'),
                         last_seen_at = datetime('now', '-1 day'),
                         status = 'COMPLETED',
                         success = 1
                     WHERE session_key = 'subtask:included-live'",
                    [],
                )
                .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:cutoff-live",
                job_name: Some("Cutoff live job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 90,
                observed_at: Some("2026-05-17T20:30:00Z"),
                defer_initial_delta: false,
            })
            .map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "UPDATE printer_live_usage_sessions
                     SET finished_at = strftime('%Y-%m-%dT00:00:00Z', datetime('now', '-30 days')),
                         last_seen_at = strftime('%Y-%m-%dT00:00:00Z', datetime('now', '-30 days')),
                         status = 'COMPLETED',
                         success = 1
                     WHERE session_key = 'subtask:cutoff-live'",
                    [],
                )
                .map_err(|error| error.to_string())?;

            let stats = StatisticsEngine::open(&db_path).map_err(|error| error.to_string())?;
            let overview = stats
                .inventory_overview()
                .map_err(|error| error.to_string())?;

            assert_eq!(overview.total_consumption_30d, 40);
            assert_eq!(overview.owned_consumption_30d, 40);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "inventory_overview_normalizes_live_usage_timestamps_for_30_day_cutoff failed: {message}"
            );
        }
    }

    #[test]
    fn printer_overview_normalizes_manual_and_live_timestamps_before_selecting_latest_job() {
        let db_path = temp_db_path("printer-last-job-normalized");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(650),
                remaining_g: Some(650),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;
            db.insert_print_job("printer_1", "owned_1", Some("Manual latest"), 50, true)
                .map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "UPDATE print_jobs
                     SET started_at = datetime('now', '-5 minutes'),
                         ended_at = datetime('now')
                     WHERE job_name = 'Manual latest'",
                    [],
                )
                .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:old-live",
                job_name: Some("Older live job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 20,
                observed_at: Some("2026-05-17T20:30:00Z"),
                defer_initial_delta: false,
            })
            .map_err(|error| error.to_string())?;
            db.connection()
                .execute(
                    "UPDATE printer_live_usage_sessions
                     SET finished_at = strftime('%Y-%m-%dT00:00:00Z', datetime('now')),
                         last_seen_at = strftime('%Y-%m-%dT00:00:00Z', datetime('now')),
                         status = 'COMPLETED',
                         success = 1
                     WHERE session_key = 'subtask:old-live'",
                    [],
                )
                .map_err(|error| error.to_string())?;

            let manual_ended_at: String = db
                .connection()
                .query_row(
                    "SELECT ended_at FROM print_jobs WHERE job_name = 'Manual latest'",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let overview = db
                .list_printer_overview()
                .map_err(|error| error.to_string())?;

            assert_eq!(overview[0].usage.total_jobs, 2);
            assert_eq!(
                overview[0].usage.last_job_at.as_deref(),
                Some(manual_ended_at.as_str())
            );

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "printer_overview_normalizes_manual_and_live_timestamps_before_selecting_latest_job failed: {message}"
            );
        }
    }

    #[test]
    fn printer_overview_counts_only_live_sessions_with_recorded_spool_usage() {
        let db_path = temp_db_path("printer-live-jobs-with-usage-only");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(650),
                remaining_g: Some(650),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;

            db.upsert_printer_with_ams("printer_1", "P1S", "P1S", 1, 4)
                .map_err(|error| error.to_string())?;
            db.touch_live_usage_session(LiveUsageSessionInput {
                printer_id: "printer_1",
                session_key: "subtask:status-only",
                job_name: Some("Status-only carried signal"),
                print_type: Some("cloud"),
                observed_at: Some("2026-05-27T21:41:23Z"),
            })
            .map_err(|error| error.to_string())?;
            db.finish_live_usage_session(
                "printer_1",
                "subtask:status-only",
                Some("2026-05-27T21:41:50Z"),
                true,
            )
            .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:deferred-zero",
                job_name: Some("Deferred warmup signal"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 20,
                observed_at: Some("2026-05-27T21:42:16Z"),
                defer_initial_delta: true,
            })
            .map_err(|error| error.to_string())?;
            db.finish_live_usage_session(
                "printer_1",
                "subtask:deferred-zero",
                Some("2026-05-27T21:42:41Z"),
                true,
            )
            .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:real-live-job",
                job_name: Some("Real live job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 42,
                observed_at: Some("2026-05-27T21:45:00Z"),
                defer_initial_delta: false,
            })
            .map_err(|error| error.to_string())?;
            db.finish_live_usage_session(
                "printer_1",
                "subtask:real-live-job",
                Some("2026-05-27T21:55:00Z"),
                true,
            )
            .map_err(|error| error.to_string())?;

            let overview = db
                .list_printer_overview()
                .map_err(|error| error.to_string())?;

            assert_eq!(overview[0].usage.total_jobs, 1);
            assert_eq!(overview[0].usage.successful_jobs, 1);
            assert_eq!(overview[0].usage.failed_jobs, 0);
            assert_eq!(overview[0].usage.total_used_g, 42);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "printer_overview_counts_only_live_sessions_with_recorded_spool_usage failed: {message}"
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
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Basic",
                    color_name: "Red",
                    hex_color: Some("#ff5544"),
                    product_url: None,
                    vendor: Some("Generic"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;

            db.insert_spool(&SpoolRow {
                id: "owned_1".to_string(),
                master_id: master_id.clone(),
                qr_code: None,
                rfid_tag: None,
                rfid_observed_at: None,
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
                home_location_id: None,
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
                rfid_tag: None,
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "borrowed-in".to_string(),
                owner_name: Some("Alice".to_string()),
                owner_contact: Some("alice@example.com".to_string()),
                ownership_note: Some("Prototype batch".to_string()),
                initial_weight_g: Some(900),
                current_weight_g: Some(520),
                remaining_g: Some(520),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
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
            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:live-owned",
                job_name: Some("Live owned job"),
                print_type: Some("cloud"),
                spool_id: "owned_1",
                used_grams: 30,
                observed_at: Some("2026-05-17T20:30:00Z"),
                defer_initial_delta: false,
            })
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
            assert_eq!(owned.used_grams, 150);
            assert_eq!(owned.jobs, 2);

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

    #[test]
    fn live_usage_can_defer_first_warmup_delta_until_session_has_a_baseline() {
        let db_path = temp_db_path("live-usage-warmup-baseline");

        let result = (|| -> Result<(), String> {
            let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
            db.apply_schema().map_err(|error| error.to_string())?;

            let master_id = db
                .upsert_manual_master(ManualMasterInput {
                    material: "PLA",
                    filament_name: "Matte",
                    color_name: "Black",
                    hex_color: Some("#111111"),
                    product_url: None,
                    vendor: Some("Bambu"),
                    default_weight: Some(1000),
                })
                .map_err(|error| error.to_string())?;
            db.insert_spool(&SpoolRow {
                id: "spool_1".to_string(),
                master_id,
                qr_code: None,
                rfid_tag: Some("tray-rfid-1".to_string()),
                rfid_observed_at: None,
                status: "IN_USE".to_string(),
                ownership_type: "OWNED".to_string(),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(950),
                remaining_g: Some(950),
                spool_tare_weight_g: None,
                location_id: None,
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
                last_used_at: None,
            })
            .map_err(|error| error.to_string())?;
            db.upsert_printer_with_ams("printer_1", "P1S", "Brutus", 1, 4)
                .map_err(|error| error.to_string())?;

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:958477605",
                job_name: Some("P1S X1C P1P"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 20,
                observed_at: Some("2026-05-18T17:46:40Z"),
                defer_initial_delta: true,
            })
            .map_err(|error| error.to_string())?;
            assert_eq!(
                db.list_printer_overview()
                    .map_err(|error| error.to_string())?[0]
                    .usage
                    .total_used_g,
                0
            );

            db.record_live_usage_delta(LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:958477605",
                job_name: Some("P1S X1C P1P"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 70,
                observed_at: Some("2026-05-18T19:35:55Z"),
                defer_initial_delta: true,
            })
            .map_err(|error| error.to_string())?;
            let overview = db
                .list_printer_overview()
                .map_err(|error| error.to_string())?;
            assert_eq!(overview[0].usage.total_used_g, 70);
            assert_eq!(overview[0].usage.total_jobs, 1);

            Ok(())
        })();

        let _ = std::fs::remove_file(&db_path);
        if let Err(message) = result {
            panic!(
                "live_usage_can_defer_first_warmup_delta_until_session_has_a_baseline failed: {message}"
            );
        }
    }
}
