use super::{
    apply_tray_match_status, merge_tray_payload, should_auto_clear_live_color_replacement,
    should_auto_clear_live_unknown_replacement, slot_override_matches_live_unknown,
};
use crate::backend::filament_database::{
    BambuLiveObservedTrayRow, FilamentMasterSummary, PrinterAmsSlotRow, PrinterOverviewRow,
    PrinterRow, PrinterUsageRow, SpoolRow, SpoolWithMasterRow,
};
use std::io::Cursor;

fn make_slot() -> PrinterAmsSlotRow {
    PrinterAmsSlotRow {
        slot_id: "slot_1".to_string(),
        ams_id: "printer_1_ams_1".to_string(),
        slot_index: 1,
        spool_id: Some("spool_1".to_string()),
        spool_status: Some("ASSIGNED".to_string()),
        spool_ownership_type: Some("OWNED".to_string()),
        spool_owner_name: None,
        spool_remaining_g: Some(700),
        spool_rfid_tag: None,
        spool_material: Some("PLA".to_string()),
        spool_filament_name: Some("Basic".to_string()),
        spool_color_name: Some("Red".to_string()),
        spool_hex_color: Some("#FF0000".to_string()),
        rfid_override_tray_uuid: None,
        rfid_override_color_hex: None,
        live_cache_cleared_at: None,
        live_loaded: None,
        live_observed_rfid_tag: None,
        live_tray_uuid: None,
        live_chip_id: None,
        live_tray_info_idx: None,
        live_tray_id_name: None,
        live_filament_type: None,
        live_filament_name: None,
        live_color_hex: None,
        live_tray_weight_g: None,
        live_remaining_percent: None,
        live_last_identity_seen_at: None,
        live_match_status: None,
        live_match_note: None,
        live_matched_inventory_spool_id: None,
        live_matched_inventory_mode: None,
        live_is_active: None,
        live_printer_last_seen_at: None,
        live_mqtt_connected: None,
        live_ams_read_done_bits: None,
        live_ams_bambu_bits: None,
    }
}

fn make_tray() -> BambuLiveObservedTrayRow {
    BambuLiveObservedTrayRow {
        tray_index: 0,
        loaded: true,
        filament_type: Some("PLA".to_string()),
        filament_name: Some("Basic".to_string()),
        color_hex: Some("#00FF00".to_string()),
        tray_weight_g: Some(1000),
        remaining_percent: Some(80),
        remaining_grams: Some(800),
        observed_rfid_tag: Some("legacy".to_string()),
        tray_uuid: Some("tray-uuid-unknown".to_string()),
        chip_id: Some("chip".to_string()),
        tray_info_idx: None,
        tray_id_name: None,
        last_identity_seen_at: Some("2026-04-15T10:00:00Z".to_string()),
        last_empty_seen_at: None,
        empty_observation_count: Some(0),
        matched_inventory_spool_id: None,
        matched_inventory_mode: None,
        match_status: None,
        match_note: None,
    }
}

fn make_overview(slot: PrinterAmsSlotRow) -> PrinterOverviewRow {
    PrinterOverviewRow {
        printer: PrinterRow {
            id: "printer_1".to_string(),
            model: "P1S".to_string(),
            name: "Printer 1".to_string(),
            created_at: "2026-04-15 10:00:00".to_string(),
            updated_at: "2026-04-15 10:00:00".to_string(),
        },
        usage: PrinterUsageRow {
            total_jobs: 0,
            successful_jobs: 0,
            failed_jobs: 0,
            total_used_g: 0,
            last_job_at: None,
        },
        slots: vec![slot],
    }
}

fn make_inventory_spool(id: &str, rfid_tag: Option<&str>) -> SpoolWithMasterRow {
    SpoolWithMasterRow {
        spool: SpoolRow {
            id: id.to_string(),
            master_id: "master_1".to_string(),
            qr_code: None,
            rfid_tag: rfid_tag.map(str::to_string),
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(1000),
            remaining_g: Some(1000),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        },
        master: FilamentMasterSummary {
            id: "master_1".to_string(),
            material: "PLA".to_string(),
            filament_name: "Basic".to_string(),
            color_name: "Red".to_string(),
            hex_color: Some("#FF0000".to_string()),
            product_url: None,
            default_weight: 1000,
            vendor: "Generic".to_string(),
        },
    }
}

#[test]
fn apply_tray_match_status_marks_loaded_unknown_rfid_even_with_metadata_match() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut tray = make_tray();

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", None)],
    );

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn unknown_rfid_replacement_clears_on_new_unknown_identity_and_respects_override() {
    let mut slot = make_slot();
    let tray = BambuLiveObservedTrayRow {
        match_status: Some("unknown_rfid".to_string()),
        ..make_tray()
    };

    assert!(should_auto_clear_live_unknown_replacement(&tray, &slot));

    slot.rfid_override_tray_uuid = Some("tray-uuid-unknown".to_string());
    slot.rfid_override_color_hex = Some("#00FF00".to_string());

    assert!(slot_override_matches_live_unknown(
        &slot,
        "tray-uuid-unknown",
        "#00FF00"
    ));
    assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));
}

#[test]
fn unknown_rfid_replacement_does_not_clear_same_identity_or_missing_color_signal() {
    let mut slot = make_slot();
    let tray = BambuLiveObservedTrayRow {
        match_status: Some("unknown_rfid".to_string()),
        ..make_tray()
    };

    slot.spool_rfid_tag = Some("tray-uuid-unknown".to_string());
    assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));

    let missing_color = BambuLiveObservedTrayRow {
        color_hex: None,
        ..tray
    };
    let mut different_unknown_without_saved_rfid = make_slot();
    different_unknown_without_saved_rfid.spool_rfid_tag = None;
    assert!(!should_auto_clear_live_unknown_replacement(
        &missing_color,
        &different_unknown_without_saved_rfid
    ));
}

#[test]
fn color_replacement_without_rfid_clears_when_new_color_arrives() {
    let slot = make_slot();
    let tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: None,
        tray_uuid: None,
        color_hex: Some("#FFFF00".to_string()),
        match_status: Some("no_clear_match".to_string()),
        ..make_tray()
    };
    assert!(should_auto_clear_live_color_replacement(
        &tray,
        Some("#00FF00"),
        &slot
    ));
}

#[test]
fn color_replacement_without_rfid_does_not_clear_same_missing_or_rfid_color() {
    let slot = make_slot();
    let same_color_tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: None,
        tray_uuid: None,
        color_hex: Some("#FF0000".to_string()),
        ..make_tray()
    };
    assert!(!should_auto_clear_live_color_replacement(
        &same_color_tray,
        Some("#FF0000"),
        &slot
    ));

    let missing_color_tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: None,
        tray_uuid: None,
        color_hex: None,
        ..make_tray()
    };
    assert!(!should_auto_clear_live_color_replacement(
        &missing_color_tray,
        Some("#FF0000"),
        &slot
    ));

    let rfid_tray = BambuLiveObservedTrayRow {
        tray_uuid: Some("real-rfid".to_string()),
        color_hex: Some("#FFFF00".to_string()),
        ..make_tray()
    };
    assert!(!should_auto_clear_live_color_replacement(
        &rfid_tray,
        Some("#FF0000"),
        &slot
    ));

    assert!(!should_auto_clear_live_color_replacement(
        &same_color_tray,
        None,
        &slot
    ));
}

#[test]
fn manual_clear_blocks_stale_live_identity_until_newer_mqtt_arrives() {
    assert!(super::live_identity_is_blocked_by_manual_clear(
        Some("2026-04-15T10:00:00Z"),
        Some("2026-04-15 10:00:00")
    ));
    assert!(super::live_identity_is_blocked_by_manual_clear(
        None,
        Some("2026-04-15 10:00:00")
    ));
    assert!(!super::live_identity_is_blocked_by_manual_clear(
        Some("2026-04-15T10:00:01Z"),
        Some("2026-04-15 10:00:00")
    ));
}

#[test]
fn read_mqtt_packet_rejects_oversized_remaining_length_varints() {
    let mut stream = Cursor::new(vec![0x30, 0x80, 0x80, 0x80, 0x80, 0x00]);

    let error = super::read_mqtt_packet(&mut stream)
        .expect_err("MQTT remaining length must not exceed four bytes");

    assert!(
        error.contains("exceeds 4 bytes"),
        "unexpected error: {error}"
    );
}

#[test]
fn read_mqtt_packet_reads_valid_payload() {
    let mut stream = Cursor::new(vec![0x30, 0x03, b'a', b'b', b'c']);

    let (packet_type, payload) =
        super::read_mqtt_packet(&mut stream).expect("valid MQTT packet should parse");

    assert_eq!(packet_type, 0x30);
    assert_eq!(payload, b"abc");
}

#[test]
fn id_only_tray_payload_marks_empty_and_clears_on_first_observation() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": "2"
    });

    let merged = merge_tray_payload(Some(&previous), 2, &payload, "2026-04-16T15:14:10Z");

    assert!(!merged.loaded);
    assert!(merged.tray_uuid.is_none());
    assert!(merged.observed_rfid_tag.is_none());
    assert_eq!(merged.empty_observation_count, Some(1));
    assert!(super::should_auto_clear_live_slot(&merged));
}

#[test]
fn id_only_tray_payload_clears_stale_live_metadata() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": "2"
    });

    let merged = merge_tray_payload(Some(&previous), 2, &payload, "2026-04-16T15:14:10Z");

    assert!(merged.color_hex.is_none());
    assert!(merged.filament_type.is_none());
    assert!(merged.filament_name.is_none());
}

#[test]
fn merge_print_payload_accepts_top_level_ams_payload() {
    let mut state = super::default_offline_state();
    state.online = true;
    state.mqtt_connected = true;
    state.last_seen_at = Some("2026-04-16T17:29:03Z".to_string());
    let payload = serde_json::json!({
        "ams": {
            "ams": [
                {
                    "id": "0",
                    "tray": [
                        { "id": "0" },
                        {
                            "id": "1",
                            "tray_color": "F7E6DEFF",
                            "tray_weight": "1000",
                            "tray_type": "PLA",
                            "tray_sub_brands": "PLA Basic",
                            "tray_uuid": "F5993C11FBCC470BBACFCBA4344280B5"
                        }
                    ]
                }
            ]
        },
        "bed_temper": 22.6875,
        "command": "push_status",
        "msg": 1,
        "sequence_id": "57491"
    });

    super::merge_print_payload(&mut state, &payload);

    assert_eq!(state.bed_temp_c, Some(22.6875));
    assert_eq!(state.trays.len(), 2);
    assert!(!state.trays[0].loaded);
    assert_eq!(
        state.trays[1].tray_uuid.as_deref(),
        Some("F5993C11FBCC470BBACFCBA4344280B5")
    );
    assert_eq!(state.trays[1].tray_weight_g, Some(1000));
}

#[test]
fn merge_tray_payload_derives_remaining_grams_from_tray_weight() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": 0,
        "tray_type": "PLA",
        "tray_sub_brands": "Support for PLA",
        "tray_color": "FFFFFFFF",
        "tray_weight": "250",
        "remain": 33
    });

    let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:05:00Z");

    assert_eq!(merged.tray_weight_g, Some(250));
    assert_eq!(merged.remaining_percent, Some(33));
    assert_eq!(merged.remaining_grams, Some(83));
}

#[test]
fn merge_tray_payload_clears_stale_rfid_identity_on_new_non_rfid_observation() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": 0,
        "tray_type": "PLA",
        "tray_sub_brands": "eSUN PLA+"
    });

    let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:00:00Z");

    assert!(merged.loaded);
    assert_eq!(merged.filament_name.as_deref(), Some("eSUN PLA+"));
    assert!(merged.tray_uuid.is_none());
    assert!(merged.observed_rfid_tag.is_none());
    assert!(merged.last_identity_seen_at.is_none());
    assert!(merged.matched_inventory_spool_id.is_none());
    assert!(merged.matched_inventory_mode.is_none());
    assert!(merged.match_status.is_none());
}

#[test]
fn merge_tray_payload_keeps_exact_rfid_identity_on_partial_same_metadata_update() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": 0,
        "tray_type": "PLA",
        "tray_sub_brands": "Basic",
        "tray_color": "00FF00FF"
    });

    let merged = merge_tray_payload(Some(&previous), 0, &payload, "2026-04-16T14:05:00Z");

    assert!(merged.loaded);
    assert_eq!(merged.tray_uuid.as_deref(), Some("tray-uuid-unknown"));
    assert_eq!(
        merged.last_identity_seen_at.as_deref(),
        previous.last_identity_seen_at.as_deref()
    );
}

#[test]
fn merge_tray_snapshots_allows_empty_update_to_clear_loaded_state() {
    let previous = make_tray();
    let next = BambuLiveObservedTrayRow {
        loaded: false,
        observed_rfid_tag: None,
        tray_uuid: None,
        chip_id: None,
        tray_info_idx: None,
        tray_id_name: None,
        last_identity_seen_at: None,
        last_empty_seen_at: Some("2026-04-16T14:10:00Z".to_string()),
        empty_observation_count: Some(2),
        matched_inventory_spool_id: None,
        matched_inventory_mode: None,
        match_status: None,
        match_note: None,
        ..make_tray()
    };

    let merged = super::merge_tray_snapshots(&[previous], &[next]);

    assert_eq!(merged.len(), 1);
    assert!(!merged[0].loaded);
    assert!(merged[0].tray_uuid.is_none());
}
