use rusqlite::{params, Connection, OptionalExtension};

use super::database_rows::map_active_spool_loan_row;
use super::filament_database::{
    ActiveSpoolLoanRow, InventoryError, InventoryResult, LoanUsageByPersonRow, SpoolLoanDetailsRow,
    SpoolLoanRow,
};
use super::loan_defaults::normalize_loan_direction_filter;

pub(crate) fn spool_has_active_loan(conn: &Connection, spool_id: &str) -> InventoryResult<bool> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1
             FROM spool_loans
             WHERE spool_id = ?1
               AND returned_at IS NULL
             LIMIT 1",
            params![spool_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(exists.is_some())
}

pub(crate) fn list_active_spool_loans(
    conn: &Connection,
) -> InventoryResult<Vec<ActiveSpoolLoanRow>> {
    let mut stmt = conn.prepare(
        "SELECT
            l.id, l.spool_id, l.borrower_name,
            COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
            COALESCE(NULLIF(l.loan_status, ''), CASE
                WHEN l.returned_at IS NULL THEN 'ACTIVE'
                ELSE 'RETURNED'
            END) AS loan_status,
            COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
            l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
            l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
            s.status, s.remaining_g, s.spool_tare_weight_g,
            m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
         FROM spool_loans l
         JOIN filament_spools s ON s.id = l.spool_id
         JOIN filament_master_list m ON m.id = s.master_id
         WHERE COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'
           AND l.returned_at IS NULL
           AND s.deleted_at IS NULL
         ORDER BY l.lent_at DESC",
    )?;

    let rows = stmt.query_map([], map_active_spool_loan_row)?;
    let mut output = Vec::new();
    for row in rows {
        output.push(row?);
    }
    Ok(output)
}

pub(crate) fn find_active_spool_loan_for_direction(
    conn: &Connection,
    spool_id: &str,
    direction: &str,
) -> InventoryResult<Option<ActiveSpoolLoanRow>> {
    let loan_direction = if direction.trim().eq_ignore_ascii_case("INBOUND") {
        "INBOUND"
    } else {
        "OUTBOUND"
    };

    conn.query_row(
        "SELECT
            l.id, l.spool_id, l.borrower_name,
            COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
            COALESCE(NULLIF(l.loan_status, ''), CASE
                WHEN l.returned_at IS NULL THEN 'ACTIVE'
                ELSE 'RETURNED'
            END) AS loan_status,
            COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
            l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
            l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
            s.status, s.remaining_g, s.spool_tare_weight_g,
            m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
         FROM spool_loans l
         JOIN filament_spools s ON s.id = l.spool_id
         JOIN filament_master_list m ON m.id = s.master_id
         WHERE l.spool_id = ?1
           AND COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = ?2
           AND l.returned_at IS NULL
           AND s.deleted_at IS NULL
         LIMIT 1",
        params![spool_id, loan_direction],
        map_active_spool_loan_row,
    )
    .optional()
    .map_err(InventoryError::from)
}

pub(crate) fn list_loan_usage_by_person_for_direction(
    conn: &Connection,
    limit: i64,
    direction: Option<&str>,
) -> InventoryResult<Vec<LoanUsageByPersonRow>> {
    let direction_clause = match normalize_loan_direction_filter(direction).as_str() {
        "INBOUND" => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'INBOUND'",
        "ALL" => "1 = 1",
        _ => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'",
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT
            COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
            COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS borrower_name,
            COALESCE(SUM(l.consumed_grams), 0) AS total_consumed_g,
            COALESCE(SUM(CASE WHEN l.returned_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS completed_loans,
            COALESCE(SUM(CASE
                WHEN l.returned_at IS NULL AND s.id IS NOT NULL AND s.deleted_at IS NULL THEN 1
                ELSE 0
            END), 0) AS active_loans
         FROM spool_loans l
         LEFT JOIN filament_spools s ON s.id = l.spool_id
         WHERE {}
         GROUP BY
            COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND'),
            COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name)
         HAVING total_consumed_g > 0
            OR completed_loans > 0
            OR active_loans > 0
         ORDER BY total_consumed_g DESC, borrower_name ASC
         LIMIT ?1",
        direction_clause
    ))?;

    let rows = stmt.query_map(params![limit], |row| {
        Ok(LoanUsageByPersonRow {
            loan_direction: row.get(0)?,
            borrower_name: row.get(1)?,
            total_consumed_g: row.get(2)?,
            completed_loans: row.get(3)?,
            active_loans: row.get(4)?,
        })
    })?;
    let mut output = Vec::new();
    for row in rows {
        output.push(row?);
    }
    Ok(output)
}

pub(crate) fn list_spool_loans_for_direction(
    conn: &Connection,
    limit: i64,
    include_returned: bool,
    direction: Option<&str>,
) -> InventoryResult<Vec<SpoolLoanDetailsRow>> {
    let direction_clause = match normalize_loan_direction_filter(direction).as_str() {
        "INBOUND" => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'INBOUND'",
        "ALL" => "1 = 1",
        _ => "COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') = 'OUTBOUND'",
    };
    let status_clause = if include_returned {
        "1 = 1"
    } else {
        "l.returned_at IS NULL AND s.deleted_at IS NULL"
    };
    let mut stmt = conn.prepare(&format!(
        "SELECT
            l.id, l.spool_id, l.borrower_name,
            COALESCE(NULLIF(l.loan_direction, ''), 'OUTBOUND') AS loan_direction,
            COALESCE(NULLIF(l.loan_status, ''), CASE
                WHEN l.returned_at IS NULL THEN 'ACTIVE'
                ELSE 'RETURNED'
            END) AS loan_status,
            COALESCE(NULLIF(l.counterparty_name, ''), l.borrower_name) AS counterparty_name,
            l.counterparty_contact, l.counterparty_note, l.grams_out, l.lent_note, l.lent_at,
            l.expected_return_at, l.returned_at, l.returned_grams, l.consumed_grams, l.return_note,
            s.status, s.remaining_g, s.spool_tare_weight_g,
            m.material, m.filament_name, m.color_name, m.vendor, m.hex_color
         FROM spool_loans l
         LEFT JOIN filament_spools s ON s.id = l.spool_id
         LEFT JOIN filament_master_list m ON m.id = s.master_id
         WHERE {}
           AND {}
         ORDER BY l.lent_at DESC
         LIMIT ?1",
        direction_clause, status_clause
    ))?;

    let rows = stmt.query_map(params![limit], |row| {
        Ok(SpoolLoanDetailsRow {
            loan: SpoolLoanRow {
                id: row.get(0)?,
                spool_id: row.get(1)?,
                borrower_name: row.get(2)?,
                loan_direction: row.get(3)?,
                loan_status: row.get(4)?,
                counterparty_name: row.get(5)?,
                counterparty_contact: row.get(6)?,
                counterparty_note: row.get(7)?,
                grams_out: row.get(8)?,
                lent_note: row.get(9)?,
                lent_at: row.get(10)?,
                expected_return_at: row.get(11)?,
                returned_at: row.get(12)?,
                returned_grams: row.get(13)?,
                consumed_grams: row.get(14)?,
                return_note: row.get(15)?,
            },
            spool_status: row.get(16)?,
            spool_remaining_g: row.get(17)?,
            spool_tare_weight_g: row.get(18)?,
            material: row.get(19)?,
            filament_name: row.get(20)?,
            color_name: row.get(21)?,
            vendor: row.get(22)?,
            hex_color: row.get(23)?,
        })
    })?;

    let mut output = Vec::new();
    for row in rows {
        output.push(row?);
    }
    Ok(output)
}
