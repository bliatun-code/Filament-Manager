use rusqlite::Row;

use super::database_loan_models::{ActiveSpoolLoanRow, SpoolLoanRow};
use super::database_spool_models::{SpoolRow, SpoolWithMasterRow};
use super::database_trusted_lan_models::TrustedLanPairedBrowserRow;
use super::filament_master_models::FilamentMasterSummary;
use super::inventory_domain::{LoanDirection, LoanStatus};

pub(crate) fn map_spool_row(row: &Row<'_>) -> Result<SpoolRow, rusqlite::Error> {
    Ok(SpoolRow {
        id: row.get(0)?,
        master_id: row.get(1)?,
        qr_code: row.get(2)?,
        status: row.get(3)?,
        ownership_type: row.get(4)?,
        owner_name: row.get(5)?,
        owner_contact: row.get(6)?,
        rfid_tag: row.get(7)?,
        rfid_observed_at: row.get(8)?,
        ownership_note: row.get(9)?,
        initial_weight_g: row.get(10)?,
        current_weight_g: row.get(11)?,
        remaining_g: row.get(12)?,
        spool_tare_weight_g: row.get(13)?,
        location_id: row.get(14)?,
        home_location_id: row.get(15)?,
        purchase_date: row.get(16)?,
        purchase_price: row.get(17)?,
        batch_code: row.get(18)?,
        last_used_at: row.get(19)?,
    })
}

pub(crate) fn map_spool_with_master_row(
    row: &Row<'_>,
) -> Result<SpoolWithMasterRow, rusqlite::Error> {
    let spool = map_spool_row(row)?;
    let master = FilamentMasterSummary {
        id: row.get(20)?,
        material: row.get(21)?,
        filament_name: row.get(22)?,
        color_name: row.get(23)?,
        hex_color: row.get(24)?,
        product_url: row.get(25)?,
        default_weight: row.get(26)?,
        vendor: row.get(27)?,
    };
    Ok(SpoolWithMasterRow { spool, master })
}

pub(crate) fn map_trusted_lan_paired_browser_row(
    row: &Row<'_>,
) -> Result<TrustedLanPairedBrowserRow, rusqlite::Error> {
    Ok(TrustedLanPairedBrowserRow {
        id: row.get(0)?,
        display_name: row.get(1)?,
        paired_at: row.get(2)?,
        last_seen_at: row.get(3)?,
        last_origin: row.get(4)?,
        revoked_at: row.get(5)?,
    })
}

pub(crate) fn map_spool_loan_row(row: &Row<'_>) -> Result<SpoolLoanRow, rusqlite::Error> {
    let loan_direction_raw: String = row.get(3)?;
    let loan_status_raw: String = row.get(4)?;
    let returned_at: Option<String> = row.get(12)?;
    Ok(SpoolLoanRow {
        id: row.get(0)?,
        spool_id: row.get(1)?,
        borrower_name: row.get(2)?,
        loan_direction: LoanDirection::from_raw(Some(&loan_direction_raw))
            .as_str()
            .to_string(),
        loan_status: LoanStatus::from_raw(Some(&loan_status_raw), returned_at.as_deref())
            .as_str()
            .to_string(),
        counterparty_name: row.get(5)?,
        counterparty_contact: row.get(6)?,
        counterparty_note: row.get(7)?,
        grams_out: row.get(8)?,
        lent_note: row.get(9)?,
        lent_at: row.get(10)?,
        expected_return_at: row.get(11)?,
        returned_at,
        returned_grams: row.get(13)?,
        consumed_grams: row.get(14)?,
        return_note: row.get(15)?,
    })
}

pub(crate) fn map_active_spool_loan_row(
    row: &Row<'_>,
) -> Result<ActiveSpoolLoanRow, rusqlite::Error> {
    Ok(ActiveSpoolLoanRow {
        loan: map_spool_loan_row(row)?,
        spool_status: row.get(16)?,
        spool_remaining_g: row.get(17)?,
        material: row.get(19)?,
        filament_name: row.get(20)?,
        color_name: row.get(21)?,
        vendor: row.get(22)?,
        hex_color: row.get(23)?,
    })
}
