use std::collections::BTreeMap;

use rusqlite::{params, types::ValueRef, Connection, Row};
use serde::{Deserialize, Serialize};

use super::inventory_domain::OwnershipType;
use super::spool_defaults::normalize_spool_status;
use super::statistics::ValidatedStatisticsPeriod;

/// Trace payloads are intentionally bounded independently of the calculations.
/// Totals and coverage stream every matching database row, while the API returns
/// at most this many deterministic trace rows and reports any truncation.
const VALUE_COST_TRACE_LIMIT: usize = 2_000;

const REASON_SPOOL_MISSING: &str = "spool_missing";
const REASON_REMAINING_WEIGHT_MISSING: &str = "remaining_weight_missing";
const REASON_REMAINING_WEIGHT_INVALID: &str = "remaining_weight_invalid";
const REASON_USED_WEIGHT_MISSING: &str = "used_weight_missing";
const REASON_USED_WEIGHT_INVALID: &str = "used_weight_invalid";
const REASON_INITIAL_WEIGHT_MISSING: &str = "initial_weight_missing";
const REASON_INITIAL_WEIGHT_INVALID: &str = "initial_weight_invalid";
const REASON_PURCHASE_PRICE_MISSING: &str = "purchase_price_missing";
const REASON_PURCHASE_PRICE_INVALID: &str = "purchase_price_invalid";
const REASON_PURCHASE_CURRENCY_MISSING: &str = "purchase_currency_missing";
const REASON_PURCHASE_CURRENCY_INVALID: &str = "purchase_currency_invalid";
const REASON_CALCULATION_INVALID: &str = "calculation_invalid";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StatisticsValueCostReport {
    pub inventory_value: StatisticsMonetarySummary,
    pub material_cost: StatisticsMonetarySummary,
    pub inventory_trace: Vec<StatisticsInventoryValueTraceRow>,
    pub material_cost_trace: Vec<StatisticsMaterialCostTraceRow>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StatisticsMonetarySummary {
    pub totals: Vec<StatisticsCurrencyOwnershipAmount>,
    pub coverage: StatisticsValueCostCoverage,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StatisticsCurrencyOwnershipAmount {
    pub currency: String,
    pub ownership_type: String,
    pub amount: f64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct StatisticsValueCostCoverage {
    pub total_rows: i64,
    pub valued_rows: i64,
    pub unvalued_rows: i64,
    pub covered_grams: i64,
    pub uncovered_grams: i64,
    pub missing_reasons: Vec<StatisticsValueCostMissingReasonCount>,
    pub trace_total_rows: i64,
    pub trace_returned_rows: i64,
    pub trace_truncated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct StatisticsValueCostMissingReasonCount {
    pub reason: String,
    pub rows: i64,
    pub grams: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StatisticsInventoryValueTraceRow {
    pub spool_id: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub status: String,
    pub ownership_type: String,
    pub remaining_g: Option<i64>,
    pub initial_weight_g: Option<i64>,
    pub purchase_price: Option<f64>,
    pub purchase_currency: Option<String>,
    pub amount: Option<f64>,
    pub missing_reasons: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct StatisticsMaterialCostTraceRow {
    pub usage_id: String,
    pub source: String,
    pub spool_id: Option<String>,
    pub printer_id: Option<String>,
    pub job_name: Option<String>,
    pub status: String,
    pub used_at: String,
    pub material: String,
    pub filament_name: String,
    pub color_name: String,
    pub vendor: String,
    pub ownership_type: Option<String>,
    pub used_g: Option<i64>,
    pub initial_weight_g: Option<i64>,
    pub purchase_price: Option<f64>,
    pub purchase_currency: Option<String>,
    pub amount: Option<f64>,
    pub missing_reasons: Vec<String>,
}

#[derive(Clone, Copy, Debug)]
enum RawInteger {
    Missing,
    Value(i64),
    Invalid,
}

#[derive(Clone, Copy, Debug)]
enum RawNumber {
    Missing,
    Value(f64),
    Invalid,
}

#[derive(Clone, Debug)]
enum RawText {
    Missing,
    Value(String),
    Invalid,
}

#[derive(Debug)]
struct Valuation {
    grams: Option<i64>,
    initial_weight_g: Option<i64>,
    purchase_price: Option<f64>,
    purchase_currency: Option<String>,
    amount: Option<f64>,
    missing_reasons: Vec<&'static str>,
}

#[derive(Default)]
struct MonetaryAccumulator {
    totals: BTreeMap<(String, String), f64>,
    total_rows: i64,
    valued_rows: i64,
    unvalued_rows: i64,
    covered_grams: i64,
    uncovered_grams: i64,
    missing_reasons: BTreeMap<&'static str, (i64, i64)>,
}

impl MonetaryAccumulator {
    fn record(&mut self, ownership_type: Option<&str>, valuation: &mut Valuation) {
        self.total_rows = self.total_rows.saturating_add(1);
        let grams = valuation.grams.filter(|grams| *grams >= 0).unwrap_or(0);
        if let (Some(ownership_type), Some(currency), Some(amount)) = (
            ownership_type,
            valuation.purchase_currency.as_deref(),
            valuation.amount,
        ) {
            let key = (currency.to_string(), ownership_type.to_string());
            let next_total = self.totals.get(&key).copied().unwrap_or_default() + amount;
            if next_total.is_finite() {
                self.totals.insert(key, next_total);
                self.valued_rows = self.valued_rows.saturating_add(1);
                self.covered_grams = self.covered_grams.saturating_add(grams);
                return;
            }

            // SQLite can contain finite legacy REAL values whose aggregate would
            // overflow f64. Keep the previous finite total and expose this row as
            // uncovered so JSON serialization can never receive infinity.
            valuation.amount = None;
            valuation.missing_reasons.push(REASON_CALCULATION_INVALID);
        }

        self.unvalued_rows = self.unvalued_rows.saturating_add(1);
        self.uncovered_grams = self.uncovered_grams.saturating_add(grams);
        for reason in &valuation.missing_reasons {
            let entry = self.missing_reasons.entry(reason).or_default();
            entry.0 = entry.0.saturating_add(1);
            entry.1 = entry.1.saturating_add(grams);
        }
    }

    fn finish(self, returned_trace_rows: usize) -> StatisticsMonetarySummary {
        let trace_total_rows = self.total_rows;
        let trace_returned_rows = i64::try_from(returned_trace_rows).unwrap_or(i64::MAX);
        StatisticsMonetarySummary {
            totals: self
                .totals
                .into_iter()
                .map(
                    |((currency, ownership_type), amount)| StatisticsCurrencyOwnershipAmount {
                        currency,
                        ownership_type,
                        amount,
                    },
                )
                .collect(),
            coverage: StatisticsValueCostCoverage {
                total_rows: self.total_rows,
                valued_rows: self.valued_rows,
                unvalued_rows: self.unvalued_rows,
                covered_grams: self.covered_grams,
                uncovered_grams: self.uncovered_grams,
                missing_reasons: self
                    .missing_reasons
                    .into_iter()
                    .map(
                        |(reason, (rows, grams))| StatisticsValueCostMissingReasonCount {
                            reason: reason.to_string(),
                            rows,
                            grams,
                        },
                    )
                    .collect(),
                trace_total_rows,
                trace_returned_rows,
                trace_truncated: trace_returned_rows < trace_total_rows,
            },
        }
    }
}

pub(super) fn value_cost_report_from_connection(
    connection: &Connection,
    period: ValidatedStatisticsPeriod,
) -> Result<StatisticsValueCostReport, rusqlite::Error> {
    let (inventory_value, inventory_trace) = inventory_value_from_connection(connection)?;
    let (material_cost, material_cost_trace) = material_cost_from_connection(connection, period)?;
    Ok(StatisticsValueCostReport {
        inventory_value,
        material_cost,
        inventory_trace,
        material_cost_trace,
    })
}

fn inventory_value_from_connection(
    connection: &Connection,
) -> Result<
    (
        StatisticsMonetarySummary,
        Vec<StatisticsInventoryValueTraceRow>,
    ),
    rusqlite::Error,
> {
    let mut statement = connection.prepare(
        "SELECT
            s.id,
            COALESCE(NULLIF(m.material, ''), 'Unknown'),
            COALESCE(NULLIF(m.filament_name, ''), 'Unknown'),
            COALESCE(NULLIF(m.color_name, ''), 'Unknown'),
            COALESCE(NULLIF(m.vendor, ''), 'Unknown'),
            s.status,
            s.ownership_type,
            s.remaining_g,
            s.initial_weight_g,
            s.purchase_price,
            s.purchase_currency
         FROM filament_spools s
         LEFT JOIN filament_master_list m ON m.id = s.master_id
         WHERE s.deleted_at IS NULL
           AND REPLACE(REPLACE(UPPER(TRIM(COALESCE(s.status, ''))), '-', '_'), ' ', '_')
               IN ('IN_STOCK', 'ASSIGNED', 'IN_USE', 'BORROWED', 'LOANED_OUT', 'LOANED')
         ORDER BY s.id ASC",
    )?;
    let mut rows = statement.query([])?;
    let mut accumulator = MonetaryAccumulator::default();
    let mut trace = Vec::new();
    while let Some(row) = rows.next()? {
        let raw_remaining = raw_integer(row, 7)?;
        let raw_initial = raw_integer(row, 8)?;
        let raw_price = raw_number(row, 9)?;
        let raw_currency = raw_text(row, 10)?;
        let mut valuation = value_for_weights(
            true,
            raw_remaining,
            REASON_REMAINING_WEIGHT_MISSING,
            REASON_REMAINING_WEIGHT_INVALID,
            raw_initial,
            raw_price,
            raw_currency,
        );
        let raw_ownership: String = row.get(6)?;
        let ownership_type = OwnershipType::from_raw(Some(&raw_ownership))
            .as_str()
            .to_string();
        accumulator.record(Some(&ownership_type), &mut valuation);

        if trace.len() < VALUE_COST_TRACE_LIMIT {
            let raw_status: String = row.get(5)?;
            trace.push(StatisticsInventoryValueTraceRow {
                spool_id: row.get(0)?,
                material: row.get(1)?,
                filament_name: row.get(2)?,
                color_name: row.get(3)?,
                vendor: row.get(4)?,
                status: normalize_spool_status(Some(&raw_status)),
                ownership_type,
                remaining_g: valuation.grams,
                initial_weight_g: valuation.initial_weight_g,
                purchase_price: valuation.purchase_price,
                purchase_currency: valuation.purchase_currency.clone(),
                amount: valuation.amount,
                missing_reasons: valuation
                    .missing_reasons
                    .iter()
                    .map(|reason| (*reason).to_string())
                    .collect(),
            });
        }
    }

    Ok((accumulator.finish(trace.len()), trace))
}

fn material_cost_from_connection(
    connection: &Connection,
    period: ValidatedStatisticsPeriod,
) -> Result<
    (
        StatisticsMonetarySummary,
        Vec<StatisticsMaterialCostTraceRow>,
    ),
    rusqlite::Error,
> {
    let mut statement = connection.prepare(
        "WITH usage_rows AS (
            SELECT 'manual:' || p.id AS usage_id,
                   'MANUAL' AS source,
                   p.spool_id,
                   p.printer_id,
                   p.job_name,
                   CASE p.success
                       WHEN 1 THEN 'COMPLETED'
                       WHEN 0 THEN 'FAILED'
                       ELSE 'UNKNOWN'
                   END AS usage_status,
                   p.started_at AS used_at,
                   p.material_used_g AS used_g
            FROM print_jobs p
            UNION ALL
            SELECT 'live:' || u.id || ':' || us.id AS usage_id,
                   'LIVE' AS source,
                   us.spool_id,
                   u.printer_id,
                   u.job_name,
                   COALESCE(NULLIF(UPPER(TRIM(u.status)), ''), 'UNKNOWN') AS usage_status,
                   COALESCE(u.finished_at, u.last_seen_at, u.started_at) AS used_at,
                   us.used_g
            FROM printer_live_usage_session_spools us
            JOIN printer_live_usage_sessions u ON u.id = us.session_id
         )
         SELECT
            u.usage_id,
            u.source,
            u.spool_id,
            u.printer_id,
            u.job_name,
            u.usage_status,
            u.used_at,
            COALESCE(NULLIF(m.material, ''), 'Unknown'),
            COALESCE(NULLIF(m.filament_name, ''), 'Unknown'),
            COALESCE(NULLIF(m.color_name, ''), 'Unknown'),
            COALESCE(NULLIF(m.vendor, ''), 'Unknown'),
            s.id,
            s.ownership_type,
            u.used_g,
            s.initial_weight_g,
            s.purchase_price,
            s.purchase_currency
         FROM usage_rows u
         LEFT JOIN filament_spools s ON s.id = u.spool_id
         LEFT JOIN filament_master_list m ON m.id = s.master_id
         WHERE unixepoch(u.used_at) >= ?1
           AND unixepoch(u.used_at) < ?2
         ORDER BY unixepoch(u.used_at) DESC, u.usage_id ASC",
    )?;
    let mut rows = statement.query(params![period.start_unix_seconds, period.end_unix_seconds])?;
    let mut accumulator = MonetaryAccumulator::default();
    let mut trace = Vec::new();
    while let Some(row) = rows.next()? {
        let spool_exists = row.get::<_, Option<String>>(11)?.is_some();
        let raw_used = raw_integer(row, 13)?;
        let raw_initial = raw_integer(row, 14)?;
        let raw_price = raw_number(row, 15)?;
        let raw_currency = raw_text(row, 16)?;
        let mut valuation = value_for_weights(
            spool_exists,
            raw_used,
            REASON_USED_WEIGHT_MISSING,
            REASON_USED_WEIGHT_INVALID,
            raw_initial,
            raw_price,
            raw_currency,
        );
        let ownership_type = if spool_exists {
            let raw_ownership: Option<String> = row.get(12)?;
            Some(
                OwnershipType::from_raw(raw_ownership.as_deref())
                    .as_str()
                    .to_string(),
            )
        } else {
            None
        };
        accumulator.record(ownership_type.as_deref(), &mut valuation);

        if trace.len() < VALUE_COST_TRACE_LIMIT {
            trace.push(StatisticsMaterialCostTraceRow {
                usage_id: row.get(0)?,
                source: row.get(1)?,
                spool_id: row.get(2)?,
                printer_id: row.get(3)?,
                job_name: row.get(4)?,
                status: row.get(5)?,
                used_at: row.get(6)?,
                material: row.get(7)?,
                filament_name: row.get(8)?,
                color_name: row.get(9)?,
                vendor: row.get(10)?,
                ownership_type,
                used_g: valuation.grams,
                initial_weight_g: valuation.initial_weight_g,
                purchase_price: valuation.purchase_price,
                purchase_currency: valuation.purchase_currency.clone(),
                amount: valuation.amount,
                missing_reasons: valuation
                    .missing_reasons
                    .iter()
                    .map(|reason| (*reason).to_string())
                    .collect(),
            });
        }
    }

    Ok((accumulator.finish(trace.len()), trace))
}

fn value_for_weights(
    spool_exists: bool,
    raw_grams: RawInteger,
    grams_missing_reason: &'static str,
    grams_invalid_reason: &'static str,
    raw_initial_weight: RawInteger,
    raw_purchase_price: RawNumber,
    raw_purchase_currency: RawText,
) -> Valuation {
    let mut missing_reasons = Vec::new();
    let grams = match raw_grams {
        RawInteger::Missing => {
            missing_reasons.push(grams_missing_reason);
            None
        }
        RawInteger::Value(value) if value >= 0 => Some(value),
        RawInteger::Value(_) | RawInteger::Invalid => {
            missing_reasons.push(grams_invalid_reason);
            None
        }
    };

    if !spool_exists {
        missing_reasons.push(REASON_SPOOL_MISSING);
        return Valuation {
            grams,
            initial_weight_g: None,
            purchase_price: None,
            purchase_currency: None,
            amount: None,
            missing_reasons,
        };
    }

    let initial_weight_g = match raw_initial_weight {
        RawInteger::Missing => {
            missing_reasons.push(REASON_INITIAL_WEIGHT_MISSING);
            None
        }
        RawInteger::Value(value) if value > 0 => Some(value),
        RawInteger::Value(_) | RawInteger::Invalid => {
            missing_reasons.push(REASON_INITIAL_WEIGHT_INVALID);
            None
        }
    };
    let purchase_price = match raw_purchase_price {
        RawNumber::Missing => {
            missing_reasons.push(REASON_PURCHASE_PRICE_MISSING);
            None
        }
        RawNumber::Value(value) if value.is_finite() && value >= 0.0 => Some(value),
        RawNumber::Value(_) | RawNumber::Invalid => {
            missing_reasons.push(REASON_PURCHASE_PRICE_INVALID);
            None
        }
    };
    let purchase_currency = match raw_purchase_currency {
        RawText::Missing => {
            missing_reasons.push(REASON_PURCHASE_CURRENCY_MISSING);
            None
        }
        RawText::Value(value) => {
            let normalized = value.trim().to_ascii_uppercase();
            if normalized.is_empty() {
                missing_reasons.push(REASON_PURCHASE_CURRENCY_MISSING);
                None
            } else if normalized.len() == 3
                && normalized.bytes().all(|byte| byte.is_ascii_alphabetic())
            {
                Some(normalized)
            } else {
                missing_reasons.push(REASON_PURCHASE_CURRENCY_INVALID);
                Some(normalized)
            }
        }
        RawText::Invalid => {
            missing_reasons.push(REASON_PURCHASE_CURRENCY_INVALID);
            None
        }
    };

    let amount = if missing_reasons.is_empty() {
        let amount = purchase_price.expect("validated price")
            * (grams.expect("validated grams") as f64
                / initial_weight_g.expect("validated initial weight") as f64);
        if amount.is_finite() && amount >= 0.0 {
            Some(amount)
        } else {
            missing_reasons.push(REASON_CALCULATION_INVALID);
            None
        }
    } else {
        None
    };

    Valuation {
        grams,
        initial_weight_g,
        purchase_price,
        purchase_currency,
        amount,
        missing_reasons,
    }
}

fn raw_integer(row: &Row<'_>, index: usize) -> Result<RawInteger, rusqlite::Error> {
    Ok(match row.get_ref(index)? {
        ValueRef::Null => RawInteger::Missing,
        ValueRef::Integer(value) => RawInteger::Value(value),
        ValueRef::Real(value)
            if value.is_finite()
                && value.fract() == 0.0
                && value >= i64::MIN as f64
                && value < i64::MAX as f64 =>
        {
            RawInteger::Value(value as i64)
        }
        ValueRef::Real(_) | ValueRef::Text(_) | ValueRef::Blob(_) => RawInteger::Invalid,
    })
}

fn raw_number(row: &Row<'_>, index: usize) -> Result<RawNumber, rusqlite::Error> {
    Ok(match row.get_ref(index)? {
        ValueRef::Null => RawNumber::Missing,
        ValueRef::Integer(value) => RawNumber::Value(value as f64),
        ValueRef::Real(value) => RawNumber::Value(value),
        ValueRef::Text(_) | ValueRef::Blob(_) => RawNumber::Invalid,
    })
}

fn raw_text(row: &Row<'_>, index: usize) -> Result<RawText, rusqlite::Error> {
    Ok(match row.get_ref(index)? {
        ValueRef::Null => RawText::Missing,
        ValueRef::Text(value) => match std::str::from_utf8(value) {
            Ok(value) => RawText::Value(value.to_string()),
            Err(_) => RawText::Invalid,
        },
        ValueRef::Integer(_) | ValueRef::Real(_) | ValueRef::Blob(_) => RawText::Invalid,
    })
}

#[cfg(test)]
mod tests {
    use super::{StatisticsMonetarySummary, VALUE_COST_TRACE_LIMIT};
    use crate::backend::filament_database::FilamentDatabase;
    use crate::backend::statistics::{StatisticsEngine, StatisticsPeriod};
    use rusqlite::params;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(test_name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "filament-manager-value-cost-{test_name}-{}-{nanos}.db",
            std::process::id()
        ))
    }

    fn create_database(path: &PathBuf) -> Result<FilamentDatabase, String> {
        let database = FilamentDatabase::open(path).map_err(|error| error.to_string())?;
        database.apply_schema().map_err(|error| error.to_string())?;
        database
            .connection()
            .execute(
                "INSERT INTO filament_master_list (
                    id, material, filament_name, color_name, vendor, default_weight
                 ) VALUES ('master-value-cost', 'PLA', 'Basic', 'Red', 'Generic', 1000)",
                [],
            )
            .map_err(|error| error.to_string())?;
        Ok(database)
    }

    fn report(
        path: &PathBuf,
    ) -> Result<crate::backend::statistics::StatisticsPeriodReport, String> {
        StatisticsEngine::open(path)
            .map_err(|error| error.to_string())?
            .period_report(&StatisticsPeriod {
                start_at_utc: "2026-08-01T00:00:00Z".to_string(),
                end_at_utc: "2026-08-02T00:00:00Z".to_string(),
            })
            .map_err(|error| error.to_string())
    }

    fn amount(summary: &StatisticsMonetarySummary, currency: &str, ownership: &str) -> f64 {
        summary
            .totals
            .iter()
            .find(|row| row.currency == currency && row.ownership_type == ownership)
            .map(|row| row.amount)
            .unwrap_or_default()
    }

    fn reason_rows(summary: &StatisticsMonetarySummary, reason: &str) -> i64 {
        summary
            .coverage
            .missing_reasons
            .iter()
            .find(|row| row.reason == reason)
            .map(|row| row.rows)
            .unwrap_or_default()
    }

    fn assert_approx_eq(actual: f64, expected: f64) {
        let tolerance = expected.abs().max(1.0) * 1e-10;
        assert!(
            (actual - expected).abs() <= tolerance,
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn inventory_value_splits_currency_and_ownership_and_filters_inactive_spools() {
        let path = temp_db_path("inventory-split");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            database
                .connection()
                .execute_batch(
                    "INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES
                        ('owned-stock', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 250, 1000, ' nok '),
                        ('owned-assigned', 'master-value-cost', 'ASSIGNED', 'OWNED', 1000, 400, 500, 'NOK'),
                        ('owned-legacy-use', 'master-value-cost', 'IN_USE', 'OWNED', 1000, 500, 100, 'usd'),
                        ('owned-outbound', 'master-value-cost', 'loaned out', 'OWNED', 1000, 100, 1000, 'NOK'),
                        ('borrowed-in', 'master-value-cost', 'IN_STOCK', 'borrowed-in', 1000, 500, 100, 'NOK'),
                        ('missing-receipt', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, NULL, NULL),
                        ('empty', 'master-value-cost', 'EMPTY', 'OWNED', 1000, 900, 9999, 'NOK'),
                        ('lost', 'master-value-cost', 'LOST', 'OWNED', 1000, 900, 9999, 'NOK'),
                        ('missing', 'master-value-cost', 'MISSING', 'OWNED', 1000, 900, 9999, 'NOK'),
                        ('archived', 'master-value-cost', 'ARCHIVED', 'OWNED', 1000, 900, 9999, 'NOK'),
                        ('deleted-status', 'master-value-cost', 'DELETED', 'OWNED', 1000, 900, 9999, 'NOK'),
                        ('soft-deleted', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 900, 9999, 'NOK');
                     UPDATE filament_spools
                     SET deleted_at = '2026-07-01T00:00:00Z'
                     WHERE id = 'soft-deleted';",
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            let value_cost = report
                .value_cost
                .expect("new report must expose value/cost");
            let inventory = &value_cost.inventory_value;
            assert_approx_eq(amount(inventory, "NOK", "OWNED"), 550.0);
            assert_approx_eq(amount(inventory, "USD", "OWNED"), 50.0);
            assert_approx_eq(amount(inventory, "NOK", "BORROWED_IN"), 50.0);
            assert_eq!(
                inventory.totals.len(),
                3,
                "currencies must never be combined"
            );
            assert_eq!(
                (
                    inventory.coverage.total_rows,
                    inventory.coverage.valued_rows,
                    inventory.coverage.unvalued_rows,
                    inventory.coverage.covered_grams,
                    inventory.coverage.uncovered_grams,
                ),
                (6, 5, 1, 1_750, 100)
            );
            assert_eq!(reason_rows(inventory, "purchase_price_missing"), 1);
            assert_eq!(reason_rows(inventory, "purchase_currency_missing"), 1);
            assert_eq!(value_cost.inventory_trace.len(), 6);
            assert!(value_cost
                .inventory_trace
                .iter()
                .any(|row| row.spool_id == "owned-legacy-use" && row.status == "ASSIGNED"));
            for excluded in [
                "empty",
                "lost",
                "missing",
                "archived",
                "deleted-status",
                "soft-deleted",
            ] {
                assert!(!value_cost
                    .inventory_trace
                    .iter()
                    .any(|row| row.spool_id == excluded));
            }
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("inventory value split/filter test failed: {message}");
        }
    }

    #[test]
    fn invalid_legacy_inventory_values_are_explicitly_uncovered() {
        let path = temp_db_path("inventory-invalid-legacy");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            database
                .connection()
                .execute_batch(
                    "INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES
                        ('valid-zero', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 0, 0, 'NOK'),
                        ('initial-missing', 'master-value-cost', 'IN_STOCK', 'OWNED', NULL, 100, 100, 'NOK'),
                        ('initial-zero', 'master-value-cost', 'IN_STOCK', 'OWNED', 0, 100, 100, 'NOK'),
                        ('initial-invalid-type', 'master-value-cost', 'IN_STOCK', 'OWNED', 'oops', 100, 100, 'NOK'),
                        ('remaining-missing', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, NULL, 100, 'NOK'),
                        ('remaining-negative', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, -1, 100, 'NOK'),
                        ('price-negative', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, -1, 'NOK'),
                        ('receipt-missing', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, NULL, NULL),
                        ('legacy-currencyless', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, 100, NULL),
                        ('currency-invalid', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, 100, 'NO'),
                        ('price-invalid-type', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 100, 100, 'NOK'),
                        ('unknown-status', 'master-value-cost', 'mystery', 'OWNED', 1000, 100, 9999, 'NOK');
                     UPDATE filament_spools
                     SET purchase_price = X'0102'
                     WHERE id = 'price-invalid-type';",
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            let value_cost = report.value_cost.expect("value/cost report");
            let inventory = &value_cost.inventory_value;
            assert_eq!(
                (
                    inventory.coverage.total_rows,
                    inventory.coverage.valued_rows,
                    inventory.coverage.unvalued_rows,
                ),
                (11, 1, 10)
            );
            assert_eq!(inventory.totals.len(), 1);
            assert_approx_eq(amount(inventory, "NOK", "OWNED"), 0.0);
            for reason in [
                "remaining_weight_missing",
                "remaining_weight_invalid",
                "initial_weight_missing",
                "initial_weight_invalid",
                "purchase_price_missing",
                "purchase_price_invalid",
                "purchase_currency_missing",
                "purchase_currency_invalid",
            ] {
                assert!(
                    reason_rows(inventory, reason) > 0,
                    "expected coverage reason {reason}"
                );
            }
            let currencyless = value_cost
                .inventory_trace
                .iter()
                .find(|row| row.spool_id == "legacy-currencyless")
                .expect("legacy currencyless trace");
            assert_eq!(currencyless.purchase_price, Some(100.0));
            assert_eq!(currencyless.amount, None);
            assert_eq!(
                currencyless.missing_reasons,
                vec!["purchase_currency_missing"]
            );
            assert!(!value_cost
                .inventory_trace
                .iter()
                .any(|row| row.spool_id == "unknown-status"));
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("invalid legacy coverage test failed: {message}");
        }
    }

    #[test]
    fn material_cost_uses_source_timestamps_and_keeps_failed_and_deleted_history() {
        let path = temp_db_path("material-cost-period");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            let connection = database.connection();
            connection
                .execute_batch(
                    "INSERT INTO printers (id, model, name)
                     VALUES ('printer-cost', 'P1S', 'Cost printer');
                     INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES
                        ('cost-owned', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 500, 100, 'NOK'),
                        ('cost-borrowed', 'master-value-cost', 'ASSIGNED', 'BORROWED_IN', 500, 300, 50, 'USD'),
                        ('cost-deleted', 'master-value-cost', 'DELETED', 'OWNED', 1000, 0, 200, 'NOK');
                     UPDATE filament_spools
                     SET deleted_at = '2026-07-31T00:00:00Z'
                     WHERE id = 'cost-deleted';
                     INSERT INTO print_jobs (
                        id, printer_id, spool_id, job_name, started_at, material_used_g, success
                     ) VALUES
                        ('manual-before', 'printer-cost', 'cost-owned', 'Before', '2026-07-31T23:59:59Z', 10, 1),
                        ('manual-start-failed', 'printer-cost', 'cost-owned', 'At start failed', '2026-08-01T00:00:00Z', 100, 0),
                        ('manual-borrowed', 'printer-cost', 'cost-borrowed', 'Borrowed', '2026-08-01T09:00:00Z', 50, 1),
                        ('manual-deleted', 'printer-cost', 'cost-deleted', 'Deleted spool', '2026-08-01T10:00:00Z', 100, 1),
                        ('manual-no-spool', 'printer-cost', NULL, 'No spool', '2026-08-01T11:00:00Z', 25, 1),
                        ('manual-end', 'printer-cost', 'cost-owned', 'At end', '2026-08-02T00:00:00Z', 10, 1);
                     INSERT INTO printer_live_usage_sessions (
                        id, printer_id, session_key, job_name, started_at, last_seen_at,
                        finished_at, status, success, total_used_g
                     ) VALUES
                        ('live-failed', 'printer-cost', 'failed', 'Live failed',
                         '2026-08-01T12:00:00Z', '2026-08-01T12:30:00Z',
                         '2026-08-01T12:30:00Z', 'FAILED', 0, 200),
                        ('live-active', 'printer-cost', 'active', 'Live active',
                         '2026-07-31T23:00:00Z', '2026-08-01T13:00:00Z',
                         NULL, 'PRINTING', NULL, 50),
                        ('live-finished-at-end', 'printer-cost', 'end', 'Live at end',
                         '2026-08-01T14:00:00Z', '2026-08-01T14:30:00Z',
                         '2026-08-02T00:00:00Z', 'COMPLETED', 1, 70);
                     INSERT INTO printer_live_usage_session_spools (
                        id, session_id, spool_id, used_g
                     ) VALUES
                        ('live-spool-failed', 'live-failed', 'cost-owned', 200),
                        ('live-spool-active', 'live-active', 'cost-owned', 50),
                        ('live-spool-end', 'live-finished-at-end', 'cost-owned', 70);",
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            assert_eq!(report.total_used_g, 525);
            let value_cost = report.value_cost.expect("value/cost report");
            let cost = &value_cost.material_cost;
            assert_approx_eq(amount(cost, "NOK", "OWNED"), 55.0);
            assert_approx_eq(amount(cost, "USD", "BORROWED_IN"), 5.0);
            assert_eq!(cost.totals.len(), 2);
            assert_eq!(
                (
                    cost.coverage.total_rows,
                    cost.coverage.valued_rows,
                    cost.coverage.unvalued_rows,
                    cost.coverage.covered_grams,
                    cost.coverage.uncovered_grams,
                ),
                (6, 5, 1, 500, 25)
            );
            assert_eq!(reason_rows(cost, "spool_missing"), 1);
            assert_eq!(
                cost.coverage.covered_grams + cost.coverage.uncovered_grams,
                report.total_used_g
            );
            assert!(value_cost.material_cost_trace.iter().any(|row| {
                row.usage_id == "manual:manual-start-failed"
                    && row.status == "FAILED"
                    && row.amount == Some(10.0)
            }));
            assert!(value_cost.material_cost_trace.iter().any(|row| {
                row.usage_id == "live:live-failed:live-spool-failed"
                    && row.status == "FAILED"
                    && row.amount == Some(20.0)
            }));
            assert!(value_cost.material_cost_trace.iter().any(|row| {
                row.usage_id == "live:live-active:live-spool-active"
                    && row.status == "PRINTING"
                    && row.used_at == "2026-08-01T13:00:00Z"
            }));
            assert!(value_cost.material_cost_trace.iter().any(|row| {
                row.spool_id.as_deref() == Some("cost-deleted") && row.amount == Some(20.0)
            }));
            for excluded in [
                "manual:manual-before",
                "manual:manual-end",
                "live:live-finished-at-end:live-spool-end",
            ] {
                assert!(!value_cost
                    .material_cost_trace
                    .iter()
                    .any(|row| row.usage_id == excluded));
            }
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("material cost period/history test failed: {message}");
        }
    }

    #[test]
    fn invalid_legacy_usage_values_have_cost_specific_coverage_reasons() {
        let path = temp_db_path("material-cost-invalid-legacy");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            database
                .connection()
                .execute_batch(
                    "INSERT INTO printers (id, model, name)
                     VALUES ('printer-invalid-cost', 'P1S', 'Invalid cost printer');
                     INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES
                        ('usage-valid-spool', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 500, 100, 'NOK'),
                        ('usage-no-initial', 'master-value-cost', 'IN_STOCK', 'OWNED', NULL, 500, 100, 'NOK'),
                        ('usage-no-receipt', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 500, NULL, NULL),
                        ('usage-bad-currency', 'master-value-cost', 'IN_STOCK', 'OWNED', 1000, 500, 100, 'N0K');
                     INSERT INTO print_jobs (
                        id, printer_id, spool_id, job_name, started_at, material_used_g, success
                     ) VALUES
                        ('usage-null', 'printer-invalid-cost', 'usage-valid-spool', 'Null grams', '2026-08-01T10:00:00Z', NULL, 1),
                        ('usage-negative', 'printer-invalid-cost', 'usage-valid-spool', 'Negative grams', '2026-08-01T10:01:00Z', -10, 0),
                        ('usage-bad-type', 'printer-invalid-cost', 'usage-valid-spool', 'Bad type grams', '2026-08-01T10:02:00Z', 'oops', 1),
                        ('usage-initial-missing', 'printer-invalid-cost', 'usage-no-initial', 'No initial', '2026-08-01T10:03:00Z', 100, 1),
                        ('usage-receipt-missing', 'printer-invalid-cost', 'usage-no-receipt', 'No receipt', '2026-08-01T10:04:00Z', 100, 1),
                        ('usage-currency-invalid', 'printer-invalid-cost', 'usage-bad-currency', 'Bad currency', '2026-08-01T10:05:00Z', 100, 1);",
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            let value_cost = report.value_cost.expect("value/cost report");
            let cost = &value_cost.material_cost;
            assert_eq!(
                (
                    cost.coverage.total_rows,
                    cost.coverage.valued_rows,
                    cost.coverage.unvalued_rows,
                ),
                (6, 0, 6)
            );
            assert!(cost.totals.is_empty());
            assert_eq!(reason_rows(cost, "used_weight_missing"), 1);
            assert_eq!(reason_rows(cost, "used_weight_invalid"), 2);
            assert_eq!(reason_rows(cost, "initial_weight_missing"), 1);
            assert_eq!(reason_rows(cost, "purchase_price_missing"), 1);
            assert_eq!(reason_rows(cost, "purchase_currency_missing"), 1);
            assert_eq!(reason_rows(cost, "purchase_currency_invalid"), 1);
            assert!(value_cost
                .material_cost_trace
                .iter()
                .all(|row| row.amount.is_none()));
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("invalid legacy usage coverage test failed: {message}");
        }
    }

    #[test]
    fn trace_is_bounded_but_totals_and_coverage_include_every_usage_row() {
        let path = temp_db_path("trace-bound");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            let connection = database.connection();
            connection
                .execute_batch(
                    "INSERT INTO printers (id, model, name)
                     VALUES ('printer-bulk', 'P1S', 'Bulk printer');
                     INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES (
                        'bulk-spool', 'master-value-cost', 'IN_STOCK', 'OWNED',
                        1000, 500, 100, 'NOK'
                     );
                     WITH RECURSIVE sequence(value) AS (
                        SELECT 1
                        UNION ALL
                        SELECT value + 1 FROM sequence WHERE value < 2001
                     )
                     INSERT INTO print_jobs (
                        id, printer_id, spool_id, job_name, started_at, material_used_g, success
                     )
                     SELECT
                        'bulk-' || printf('%04d', value),
                        'printer-bulk',
                        'bulk-spool',
                        'Bulk',
                        '2026-08-01T12:00:00Z',
                        1,
                        1
                     FROM sequence;",
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            let value_cost = report.value_cost.expect("value/cost report");
            let cost = &value_cost.material_cost;
            assert_eq!(cost.coverage.total_rows, 2_001);
            assert_eq!(cost.coverage.valued_rows, 2_001);
            assert_eq!(cost.coverage.covered_grams, 2_001);
            assert_eq!(
                cost.coverage.trace_returned_rows,
                VALUE_COST_TRACE_LIMIT as i64
            );
            assert_eq!(cost.coverage.trace_total_rows, 2_001);
            assert!(cost.coverage.trace_truncated);
            assert_eq!(value_cost.material_cost_trace.len(), VALUE_COST_TRACE_LIMIT);
            assert_approx_eq(amount(cost, "NOK", "OWNED"), 200.1);
            assert_eq!(report.total_used_g, 2_001);
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("trace bound test failed: {message}");
        }
    }

    #[test]
    fn aggregate_overflow_is_uncovered_and_report_remains_json_serializable() {
        let path = temp_db_path("aggregate-overflow");
        let result = (|| -> Result<(), String> {
            let database = create_database(&path)?;
            database
                .connection()
                .execute(
                    "INSERT INTO filament_spools (
                        id, master_id, status, ownership_type, initial_weight_g, remaining_g,
                        purchase_price, purchase_currency
                     ) VALUES
                        ('overflow-a', 'master-value-cost', 'IN_STOCK', 'OWNED', 1, 1, ?1, 'NOK'),
                        ('overflow-b', 'master-value-cost', 'IN_STOCK', 'OWNED', 1, 1, ?1, 'NOK')",
                    params![f64::MAX],
                )
                .map_err(|error| error.to_string())?;
            drop(database);

            let report = report(&path)?;
            let value_cost = report.value_cost.as_ref().expect("value/cost report");
            let inventory = &value_cost.inventory_value;
            assert_eq!(inventory.coverage.valued_rows, 1);
            assert_eq!(inventory.coverage.unvalued_rows, 1);
            assert_eq!(reason_rows(inventory, "calculation_invalid"), 1);
            assert!(inventory.totals.iter().all(|row| row.amount.is_finite()));
            assert!(value_cost.inventory_trace.iter().any(|row| {
                row.amount.is_none()
                    && row
                        .missing_reasons
                        .iter()
                        .any(|reason| reason == "calculation_invalid")
            }));
            serde_json::to_string(&report).map_err(|error| error.to_string())?;
            Ok(())
        })();

        let _ = std::fs::remove_file(&path);
        if let Err(message) = result {
            panic!("aggregate overflow test failed: {message}");
        }
    }
}
