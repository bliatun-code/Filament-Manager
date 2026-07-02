const PRINTER_SLOT_LOCATION_PREFIX: &str = "Printer:";

pub(crate) const PRINTER_SLOT_LOCATION_PREDICATE_SQL: &str = "location_id LIKE 'Printer:%'";

pub(crate) fn format_printer_slot_location(printer_name: &str, slot_id: &str) -> String {
    format!("{PRINTER_SLOT_LOCATION_PREFIX}{printer_name}:{slot_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_printer_slot_location_contract() {
        assert_eq!(
            format_printer_slot_location("Brutus", "printer_1_ams_1_slot_2"),
            "Printer:Brutus:printer_1_ams_1_slot_2"
        );
    }

    #[test]
    fn printer_slot_location_predicate_matches_stored_prefix() {
        assert!(format_printer_slot_location("Brutus", "slot_1")
            .starts_with(PRINTER_SLOT_LOCATION_PREFIX));
        assert!(
            PRINTER_SLOT_LOCATION_PREDICATE_SQL.contains("'Printer:%'"),
            "SQL predicate must continue matching formatted printer-slot locations"
        );
    }
}
