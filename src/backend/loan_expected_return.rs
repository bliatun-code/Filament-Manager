use time::{Date, Month};

use super::database_result::{InventoryError, InventoryResult};

pub const INVALID_EXPECTED_RETURN_DATE_CODE: &str = "loans.expected_return_invalid";

pub fn normalize_expected_return_date(value: Option<&str>) -> InventoryResult<Option<String>> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    if !is_valid_calendar_date(value) {
        return Err(InventoryError::InvalidOperation {
            code: INVALID_EXPECTED_RETURN_DATE_CODE,
            message: "expected_return_at must be a valid calendar date in YYYY-MM-DD format"
                .to_string(),
        });
    }

    Ok(Some(value.to_string()))
}

fn is_valid_calendar_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if bytes
        .iter()
        .enumerate()
        .any(|(index, byte)| index != 4 && index != 7 && !byte.is_ascii_digit())
    {
        return false;
    }

    let Ok(year) = value[0..4].parse::<i32>() else {
        return false;
    };
    let Ok(month_number) = value[5..7].parse::<u8>() else {
        return false;
    };
    let Ok(day) = value[8..10].parse::<u8>() else {
        return false;
    };
    let Ok(month) = Month::try_from(month_number) else {
        return false;
    };

    Date::from_calendar_date(year, month, day).is_ok()
}

#[cfg(test)]
mod tests {
    use super::normalize_expected_return_date;

    #[test]
    fn expected_return_date_is_trimmed_and_calendar_validated() {
        assert_eq!(
            normalize_expected_return_date(Some(" 2026-09-05 ")).expect("valid date"),
            Some("2026-09-05".to_string())
        );
        assert_eq!(
            normalize_expected_return_date(Some("  ")).expect("blank date"),
            None
        );

        for invalid in [
            "2026-02-29",
            "2026-13-01",
            "2026-9-05",
            "2026-09-05T00:00:00Z",
        ] {
            assert!(
                normalize_expected_return_date(Some(invalid)).is_err(),
                "{invalid} must be rejected"
            );
        }
    }
}
