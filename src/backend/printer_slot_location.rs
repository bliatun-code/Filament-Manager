const PRINTER_SLOT_LOCATION_PREFIX: &str = "Printer:";

pub(crate) const PRINTER_SLOT_LOCATION_PREDICATE_SQL: &str =
    "location_id LIKE 'Printer:%:%' AND location_id NOT LIKE 'Printer::%' AND substr(location_id, length(location_id), 1) != ':'";

pub(crate) fn format_printer_slot_location(printer_name: &str, slot_id: &str) -> String {
    format!(
        "{PRINTER_SLOT_LOCATION_PREFIX}{}:{}",
        printer_name.trim(),
        slot_id.trim()
    )
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PrinterSlotLocation {
    pub printer_name: String,
    pub slot_id: String,
}

pub(crate) fn parse_printer_slot_location(value: &str) -> Option<PrinterSlotLocation> {
    let location = value.trim();
    if !location.starts_with(PRINTER_SLOT_LOCATION_PREFIX) {
        return None;
    }

    let payload = &location[PRINTER_SLOT_LOCATION_PREFIX.len()..];
    let separator_index = payload.rfind(':')?;
    let printer_name = payload[..separator_index].trim();
    let slot_id = payload[separator_index + 1..].trim();
    if printer_name.is_empty() || slot_id.is_empty() {
        return None;
    }

    Some(PrinterSlotLocation {
        printer_name: printer_name.to_string(),
        slot_id: slot_id.to_string(),
    })
}

pub(crate) fn is_printer_slot_location(value: &str) -> bool {
    parse_printer_slot_location(value).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::{params, Connection};

    fn sql_predicate_matches(value: Option<&str>) -> bool {
        let conn = Connection::open_in_memory().expect("open memory db");
        conn.execute("CREATE TABLE placement (location_id TEXT)", [])
            .expect("create placement table");
        conn.execute(
            "INSERT INTO placement (location_id) VALUES (?1)",
            params![value],
        )
        .expect("insert placement row");
        let sql = format!(
            "SELECT CASE WHEN {PRINTER_SLOT_LOCATION_PREDICATE_SQL} THEN 1 ELSE 0 END FROM placement"
        );
        let matched: i64 = conn
            .query_row(&sql, [], |row| row.get(0))
            .expect("query placement predicate");
        matched == 1
    }

    #[test]
    fn formats_printer_slot_location_contract() {
        assert_eq!(
            format_printer_slot_location("Brutus", "printer_1_ams_1_slot_2"),
            "Printer:Brutus:printer_1_ams_1_slot_2"
        );
        assert_eq!(
            format_printer_slot_location(" Lab:North ", " ams_1_slot_2 "),
            "Printer:Lab:North:ams_1_slot_2"
        );
    }

    #[test]
    fn parses_printer_slot_location_with_rightmost_separator() {
        assert_eq!(
            parse_printer_slot_location("Printer:Lab:North:ams_1_slot_2"),
            Some(PrinterSlotLocation {
                printer_name: "Lab:North".to_string(),
                slot_id: "ams_1_slot_2".to_string(),
            })
        );
        assert_eq!(parse_printer_slot_location("Shelf A"), None);
        assert_eq!(parse_printer_slot_location("Printer:MissingSlot"), None);
        assert_eq!(parse_printer_slot_location("Printer:Brutus:"), None);
        assert_eq!(parse_printer_slot_location("Printer::ams_1_slot_2"), None);
    }

    #[test]
    fn printer_slot_location_predicate_matches_stored_prefix() {
        assert!(format_printer_slot_location("Brutus", "slot_1")
            .starts_with(PRINTER_SLOT_LOCATION_PREFIX));
        assert!(
            sql_predicate_matches(Some("Printer:Brutus:slot_1")),
            "SQL predicate must continue matching formatted printer-slot locations"
        );
        assert!(sql_predicate_matches(Some("Printer:Lab:North:slot_1")));
        assert!(!sql_predicate_matches(Some("Printer:MissingSlot")));
        assert!(!sql_predicate_matches(Some("Printer:Brutus:")));
        assert!(!sql_predicate_matches(Some("Printer::slot_1")));
        assert!(!sql_predicate_matches(Some("Shelf A")));
        assert!(!sql_predicate_matches(None));
    }
}
