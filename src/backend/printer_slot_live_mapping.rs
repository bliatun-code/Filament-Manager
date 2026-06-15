pub fn is_external_slot_id(ams_id: &str) -> bool {
    ams_id.trim().to_lowercase().ends_with("_ext")
}

pub fn parse_internal_ams_unit_index(ams_id: &str) -> Option<i64> {
    let normalized = ams_id.trim().to_lowercase();
    let (_, suffix) = normalized.rsplit_once("_ams_")?;
    let value = suffix.parse::<i64>().ok()?;
    (value > 0).then_some(value)
}

pub fn supports_flat_bambu_live_tray(ams_id: &str) -> bool {
    !is_external_slot_id(ams_id) && parse_internal_ams_unit_index(ams_id).unwrap_or(1) == 1
}

pub fn flat_bambu_live_slot_matches_tray(ams_id: &str, slot_index: i64, tray_index: i64) -> bool {
    supports_flat_bambu_live_tray(ams_id) && slot_index == tray_index + 1
}

pub fn decode_bambu_tray_coordinate(raw_tray_index: i64) -> (Option<i64>, Option<i64>) {
    if raw_tray_index == 255 || raw_tray_index == 254 {
        return (None, Some(raw_tray_index));
    }
    if (0x80..=0x87).contains(&raw_tray_index) {
        return (Some(raw_tray_index), Some(raw_tray_index & 0x3));
    }
    (Some(raw_tray_index >> 2), Some(raw_tray_index & 0x3))
}

pub fn bambu_live_active_tray_matches_slot(
    ams_id: &str,
    slot_index: i64,
    active_ams_index: Option<i64>,
    active_tray_index: Option<i64>,
) -> bool {
    if is_external_slot_id(ams_id) {
        return matches!(active_tray_index, Some(255 | 254));
    }
    if let (Some(active_ams_index), Some(active_tray_index)) = (active_ams_index, active_tray_index)
    {
        return parse_internal_ams_unit_index(ams_id)
            .is_some_and(|unit_index| unit_index == active_ams_index + 1)
            && slot_index == active_tray_index + 1;
    }
    active_tray_index
        .map(|tray_index| flat_bambu_live_slot_matches_tray(ams_id, slot_index, tray_index))
        .unwrap_or(false)
}

pub fn bambu_live_slot_matches_tray(
    ams_id: &str,
    slot_index: i64,
    tray_ams_index: Option<i64>,
    tray_index: i64,
) -> bool {
    if let Some(tray_ams_index) = tray_ams_index {
        return parse_internal_ams_unit_index(ams_id)
            .is_some_and(|unit_index| unit_index == tray_ams_index + 1)
            && slot_index == tray_index + 1;
    }
    flat_bambu_live_slot_matches_tray(ams_id, slot_index, tray_index)
}

#[cfg(test)]
mod tests {
    use super::{
        bambu_live_active_tray_matches_slot, bambu_live_slot_matches_tray,
        decode_bambu_tray_coordinate, flat_bambu_live_slot_matches_tray, is_external_slot_id,
        parse_internal_ams_unit_index, supports_flat_bambu_live_tray,
    };

    #[test]
    fn flat_bambu_live_mapping_is_limited_to_first_internal_ams() {
        assert!(is_external_slot_id("printer_1_ext"));
        assert_eq!(parse_internal_ams_unit_index("printer_1_ams_1"), Some(1));
        assert_eq!(parse_internal_ams_unit_index("PRINTER_1_AMS_1"), Some(1));
        assert_eq!(parse_internal_ams_unit_index("printer_1_ams_2"), Some(2));
        assert!(supports_flat_bambu_live_tray("printer_1_ams_1"));
        assert!(!supports_flat_bambu_live_tray("printer_1_ams_2"));
        assert!(!supports_flat_bambu_live_tray("printer_1_ext"));
        assert!(flat_bambu_live_slot_matches_tray("printer_1_ams_1", 1, 0));
        assert!(!flat_bambu_live_slot_matches_tray("printer_1_ams_2", 1, 0));
        assert!(bambu_live_slot_matches_tray(
            "printer_1_ams_2",
            1,
            Some(1),
            0
        ));
        assert!(!bambu_live_slot_matches_tray(
            "printer_1_ams_1",
            1,
            Some(1),
            0
        ));
        assert!(bambu_live_slot_matches_tray("printer_1_ams_1", 1, None, 0));
        assert_eq!(decode_bambu_tray_coordinate(4), (Some(1), Some(0)));
        assert_eq!(decode_bambu_tray_coordinate(255), (None, Some(255)));
        assert!(bambu_live_active_tray_matches_slot(
            "printer_1_ams_2",
            1,
            Some(1),
            Some(0)
        ));
        assert!(!bambu_live_active_tray_matches_slot(
            "printer_1_ams_1",
            1,
            Some(1),
            Some(0)
        ));
    }
}
