use super::{is_live_print_running, merge_tray_payload};
use crate::backend::filament_database::{
    BambuLiveObservedTrayRow, FilamentDatabase, FilamentMasterSummary, ManualMasterInput,
    PrinterAmsSlotRow, PrinterOverviewRow, PrinterRow, PrinterUsageRow, SpoolRow,
    SpoolWithMasterRow,
};
use crate::bambu_live_sync::{
    apply_tray_match_status, classify_live_weight_update, live_identity_is_blocked_by_manual_clear,
    should_auto_clear_live_color_replacement, should_auto_clear_live_slot,
    should_auto_clear_live_unknown_replacement, slot_override_matches_live_unknown,
    tray_exist_bits_slot_present, LiveWeightDecision,
};
use serde_json::Value;
use std::io::Cursor;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

type LiveUsageSessionRow = (String, String, i64, Option<i64>, Option<String>);

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "filament-manager-bambu-live-{test_name}-{nanos}.db"
    ))
}

fn mqtt_attempt(address: &str, error: std::io::Error) -> (SocketAddr, std::io::Error) {
    (address.parse().expect("valid socket address"), error)
}

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
        live_nozzle_temp_min_c: None,
        live_nozzle_temp_max_c: None,
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
        live_progress_percent: None,
        live_remaining_minutes: None,
        live_nozzle_temp_c: None,
        live_bed_temp_c: None,
        live_ams_humidity_index: None,
        live_ams_temperature_c: None,
        live_printer_last_seen_at: None,
        live_mqtt_connected: None,
        live_ams_exist_bits: None,
        live_ams_read_done_bits: None,
        live_ams_bambu_bits: None,
    }
}

fn make_tray() -> BambuLiveObservedTrayRow {
    BambuLiveObservedTrayRow {
        ams_index: None,
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
        nozzle_temp_min_c: None,
        nozzle_temp_max_c: None,
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

fn make_inventory_spool_with_status(
    id: &str,
    rfid_tag: Option<&str>,
    status: &str,
) -> SpoolWithMasterRow {
    let mut row = make_inventory_spool(id, rfid_tag);
    row.spool.status = status.to_string();
    row
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
fn apply_tray_match_status_limits_flat_live_trays_to_first_ams() {
    let mut ams_1_slot = make_slot();
    ams_1_slot.spool_id = None;
    ams_1_slot.spool_material = None;
    ams_1_slot.spool_filament_name = None;
    ams_1_slot.spool_hex_color = None;
    let mut ams_2_slot = make_slot();
    ams_2_slot.slot_id = "slot_ams_2".to_string();
    ams_2_slot.ams_id = "printer_1_ams_2".to_string();
    ams_2_slot.spool_id = Some("spool_2".to_string());
    let overview = PrinterOverviewRow {
        slots: vec![ams_1_slot, ams_2_slot],
        ..make_overview(make_slot())
    };
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", None)],
    );

    assert_ne!(tray.match_status.as_deref(), Some("ambiguous"));
    assert_eq!(tray.match_status.as_deref(), Some("possible_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
}

#[test]
fn apply_tray_match_status_uses_observed_ams_index_for_configured_slot() {
    let mut ams_1_slot = make_slot();
    ams_1_slot.spool_id = None;
    ams_1_slot.spool_material = None;
    ams_1_slot.spool_filament_name = None;
    ams_1_slot.spool_hex_color = None;
    let mut ams_2_slot = make_slot();
    ams_2_slot.slot_id = "slot_ams_2".to_string();
    ams_2_slot.ams_id = "printer_1_ams_2".to_string();
    ams_2_slot.spool_id = Some("spool_2".to_string());
    let overview = PrinterOverviewRow {
        slots: vec![ams_1_slot, ams_2_slot],
        ..make_overview(make_slot())
    };
    let mut tray = BambuLiveObservedTrayRow {
        ams_index: Some(1),
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_2"));
}

#[test]
fn apply_tray_match_status_matches_configured_composite_swatch_color() {
    let mut slot = make_slot();
    slot.spool_material = Some("PETG".to_string());
    slot.spool_hex_color = Some("multi(#720062,#00FF00)".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn apply_tray_match_status_matches_configured_semicolon_composite_swatch_color() {
    let mut slot = make_slot();
    slot.spool_material = Some("PETG".to_string());
    slot.spool_hex_color = Some("Multi(#720062; #00FF00)".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn apply_tray_match_status_ignores_invalid_configured_composite_swatch_color() {
    let mut slot = make_slot();
    slot.spool_material = Some("PETG".to_string());
    slot.spool_hex_color = Some("multi(#00FF00,not-a-color)".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("no_clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), None);
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), None);
}

#[test]
fn apply_tray_match_status_matches_configured_short_bambu_series_name() {
    let mut slot = make_slot();
    slot.spool_filament_name = Some("PLA Basic".to_string());
    slot.spool_hex_color = Some("#FF0000".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        filament_name: Some("Basic".to_string()),
        color_hex: Some("#00FF00".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn apply_tray_match_status_ignores_generic_material_as_configured_name_match() {
    let mut slot = make_slot();
    slot.spool_filament_name = Some("PLA Basic".to_string());
    slot.spool_hex_color = Some("#FF0000".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        filament_name: Some("PLA".to_string()),
        color_hex: Some("#00FF00".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("no_clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), None);
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), None);
}

#[test]
fn apply_tray_match_status_keeps_short_distinctive_configured_name_match() {
    let mut slot = make_slot();
    slot.spool_material = Some("PETG".to_string());
    slot.spool_filament_name = Some("PETG HF".to_string());
    slot.spool_hex_color = Some("#FF0000".to_string());
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        filament_type: Some("PETG".to_string()),
        filament_name: Some("HF".to_string()),
        color_hex: Some("#00FF00".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn apply_tray_match_status_matches_inventory_composite_swatch_candidate() {
    let mut slot = make_slot();
    slot.spool_id = None;
    slot.spool_material = None;
    slot.spool_filament_name = None;
    slot.spool_hex_color = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        ..make_tray()
    };
    let mut candidate = make_inventory_spool("spool_multi", None);
    candidate.master.filament_name = "PLA Silk Multi-Color".to_string();
    candidate.master.hex_color = Some("gradient(#720062,#00FF00)".to_string());

    apply_tray_match_status(&mut tray, &overview, &[candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("possible_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("spool_multi")
    );
}

#[test]
fn apply_tray_match_status_matches_inventory_short_bambu_series_name() {
    let mut slot = make_slot();
    slot.spool_id = None;
    slot.spool_material = None;
    slot.spool_filament_name = None;
    slot.spool_hex_color = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        filament_name: Some("Basic".to_string()),
        color_hex: Some("#00FF00".to_string()),
        ..make_tray()
    };
    let mut candidate = make_inventory_spool("spool_basic", None);
    candidate.master.filament_name = "PLA Basic".to_string();
    candidate.master.hex_color = Some("#FF0000".to_string());

    apply_tray_match_status(&mut tray, &overview, &[candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("possible_match"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("spool_basic")
    );
}

#[test]
fn apply_tray_match_status_ignores_generic_material_as_inventory_name_match() {
    let mut slot = make_slot();
    slot.spool_id = None;
    slot.spool_material = None;
    slot.spool_filament_name = None;
    slot.spool_hex_color = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        filament_name: Some("PLA".to_string()),
        color_hex: Some("#00FF00".to_string()),
        ..make_tray()
    };
    let mut candidate = make_inventory_spool("spool_basic", None);
    candidate.master.filament_name = "PLA Basic".to_string();
    candidate.master.hex_color = Some("#FF0000".to_string());

    apply_tray_match_status(&mut tray, &overview, &[candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("no_clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), None);
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), None);
}

#[test]
fn apply_tray_match_status_mentions_tray_info_idx_as_preset_hint() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_info_idx: Some("GFSA00_04".to_string()),
        tray_id_name: Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string()),
        nozzle_temp_min_c: None,
        nozzle_temp_max_c: None,
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", None)],
    );

    let note = tray.match_note.as_deref().unwrap_or_default();
    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("configured_metadata")
    );
    assert!(note.contains("GFSA00_04"));
    assert!(note.contains("Bambu PLA Basic @BBL P1S 0.4 nozzle"));
    assert!(note.contains("Filament settings preset"));
    assert!(note.contains("material/settings hint"));
    assert!(note.contains("not a roll identity"));
}

#[test]
fn apply_tray_match_status_does_not_treat_tray_info_idx_as_rfid_identity() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: None,
        observed_rfid_tag: None,
        tray_info_idx: Some("GFSA00_04".to_string()),
        tray_id_name: Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string()),
        nozzle_temp_min_c: None,
        nozzle_temp_max_c: None,
        filament_type: Some("PETG".to_string()),
        filament_name: Some("HF".to_string()),
        color_hex: Some("#00AE42".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", Some("GFSA00_04"))],
    );

    assert_ne!(tray.matched_inventory_mode.as_deref(), Some("exact_rfid"));
    assert!(tray.matched_inventory_spool_id.is_none());
}

#[test]
fn apply_tray_match_status_keeps_exact_rfid_stronger_than_preset_signal() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: Some("real-rfid".to_string()),
        tray_info_idx: Some("GFSA00_04".to_string()),
        tray_id_name: Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string()),
        nozzle_temp_min_c: None,
        nozzle_temp_max_c: None,
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", Some("real-rfid"))],
    );

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), Some("exact_rfid"));
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("spool_1"));
}

#[test]
fn apply_tray_match_status_ignores_unavailable_exact_rfid_matches() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: Some("real-rfid".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[
            make_inventory_spool_with_status("lost", Some("real-rfid"), "LOST"),
            make_inventory_spool_with_status("missing", Some("real-rfid"), "MISSING"),
            make_inventory_spool_with_status("deleted", Some("real-rfid"), "DELETED"),
            make_inventory_spool_with_status("borrowed", Some("real-rfid"), "BORROWED"),
        ],
    );

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert!(tray.matched_inventory_spool_id.is_none());
    assert!(tray.matched_inventory_mode.is_none());
}

#[test]
fn apply_tray_match_status_keeps_empty_exact_rfid_matches_available_for_recovery() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: Some("real-rfid".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool_with_status(
            "empty",
            Some("real-rfid"),
            "EMPTY",
        )],
    );

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), Some("exact_rfid"));
    assert_eq!(tray.matched_inventory_spool_id.as_deref(), Some("empty"));
}

#[test]
fn apply_tray_match_status_ignores_unavailable_metadata_candidates() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = make_tray();

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[
            make_inventory_spool_with_status("empty", None, "EMPTY"),
            make_inventory_spool_with_status("lost", None, "LOST"),
            make_inventory_spool_with_status("missing", None, "MISSING"),
            make_inventory_spool_with_status("deleted", None, "DELETED"),
            make_inventory_spool_with_status("borrowed", None, "BORROWED"),
        ],
    );

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert!(tray.matched_inventory_spool_id.is_none());
    assert!(tray.matched_inventory_mode.is_none());
}

#[test]
fn apply_tray_match_status_ignores_saved_rfid_metadata_candidates_for_unknown_rfid() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = make_tray();

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("already_bound", Some("old-rfid"))],
    );

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert!(tray.matched_inventory_spool_id.is_none());
    assert!(tray.matched_inventory_mode.is_none());
}

#[test]
fn apply_tray_match_status_ignores_non_bambu_metadata_candidates_for_unknown_rfid() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = make_tray();
    let mut generic_candidate = make_inventory_spool("generic_match", None);
    generic_candidate.master.hex_color = Some("#00FF00".to_string());

    apply_tray_match_status(&mut tray, &overview, &[generic_candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert!(tray.matched_inventory_spool_id.is_none());
    assert!(tray.matched_inventory_mode.is_none());
}

#[test]
fn apply_tray_match_status_keeps_bambu_color_metadata_candidates_for_unknown_rfid() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = make_tray();
    let mut generic_candidate = make_inventory_spool("generic_match", None);
    generic_candidate.master.hex_color = Some("#00FF00".to_string());
    let mut bambu_color_mismatch = make_inventory_spool("bambu_wrong_color", None);
    bambu_color_mismatch.master.vendor = "Bambu".to_string();
    bambu_color_mismatch.master.hex_color = Some("#FF0000".to_string());
    let mut bambu_color_match = make_inventory_spool("bambu_green", None);
    bambu_color_match.master.vendor = "Bambu".to_string();
    bambu_color_match.master.hex_color = Some("#00FF00".to_string());

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[generic_candidate, bambu_color_mismatch, bambu_color_match],
    );

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("bambu_green")
    );
}

#[test]
fn apply_tray_match_status_keeps_bambu_name_metadata_candidates_without_color_for_unknown_rfid() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        filament_type: Some("PETG".to_string()),
        filament_name: Some("HF".to_string()),
        color_hex: None,
        ..make_tray()
    };
    let mut generic_candidate = make_inventory_spool("generic_petg_hf", None);
    generic_candidate.master.material = "PETG".to_string();
    generic_candidate.master.filament_name = "PETG HF".to_string();
    let mut bambu_candidate = make_inventory_spool("bambu_petg_hf", None);
    bambu_candidate.master.vendor = "Bambu".to_string();
    bambu_candidate.master.material = "PETG".to_string();
    bambu_candidate.master.filament_name = "PETG HF".to_string();

    apply_tray_match_status(&mut tray, &overview, &[generic_candidate, bambu_candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("bambu_petg_hf")
    );
}

#[test]
fn apply_tray_match_status_uses_tray_preset_name_for_unknown_rfid_inventory_hint() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        filament_type: None,
        filament_name: None,
        tray_id_name: Some("Bambu PLA Matte @BBL P1S 0.4 nozzle".to_string()),
        color_hex: Some("#000000".to_string()),
        ..make_tray()
    };
    let mut bambu_candidate = make_inventory_spool("bambu_black", None);
    bambu_candidate.master.vendor = "Bambu".to_string();
    bambu_candidate.master.filament_name = "PLA Matte".to_string();
    bambu_candidate.master.color_name = "Black".to_string();
    bambu_candidate.master.hex_color = Some("#000000".to_string());

    apply_tray_match_status(&mut tray, &overview, &[bambu_candidate]);

    assert_eq!(tray.match_status.as_deref(), Some("unknown_rfid"));
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("bambu_black")
    );
}

#[test]
fn apply_tray_match_status_keeps_saved_rfid_metadata_candidates_without_unknown_rfid() {
    let mut slot = make_slot();
    slot.spool_id = None;
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: None,
        tray_uuid: None,
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("already_bound", Some("old-rfid"))],
    );

    assert_eq!(tray.match_status.as_deref(), Some("possible_match"));
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("already_bound")
    );
    assert_eq!(
        tray.matched_inventory_mode.as_deref(),
        Some("inventory_metadata")
    );
}

#[test]
fn apply_tray_match_status_keeps_borrowed_in_exact_rfid_matches_available() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut borrowed_in = make_inventory_spool("borrowed_in", Some("real-rfid"));
    borrowed_in.spool.ownership_type = "BORROWED_IN".to_string();
    let mut tray = BambuLiveObservedTrayRow {
        tray_uuid: Some("real-rfid".to_string()),
        ..make_tray()
    };

    apply_tray_match_status(&mut tray, &overview, &[borrowed_in]);

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), Some("exact_rfid"));
    assert_eq!(
        tray.matched_inventory_spool_id.as_deref(),
        Some("borrowed_in")
    );
}

#[test]
fn apply_tray_match_status_uses_observed_tag_uid_when_tray_uuid_is_missing() {
    let slot = make_slot();
    let overview = make_overview(slot);
    let mut tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: Some("tag-uid-only".to_string()),
        tray_uuid: None,
        ..make_tray()
    };

    apply_tray_match_status(
        &mut tray,
        &overview,
        &[make_inventory_spool("spool_1", Some("tag-uid-only"))],
    );

    assert_eq!(tray.match_status.as_deref(), Some("clear_match"));
    assert_eq!(tray.matched_inventory_mode.as_deref(), Some("exact_rfid"));
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
fn unknown_rfid_replacement_uses_observed_tag_uid_when_tray_uuid_is_missing() {
    let mut slot = make_slot();
    let tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: Some("tag-uid-only".to_string()),
        tray_uuid: None,
        match_status: Some("unknown_rfid".to_string()),
        ..make_tray()
    };

    assert!(should_auto_clear_live_unknown_replacement(&tray, &slot));

    slot.spool_rfid_tag = Some("tag-uid-only".to_string());
    assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));

    slot.spool_rfid_tag = None;
    slot.rfid_override_tray_uuid = Some("tag-uid-only".to_string());
    slot.rfid_override_color_hex = Some("#00FF00".to_string());
    assert!(!should_auto_clear_live_unknown_replacement(&tray, &slot));
}

#[test]
fn unknown_rfid_replacement_keeps_override_for_configured_composite_swatch_color() {
    let mut slot = make_slot();
    slot.spool_hex_color = Some("multi(#00FF00,#FFFF00)".to_string());
    slot.rfid_override_tray_uuid = Some("tray-uuid-unknown".to_string());
    slot.rfid_override_color_hex = Some("#00FF00".to_string());
    let tray = BambuLiveObservedTrayRow {
        color_hex: Some("#FFFF00".to_string()),
        match_status: Some("unknown_rfid".to_string()),
        ..make_tray()
    };

    assert!(slot_override_matches_live_unknown(
        &slot,
        "tray-uuid-unknown",
        "#FFFF00"
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
fn color_replacement_without_rfid_keeps_configured_composite_swatch_color() {
    let mut slot = make_slot();
    slot.spool_hex_color = Some("multi(#00FF00,#FFFF00)".to_string());
    let tray = BambuLiveObservedTrayRow {
        observed_rfid_tag: None,
        tray_uuid: None,
        color_hex: Some("#FFFF00".to_string()),
        match_status: Some("no_clear_match".to_string()),
        ..make_tray()
    };

    assert!(!should_auto_clear_live_color_replacement(
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
    assert!(live_identity_is_blocked_by_manual_clear(
        Some("2026-04-15T10:00:00Z"),
        Some("2026-04-15 10:00:00")
    ));
    assert!(live_identity_is_blocked_by_manual_clear(
        None,
        Some("2026-04-15 10:00:00")
    ));
    assert!(!live_identity_is_blocked_by_manual_clear(
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

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        2,
        &payload,
        "2026-04-16T15:14:10Z",
        None,
    );

    assert!(!merged.loaded);
    assert!(merged.tray_uuid.is_none());
    assert!(merged.observed_rfid_tag.is_none());
    assert_eq!(merged.empty_observation_count, Some(1));
    assert!(should_auto_clear_live_slot(&merged, None));
}

#[test]
fn id_only_tray_payload_clears_stale_live_metadata() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": "2"
    });

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        2,
        &payload,
        "2026-04-16T15:14:10Z",
        None,
    );

    assert!(merged.color_hex.is_none());
    assert!(merged.filament_type.is_none());
    assert!(merged.filament_name.is_none());
}

#[test]
fn tag_uid_only_tray_payload_updates_last_identity_seen_at() {
    let payload = serde_json::json!({
        "id": "1",
        "tag_uid": "  93883E5B5ACA4A9B  ",
    });

    let merged = merge_tray_payload(
        None,
        Some(0),
        1,
        &payload,
        "2026-06-16T17:14:10Z",
        Some(true),
    );

    assert!(merged.loaded);
    assert_eq!(
        merged.observed_rfid_tag.as_deref(),
        Some("93883E5B5ACA4A9B")
    );
    assert!(merged.tray_uuid.is_none());
    assert_eq!(
        merged.last_identity_seen_at.as_deref(),
        Some("2026-06-16T17:14:10Z")
    );
}

#[test]
fn tray_exist_bits_reads_hex_slot_presence_bits() {
    assert_eq!(tray_exist_bits_slot_present(Some("e"), 0), Some(false));
    assert_eq!(tray_exist_bits_slot_present(Some("e"), 1), Some(true));
    assert_eq!(tray_exist_bits_slot_present(Some("0x3"), 0), Some(true));
    assert_eq!(tray_exist_bits_slot_present(Some("0x3"), 1), Some(true));
    assert_eq!(tray_exist_bits_slot_present(Some("0x3"), 2), Some(false));
    assert_eq!(tray_exist_bits_slot_present(Some("garbage"), 0), None);
    assert_eq!(tray_exist_bits_slot_present(None, 0), None);
}

#[test]
fn id_only_tray_payload_stays_loaded_when_exist_bits_say_present() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": "2"
    });

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        2,
        &payload,
        "2026-04-16T15:14:10Z",
        Some(true),
    );

    assert!(merged.loaded);
    assert_eq!(merged.empty_observation_count, Some(0));
    assert_eq!(merged.tray_uuid.as_deref(), Some("tray-uuid-unknown"));
    assert_eq!(merged.color_hex.as_deref(), Some("#00FF00"));
    assert!(!should_auto_clear_live_slot(&merged, Some(true)));
}

#[test]
fn stale_tray_payload_clears_when_exist_bits_say_empty() {
    let previous = make_tray();
    let payload = serde_json::json!({
        "id": "1",
        "tray_type": "PLA",
        "tray_sub_brands": "Basic",
        "tray_color": "00FF00FF",
        "tray_uuid": "tray-uuid-unknown",
        "remain": 0
    });

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        1,
        &payload,
        "2026-04-16T15:14:10Z",
        Some(false),
    );

    assert!(!merged.loaded);
    assert!(merged.tray_uuid.is_none());
    assert!(merged.observed_rfid_tag.is_none());
    assert_eq!(
        merged.last_empty_seen_at.as_deref(),
        Some("2026-04-16T15:14:10Z")
    );
    assert_eq!(merged.empty_observation_count, Some(1));
    assert!(should_auto_clear_live_slot(&merged, Some(false)));
}

#[test]
fn merge_print_payload_accepts_top_level_ams_payload() {
    let mut state = super::default_offline_state();
    state.online = true;
    state.mqtt_connected = true;
    state.last_seen_at = Some("2026-04-16T17:29:03Z".to_string());
    let payload = serde_json::json!({
        "ams": {
            "tray_now": "4",
            "ams": [
                {
                    "id": "0",
                    "humidity": "1",
                    "temp": "38.1",
                    "tray": [
                        { "id": "0" },
                        {
                            "id": "1",
                            "nozzle_temp_max": "240",
                            "nozzle_temp_min": "190",
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
    assert_eq!(state.ams_humidity_index, Some(1));
    assert_eq!(state.ams_temperature_c, Some(38.1));
    assert_eq!(state.trays.len(), 2);
    assert_eq!(state.active_ams_index, Some(1));
    assert_eq!(state.active_tray_index, Some(0));
    assert!(!state.trays[0].loaded);
    assert_eq!(
        state.trays[1].tray_uuid.as_deref(),
        Some("F5993C11FBCC470BBACFCBA4344280B5")
    );
    assert_eq!(state.trays[1].tray_weight_g, Some(1000));
    assert_eq!(state.trays[1].nozzle_temp_min_c, Some(190.0));
    assert_eq!(state.trays[1].nozzle_temp_max_c, Some(240.0));
}

#[test]
fn merge_print_payload_rejects_impossible_ams_air_temperature() {
    let mut state = super::default_offline_state();
    state.ams_temperature_c = Some(38.1);
    let payload = serde_json::json!({
        "ams": {
            "ams": [
                {
                    "id": "0",
                    "humidity": "1",
                    "temp": "134.7",
                    "tray": []
                }
            ]
        }
    });

    super::merge_print_payload(&mut state, &payload);

    assert_eq!(state.ams_humidity_index, Some(1));
    assert_eq!(state.ams_temperature_c, None);
}

#[test]
fn merge_idle_observation_does_not_carry_impossible_ams_air_temperature() {
    let mut previous = super::default_offline_state();
    previous.ams_temperature_c = Some(134.7);
    let next = super::default_offline_state();

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.ams_temperature_c, None);
}

#[test]
fn merge_idle_observation_does_not_carry_stale_connection_error() {
    let mut previous = super::default_offline_state();
    previous.online = false;
    previous.mqtt_connected = false;
    previous.raw_status_note =
        Some("failed to connect to printer MQTT: No route to host".to_string());

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.last_seen_at = Some("2026-06-23T01:43:00Z".to_string());
    next.progress_percent = Some(63);

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.raw_status_note, None);
}

#[test]
fn mqtt_connect_error_explains_probable_macos_local_network_block() {
    let attempts = vec![
        mqtt_attempt("[fe80::1]:8883", std::io::Error::from_raw_os_error(65)),
        mqtt_attempt("192.168.86.22:8883", std::io::Error::from_raw_os_error(65)),
    ];
    let message = super::format_mqtt_connect_errors_for_platform(&attempts, true);

    assert!(message.starts_with("failed to connect to printer MQTT on all 2 resolved addresses:"));
    assert!(message.contains("[fe80::1]:8883"));
    assert!(message.contains("192.168.86.22:8883"));
    assert!(message.contains("Local Network access"));
    assert!(message.contains("System Settings > Privacy & Security > Local Network"));
}

#[test]
fn mqtt_connect_error_keeps_plain_socket_message_outside_macos() {
    let attempts = vec![mqtt_attempt(
        "192.168.86.22:8883",
        std::io::Error::from_raw_os_error(65),
    )];
    let message = super::format_mqtt_connect_errors_for_platform(&attempts, false);

    assert!(message.starts_with("failed to connect to printer MQTT at 192.168.86.22:8883:"));
    assert!(message.contains("No route to host") || message.contains("os error 65"));
    assert!(!message.contains("Local Network access"));
}

#[test]
fn mqtt_connect_error_avoids_local_network_hint_for_mixed_failures() {
    let attempts = vec![
        mqtt_attempt("[fe80::1]:8883", std::io::Error::from_raw_os_error(65)),
        mqtt_attempt(
            "192.168.86.22:8883",
            std::io::Error::new(std::io::ErrorKind::ConnectionRefused, "connection refused"),
        ),
    ];
    let message = super::format_mqtt_connect_errors_for_platform(&attempts, true);

    assert!(message.contains("all 2 resolved addresses"));
    assert!(message.contains("connection refused"));
    assert!(!message.contains("Local Network access"));
}

#[test]
fn merge_idle_observation_drops_carried_progress_when_cancelled_print_goes_cold() {
    let mut previous = super::default_offline_state();
    previous.online = true;
    previous.mqtt_connected = true;
    previous.last_seen_at = Some("2026-06-17T17:09:55Z".to_string());
    previous.gcode_state = Some("RUNNING".to_string());
    previous.print_type = Some("cloud".to_string());
    previous.subtask_id = Some("1028380749".to_string());
    previous.subtask_name = Some("0.16mm layer, 2 walls, 13% infill".to_string());
    previous.progress_percent = Some(41);
    previous.remaining_minutes = Some(25);
    previous.active_ams_index = Some(0);
    previous.active_tray_index = Some(3);
    previous.nozzle_temp_c = Some(220.0);

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.last_seen_at = Some("2026-06-17T17:11:05Z".to_string());
    next.nozzle_temp_c = Some(44.0);
    next.bed_temp_c = Some(44.0);
    next.raw_payload_json = Some(serde_json::json!({
        "_bfm_observed_fields": {
            "nozzle_temper_at": "2026-06-17T17:11:05Z"
        },
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "job_state_code": null,
            "print_type": null,
            "progress_percent": null,
            "prepare_percent": null,
            "print_stage": null,
            "print_error_code": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.progress_percent, None);
    assert_eq!(merged.remaining_minutes, None);
    assert_eq!(merged.gcode_state, None);
    assert_eq!(merged.subtask_id.as_deref(), Some("1028380749"));
    assert_eq!(merged.active_ams_index, Some(0));
    assert_eq!(merged.active_tray_index, Some(3));
}

#[test]
fn merge_idle_observation_keeps_failed_state_without_carried_remaining_time() {
    let mut previous = super::default_offline_state();
    previous.online = true;
    previous.mqtt_connected = true;
    previous.gcode_state = Some("RUNNING".to_string());
    previous.print_type = Some("cloud".to_string());
    previous.subtask_id = Some("1028380749".to_string());
    previous.progress_percent = Some(41);
    previous.remaining_minutes = Some(25);
    previous.active_ams_index = Some(0);
    previous.active_tray_index = Some(3);

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.gcode_state = Some("FAILED".to_string());
    next.print_type = Some("idle".to_string());
    next.progress_percent = Some(0);
    next.nozzle_temp_c = Some(40.0);

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.gcode_state.as_deref(), Some("FAILED"));
    assert_eq!(merged.print_type.as_deref(), Some("idle"));
    assert_eq!(merged.progress_percent, Some(0));
    assert_eq!(merged.remaining_minutes, None);
    assert_eq!(merged.subtask_id.as_deref(), Some("1028380749"));
    assert_eq!(merged.active_ams_index, Some(0));
    assert_eq!(merged.active_tray_index, Some(3));
}

#[test]
fn merge_print_payload_captures_trays_from_multiple_ams_units() {
    let mut state = super::default_offline_state();
    state.online = true;
    state.mqtt_connected = true;
    state.last_seen_at = Some("2026-04-16T17:29:03Z".to_string());
    let payload = serde_json::json!({
        "ams": {
            "tray_now": "4",
            "ams": [
                {
                    "id": "0",
                    "tray": [
                        {
                            "id": "0",
                            "tray_color": "00FF00FF",
                            "tray_weight": "1000",
                            "tray_type": "PLA",
                            "tray_sub_brands": "PLA Basic",
                            "tray_uuid": "AMS1TRAY1"
                        }
                    ]
                },
                {
                    "id": "1",
                    "tray_exist_bits": "1",
                    "tray": [
                        {
                            "id": "0",
                            "tray_color": "FF0000FF",
                            "tray_weight": "1000",
                            "tray_type": "PLA",
                            "tray_sub_brands": "PLA Basic",
                            "tray_uuid": "AMS2TRAY1"
                        }
                    ]
                }
            ]
        }
    });

    super::merge_print_payload(&mut state, &payload);

    assert_eq!(state.trays.len(), 2);
    assert_eq!(state.active_ams_index, Some(1));
    assert_eq!(state.active_tray_index, Some(0));
    assert_eq!(state.trays[0].ams_index, Some(0));
    assert_eq!(state.trays[0].tray_index, 0);
    assert_eq!(state.trays[0].tray_uuid.as_deref(), Some("AMS1TRAY1"));
    assert_eq!(state.trays[1].ams_index, Some(1));
    assert_eq!(state.trays[1].tray_index, 0);
    assert_eq!(state.trays[1].tray_uuid.as_deref(), Some("AMS2TRAY1"));
}

#[test]
fn merge_print_payload_captures_print_state_and_job_identity() {
    let mut state = super::default_offline_state();
    let payload = serde_json::json!({
        "print": {
            "gcode_state": "RUNNING",
            "print_type": "cloud",
            "subtask_id": 9371,
            "subtask_name": "Calibration cube",
            "mc_percent": "42"
        },
        "job": {
            "job_state": 4
        }
    });

    super::merge_print_payload(&mut state, &payload);

    assert_eq!(state.gcode_state.as_deref(), Some("RUNNING"));
    assert_eq!(state.print_type.as_deref(), Some("cloud"));
    assert_eq!(state.subtask_id.as_deref(), Some("9371"));
    assert_eq!(state.subtask_name.as_deref(), Some("Calibration cube"));
    assert_eq!(state.progress_percent, Some(42));
    assert_eq!(state.job_state_code, Some(4));
    assert!(is_live_print_running(&state));
    let raw = state
        .raw_payload_json
        .as_ref()
        .expect("merged raw payload should be stored");
    assert_eq!(
        raw.pointer("/_bfm_job/job_state_code")
            .and_then(Value::as_i64),
        Some(4)
    );
    assert_eq!(
        raw.pointer("/_bfm_last_message/has_job_state")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn merge_print_payload_captures_preflight_diagnostics_without_starting_print() {
    let mut state = super::default_offline_state();
    let payload = serde_json::json!({
        "print": {
            "command": "push_status",
            "gcode_file_prepare_percent": 75,
            "mc_print_stage": 1,
            "print_error": 50348044,
            "bed_temper": 55.40625,
            "nozzle_temper": 78.1875
        }
    });

    assert!(super::merge_print_payload(&mut state, &payload));

    assert_eq!(state.prepare_percent, Some(75));
    assert_eq!(state.print_stage, Some(1));
    assert_eq!(state.print_error_code, Some(50348044));
    assert_eq!(state.bed_temp_c, Some(55.40625));
    assert_eq!(state.nozzle_temp_c, Some(78.1875));
    assert!(super::has_live_observation(&state));
    assert!(!is_live_print_running(&state));
    let raw = state
        .raw_payload_json
        .as_ref()
        .expect("merged raw payload should be stored");
    assert_eq!(
        raw.pointer("/_bfm_job/prepare_percent")
            .and_then(Value::as_i64),
        Some(75)
    );
    assert_eq!(
        raw.pointer("/_bfm_job/print_stage").and_then(Value::as_i64),
        Some(1)
    );
    assert_eq!(
        raw.pointer("/_bfm_job/print_error_code")
            .and_then(Value::as_i64),
        Some(50348044)
    );
    assert_eq!(
        raw.pointer("/_bfm_job/session_key").and_then(Value::as_str),
        None
    );
}

#[test]
fn merge_print_payload_accepts_passive_job_state_without_starting_print() {
    let mut state = super::default_offline_state();
    let payload = serde_json::json!({
        "job": {
            "job_state": 2
        }
    });

    assert!(super::merge_print_payload(&mut state, &payload));

    assert_eq!(state.job_state_code, Some(2));
    assert!(super::has_live_observation(&state));
    assert!(!is_live_print_running(&state));
}

#[test]
fn merge_print_payload_captures_ams_exist_bits_as_passive_slot_presence() {
    let mut state = super::default_offline_state();
    state.last_seen_at = Some("2026-06-06T04:50:45Z".to_string());
    let payload = serde_json::json!({
        "print": {
            "ams": {
                "tray_exist_bits": "1011"
            },
            "sequence_id": "1031"
        }
    });

    assert!(super::merge_print_payload(&mut state, &payload));

    assert_eq!(state.ams_exist_bits.as_deref(), Some("1011"));
    assert!(super::has_live_observation(&state));
    assert!(!is_live_print_running(&state));
    let raw = state
        .raw_payload_json
        .as_ref()
        .expect("merged raw payload should be stored");
    assert_eq!(
        raw.pointer("/_bfm_observed_fields/ams_exist_bits_at")
            .and_then(Value::as_str),
        Some("2026-06-06T04:50:45Z")
    );
    assert_eq!(
        raw.pointer("/_bfm_last_message/has_ams_exist_bits")
            .and_then(Value::as_bool),
        Some(true)
    );

    let progress_payload = serde_json::json!({
        "print": {
            "mc_percent": 12
        }
    });
    assert!(super::merge_print_payload(&mut state, &progress_payload));
    assert_eq!(state.ams_exist_bits.as_deref(), Some("1011"));
}

#[test]
fn merge_print_payload_reads_top_level_job_identity_from_bambu_payloads() {
    let mut state = super::default_offline_state();
    let payload = serde_json::json!({
        "print": {
            "gcode_state": "RUNNING",
            "mc_percent": 6
        },
        "subtask_id": 958477605,
        "subtask_name": "P1S X1C P1P (Standard Model)"
    });

    super::merge_print_payload(&mut state, &payload);

    assert_eq!(state.gcode_state.as_deref(), Some("RUNNING"));
    assert_eq!(state.subtask_id.as_deref(), Some("958477605"));
    assert_eq!(
        state.subtask_name.as_deref(),
        Some("P1S X1C P1P (Standard Model)")
    );
    assert_eq!(state.progress_percent, Some(6));
    assert!(super::has_live_observation(&state));
}

#[test]
fn merge_print_payload_keeps_diagnostic_job_and_burst_snapshot_fields() {
    let mut state = super::default_offline_state();
    state.last_seen_at = Some("2026-05-18T18:00:00Z".to_string());
    let job_payload = serde_json::json!({
        "print": {
            "gcode_state": "RUNNING",
            "mc_percent": 7,
            "nozzle_temper": 220.0
        },
        "subtask_id": 958477605,
        "subtask_name": "P1S X1C P1P (Standard Model)"
    });
    let ams_payload = serde_json::json!({
        "print": {
            "ams": {
                "ams_status": 769,
                "tray_now": "0",
                "ams": [
                    {
                        "id": "0",
                        "tray": [
                            {
                                "id": "0",
                                "tray_weight": "1000",
                                "remain": 95,
                                "tray_uuid": "tray-rfid-1"
                            }
                        ]
                    }
                ]
            },
            "sequence_id": "1024"
        }
    });

    assert!(super::merge_print_payload(&mut state, &job_payload));
    assert!(super::merge_print_payload(&mut state, &ams_payload));
    super::annotate_capture_poll_metadata(
        &mut state,
        2,
        Some("2026-05-18T18:00:00Z"),
        Some("2026-05-18T18:00:01Z"),
        1200,
    );

    let raw = state
        .raw_payload_json
        .as_ref()
        .expect("merged raw payload should be stored");
    assert_eq!(
        raw.pointer("/_bfm_job/session_key").and_then(Value::as_str),
        Some("subtask:958477605")
    );
    assert_eq!(
        raw.pointer("/_bfm_capture/supported_message_count")
            .and_then(Value::as_i64),
        Some(2)
    );
    assert_eq!(
        raw.pointer("/_bfm_observed_fields/progress_percent_at")
            .and_then(Value::as_str),
        Some("2026-05-18T18:00:00Z")
    );
    assert_eq!(
        raw.pointer("/_bfm_observed_fields/nozzle_print_capable_at")
            .and_then(Value::as_str),
        Some("2026-05-18T18:00:00Z")
    );
    assert_eq!(
        raw.pointer("/_bfm_observed_fields/active_tray_index_at")
            .and_then(Value::as_str),
        Some("2026-05-18T18:00:00Z")
    );
    assert_eq!(
        raw.pointer("/_bfm_last_message/has_progress")
            .and_then(Value::as_bool),
        Some(false)
    );
    assert_eq!(state.ams_status_code, Some(769));
    assert_eq!(state.ams_status_main, Some(3));
    assert_eq!(state.ams_status_sub, Some(1));
    assert_eq!(
        raw.pointer("/_bfm_ams_status/ams_status_code")
            .and_then(Value::as_i64),
        Some(769)
    );
    assert_eq!(
        raw.pointer("/_bfm_ams_status/ams_status_main")
            .and_then(Value::as_i64),
        Some(3)
    );
    assert_eq!(
        raw.pointer("/_bfm_observed_fields/ams_status_at")
            .and_then(Value::as_str),
        Some("2026-05-18T18:00:00Z")
    );
    assert_eq!(
        raw.pointer("/_bfm_last_message/has_ams_status")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        raw.pointer("/ams/ams/0/tray/0/remain")
            .and_then(Value::as_i64),
        Some(95)
    );
    assert_eq!(state.trays[0].remaining_grams, Some(950));
}

#[test]
fn merge_idle_observation_drops_near_complete_carried_identity_for_new_unknown_print() {
    let mut previous = super::default_offline_state();
    previous.online = true;
    previous.mqtt_connected = true;
    previous.last_seen_at = Some("2026-05-20T19:15:54Z".to_string());
    previous.gcode_state = Some("RUNNING".to_string());
    previous.subtask_id = Some("963013155".to_string());
    previous.subtask_name = Some("With supports".to_string());
    previous.active_tray_index = Some(0);
    previous.progress_percent = Some(98);
    previous.remaining_minutes = Some(1);

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.last_seen_at = Some("2026-05-20T19:16:45Z".to_string());
    next.gcode_state = Some("RUNNING".to_string());
    next.progress_percent = Some(0);
    next.remaining_minutes = Some(54);
    next.raw_payload_json = Some(serde_json::json!({
        "_bfm_last_message": {
            "has_job_identity": false
        },
        "_bfm_job": {
            "gcode_state": "RUNNING",
            "progress_percent": 0,
            "remaining_minutes": 54,
            "subtask_id": null,
            "subtask_name": null,
            "active_tray_index": null
        }
    }));

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.gcode_state.as_deref(), Some("RUNNING"));
    assert_eq!(merged.progress_percent, Some(0));
    assert_eq!(merged.remaining_minutes, Some(54));
    assert_eq!(merged.subtask_id, None);
    assert_eq!(merged.subtask_name, None);
    assert_eq!(merged.active_tray_index, None);
}

#[test]
fn merge_idle_observation_carries_active_ams_coordinate_with_active_tray() {
    let mut previous = super::default_offline_state();
    previous.online = true;
    previous.mqtt_connected = true;
    previous.last_seen_at = Some("2026-05-20T19:15:54Z".to_string());
    previous.gcode_state = Some("RUNNING".to_string());
    previous.subtask_id = Some("963013155".to_string());
    previous.subtask_name = Some("With supports".to_string());
    previous.active_ams_index = Some(1);
    previous.active_tray_index = Some(0);
    previous.progress_percent = Some(42);
    previous.remaining_minutes = Some(18);

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.last_seen_at = Some("2026-05-20T19:16:45Z".to_string());
    next.progress_percent = Some(43);
    next.remaining_minutes = Some(17);
    next.raw_payload_json = Some(serde_json::json!({
        "_bfm_last_message": {
            "has_job_identity": false
        },
        "_bfm_job": {
            "gcode_state": null,
            "progress_percent": 43,
            "remaining_minutes": 17,
            "subtask_id": null,
            "subtask_name": null,
            "active_ams_index": null,
            "active_tray_index": null
        }
    }));

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.progress_percent, Some(43));
    assert_eq!(merged.remaining_minutes, Some(17));
    assert_eq!(merged.subtask_id.as_deref(), Some("963013155"));
    assert_eq!(merged.subtask_name.as_deref(), Some("With supports"));
    assert_eq!(merged.active_ams_index, Some(1));
    assert_eq!(merged.active_tray_index, Some(0));
}

#[test]
fn merge_idle_observation_drops_carried_identity_on_nozzle_reheat() {
    let mut previous = super::default_offline_state();
    previous.online = true;
    previous.mqtt_connected = true;
    previous.last_seen_at = Some("2026-05-22T18:21:55Z".to_string());
    previous.gcode_state = Some("FINISH".to_string());
    previous.print_type = Some("idle".to_string());
    previous.subtask_id = Some("967612042".to_string());
    previous.subtask_name = Some("v1.1 Updated Hooks".to_string());
    previous.active_tray_index = Some(0);
    previous.progress_percent = Some(100);
    previous.remaining_minutes = Some(1);
    previous.nozzle_temp_c = Some(50.0);

    let mut next = super::default_offline_state();
    next.online = true;
    next.mqtt_connected = true;
    next.last_seen_at = Some("2026-05-22T18:24:31Z".to_string());
    next.remaining_minutes = Some(42);
    next.nozzle_temp_c = Some(216.46875);
    next.raw_payload_json = Some(serde_json::json!({
        "_bfm_last_message": {
            "has_job_identity": false
        },
        "_bfm_job": {
            "gcode_state": null,
            "progress_percent": null,
            "remaining_minutes": 42,
            "subtask_id": null,
            "subtask_name": null,
            "active_tray_index": null
        }
    }));

    let merged = super::merge_idle_observation(Some(&previous), next);

    assert_eq!(merged.remaining_minutes, Some(42));
    assert_eq!(merged.nozzle_temp_c, Some(216.46875));
    assert_eq!(merged.subtask_id, None);
    assert_eq!(merged.subtask_name, None);
    assert_eq!(merged.active_tray_index, None);
}

#[test]
fn live_print_running_prefers_finished_gcode_state_over_carried_progress() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("FINISH".to_string());
    state.progress_percent = Some(100);
    state.remaining_minutes = Some(0);

    assert!(!is_live_print_running(&state));
}

#[test]
fn live_print_running_treats_stale_finish_with_early_progress_as_running() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("FINISH".to_string());
    state.print_type = Some("idle".to_string());
    state.progress_percent = Some(11);
    state.remaining_minutes = Some(55);
    state.subtask_id = Some("960890080".to_string());

    assert!(is_live_print_running(&state));
}

#[test]
fn live_print_running_treats_near_complete_carried_snapshot_as_finished() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(99);
    state.remaining_minutes = Some(7);
    state.subtask_id = Some("959318246".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "print_type": null,
            "progress_percent": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    assert!(!is_live_print_running(&state));
}

#[test]
fn live_print_running_treats_one_minute_carried_snapshot_as_finished() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(98);
    state.remaining_minutes = Some(1);
    state.subtask_id = Some("963013155".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "print_type": null,
            "progress_percent": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    assert!(!is_live_print_running(&state));
}

#[test]
fn live_print_running_treats_lost_job_with_low_remaining_as_finished() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(92);
    state.remaining_minutes = Some(6);
    state.subtask_id = Some("965288420".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "print_type": null,
            "progress_percent": null,
            "prepare_percent": null,
            "print_stage": null,
            "print_error_code": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    assert!(!is_live_print_running(&state));
}

#[test]
fn live_print_running_keeps_lost_job_with_hot_nozzle_running() {
    let mut state = super::default_offline_state();
    state.last_seen_at = Some("2026-05-27T21:42:16Z".to_string());
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(92);
    state.remaining_minutes = Some(5);
    state.nozzle_temp_c = Some(219.96875);
    state.subtask_id = Some("979752801".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_observed_fields": {
            "nozzle_temper_at": "2026-05-27T21:42:16Z"
        },
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "print_type": null,
            "progress_percent": null,
            "prepare_percent": null,
            "print_stage": null,
            "print_error_code": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    assert!(is_live_print_running(&state));
}

#[test]
fn live_print_running_keeps_long_remaining_near_complete_snapshot_running() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(99);
    state.remaining_minutes = Some(11);
    state.subtask_id = Some("959496019".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_job": {
            "active_tray_index": null,
            "gcode_state": null,
            "print_type": null,
            "progress_percent": null,
            "remaining_minutes": null,
            "session_key": null,
            "subtask_id": null,
            "subtask_name": null
        }
    }));

    assert!(is_live_print_running(&state));
}

#[test]
fn live_print_running_keeps_near_complete_current_job_running() {
    let mut state = super::default_offline_state();
    state.gcode_state = Some("RUNNING".to_string());
    state.progress_percent = Some(99);
    state.remaining_minutes = Some(2);
    state.subtask_id = Some("959318246".to_string());
    state.raw_payload_json = Some(serde_json::json!({
        "_bfm_job": {
            "active_tray_index": 3,
            "gcode_state": "RUNNING",
            "print_type": "cloud",
            "progress_percent": 99,
            "remaining_minutes": 2,
            "session_key": "subtask:959318246",
            "subtask_id": "959318246",
            "subtask_name": "Medium _ Base _ 125×125×150mm"
        }
    }));

    assert!(is_live_print_running(&state));
}

#[test]
fn log_state_changes_records_print_thermal_context() {
    let db_path = temp_db_path("print-event-thermal-context");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;

        let mut idle = super::default_offline_state();
        idle.online = true;
        idle.mqtt_connected = true;
        idle.gcode_state = Some("IDLE".to_string());

        let mut running = super::default_offline_state();
        running.online = true;
        running.mqtt_connected = true;
        running.last_seen_at = Some("2026-06-16T10:20:00Z".to_string());
        running.gcode_state = Some("RUNNING".to_string());
        running.print_type = Some("cloud".to_string());
        running.subtask_id = Some("job-1".to_string());
        running.subtask_name = Some("Test print".to_string());
        running.progress_percent = Some(12);
        running.remaining_minutes = Some(48);
        running.active_ams_index = Some(0);
        running.active_tray_index = Some(2);
        running.nozzle_temp_c = Some(218.5);
        running.bed_temp_c = Some(55.0);

        super::log_state_changes(&db, "printer_1", Some(&idle), &running)
            .map_err(|error| error.to_string())?;

        let start_payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_PRINT_STARTED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let start_payload: Value =
            serde_json::from_str(&start_payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            start_payload.get("thermal_state").and_then(Value::as_str),
            Some("print_capable")
        );
        assert_eq!(
            start_payload.get("nozzle_temp_c").and_then(Value::as_f64),
            Some(218.5)
        );
        assert_eq!(
            start_payload.get("bed_temp_c").and_then(Value::as_f64),
            Some(55.0)
        );
        assert_eq!(
            start_payload
                .get("active_tray_index")
                .and_then(Value::as_i64),
            Some(2)
        );

        let mut finished = running.clone();
        finished.last_seen_at = Some("2026-06-16T11:08:00Z".to_string());
        finished.gcode_state = Some("FINISH".to_string());
        finished.print_type = Some("idle".to_string());
        finished.progress_percent = Some(100);
        finished.remaining_minutes = Some(0);
        finished.nozzle_temp_c = Some(72.0);
        finished.bed_temp_c = Some(34.0);

        super::log_state_changes(&db, "printer_1", Some(&running), &finished)
            .map_err(|error| error.to_string())?;

        let finish_payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_PRINT_FINISHED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let finish_payload: Value =
            serde_json::from_str(&finish_payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            finish_payload.get("thermal_state").and_then(Value::as_str),
            Some("below_extrusion_temp")
        );
        assert_eq!(
            finish_payload.get("last_seen_at").and_then(Value::as_str),
            Some("2026-06-16T11:08:00Z")
        );
        assert_eq!(
            finish_payload.get("nozzle_temp_c").and_then(Value::as_f64),
            Some(72.0)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("log_state_changes_records_print_thermal_context failed: {message}");
    }
}

#[test]
fn classify_live_weight_update_accepts_baseline_and_sane_decrease() {
    assert_eq!(
        classify_live_weight_update(None, 960),
        LiveWeightDecision::AcceptBaseline
    );
    assert_eq!(
        classify_live_weight_update(Some(960), 910),
        LiveWeightDecision::AcceptDecrease { used_grams: 50 }
    );
}

#[test]
fn classify_live_weight_update_ignores_increase_and_rejects_large_drop() {
    assert_eq!(
        classify_live_weight_update(Some(910), 960),
        LiveWeightDecision::IgnoreIncrease { increase_grams: 50 }
    );
    assert_eq!(
        classify_live_weight_update(Some(910), 70),
        LiveWeightDecision::RejectDropOutlier {
            drop_grams: 840,
            max_sane_drop_grams: 91,
        }
    );
}

#[test]
fn enrich_with_match_status_records_live_usage_session_for_sane_decrease() {
    let db_path = temp_db_path("usage-session");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
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
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("956276950".to_string());
        observed.subtask_name = Some("Test print".to_string());
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(95),
            remaining_grams: Some(950),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at.clone()),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        let mut observed =
            crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
                .map_err(|error| error.to_string())?;
        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_used_g, 50);
        assert_eq!(overview[0].usage.total_jobs, 1);
        assert_eq!(overview[0].usage.successful_jobs, 0);

        observed.gcode_state = Some("FINISH".to_string());
        observed.last_seen_at = Some(super::now_iso_string());
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;
        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_used_g, 50);
        assert_eq!(overview[0].usage.total_jobs, 1);
        assert_eq!(overview[0].usage.successful_jobs, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_records_live_usage_session_for_sane_decrease failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_keeps_live_loaded_zero_gram_roll_assigned() {
    let db_path = temp_db_path("live-loaded-zero-keeps-assigned");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Matte Charcoal",
                hex_color: Some("#000000"),
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(20),
            remaining_g: Some(20),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("1001138629".to_string());
        observed.subtask_name = Some("0.2mm layer, 4 walls, 50% infill".to_string());
        observed.active_tray_index = Some(0);
        observed.progress_percent = Some(69);
        observed.remaining_minutes = Some(38);
        observed.nozzle_temp_c = Some(219.96875);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "nozzle_temper_at": observed_at
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#000000".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(0),
            remaining_grams: Some(0),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let spool = db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .expect("spool should exist");
        assert_eq!(spool.current_weight_g, Some(0));
        assert_eq!(spool.remaining_g, Some(0));
        assert_eq!(spool.status, "ASSIGNED");

        let slot_spool_id: Option<String> = db
            .connection()
            .query_row(
                "SELECT spool_id FROM ams_slots WHERE id = 'printer_1_ams_1_slot_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(slot_spool_id.as_deref(), Some("spool_1"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_keeps_live_loaded_zero_gram_roll_assigned failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_keeps_present_bit_slot_assigned_on_empty_payload() {
    let db_path = temp_db_path("present-bit-empty-payload-keeps-assigned");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Matte Charcoal",
                hex_color: Some("#000000"),
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(20),
            remaining_g: Some(20),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.assign_spool_to_ams_slot(
            "printer_1",
            "printer_1_ams_1_slot_1",
            Some("spool_1"),
            None,
            None,
            false,
        )
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.ams_exist_bits = Some("1".to_string());
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: false,
            filament_type: None,
            filament_name: None,
            color_hex: None,
            tray_weight_g: None,
            remaining_percent: None,
            remaining_grams: None,
            observed_rfid_tag: None,
            tray_uuid: None,
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: None,
            last_empty_seen_at: Some(observed_at),
            empty_observation_count: Some(1),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let slot_spool_id: Option<String> = db
            .connection()
            .query_row(
                "SELECT spool_id FROM ams_slots WHERE id = 'printer_1_ams_1_slot_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(slot_spool_id.as_deref(), Some("spool_1"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_keeps_present_bit_slot_assigned_on_empty_payload failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_does_not_apply_global_exist_bits_to_indexed_ams_tray() {
    let db_path = temp_db_path("indexed-ams-empty-payload-clears-assigned");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 2, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Matte Charcoal",
                hex_color: Some("#000000"),
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(20),
            remaining_g: Some(20),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.assign_spool_to_ams_slot(
            "printer_1",
            "printer_1_ams_1_slot_1",
            Some("spool_1"),
            None,
            None,
            false,
        )
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.ams_exist_bits = Some("1".to_string());
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: Some(0),
            tray_index: 0,
            loaded: false,
            filament_type: None,
            filament_name: None,
            color_hex: None,
            tray_weight_g: None,
            remaining_percent: None,
            remaining_grams: None,
            observed_rfid_tag: None,
            tray_uuid: None,
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: None,
            last_empty_seen_at: Some(observed_at),
            empty_observation_count: Some(1),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let slot_spool_id: Option<String> = db
            .connection()
            .query_row(
                "SELECT spool_id FROM ams_slots WHERE id = 'printer_1_ams_1_slot_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(slot_spool_id, None);

        let event_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM printer_live_events WHERE event_type = 'LIVE_AUTO_SLOT_EMPTIED'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(event_count, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_does_not_apply_global_exist_bits_to_indexed_ams_tray failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_recovers_loaded_zero_rebound_from_same_live_roll() {
    let db_path = temp_db_path("live-loaded-zero-rebound-rebase");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Matte Charcoal",
                hex_color: Some("#000000"),
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

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("1001138629".to_string());
        observed.subtask_name = Some("0.2mm layer, 4 walls, 50% infill".to_string());
        observed.active_tray_index = Some(0);
        observed.progress_percent = Some(74);
        observed.remaining_minutes = Some(32);
        observed.nozzle_temp_c = Some(219.96875);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "nozzle_temper_at": observed_at
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#000000".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(2),
            remaining_grams: Some(20),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let spool = db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .expect("spool should exist");
        assert_eq!(spool.current_weight_g, Some(20));
        assert_eq!(spool.remaining_g, Some(20));
        assert_eq!(spool.status, "ASSIGNED");

        let rebase_payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_REBASED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let rebase_payload: Value =
            serde_json::from_str(&rebase_payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            rebase_payload.get("reason").and_then(Value::as_str),
            Some("live_loaded_zero_rebound")
        );

        let ignored_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*)
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_IGNORED'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(ignored_count, 0);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_recovers_loaded_zero_rebound_from_same_live_roll failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_blocks_usage_accounting_when_nozzle_is_below_extrusion_temp() {
    let db_path = temp_db_path("usage-cold-nozzle-block");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Green",
                hex_color: Some("#00AE42"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-3".to_string()),
            rfid_observed_at: None,
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(930),
            remaining_g: Some(930),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("967962647".to_string());
        observed.subtask_name = Some("0.28mm layer, 2 walls, 15% infill".to_string());
        observed.progress_percent = Some(34);
        observed.remaining_minutes = Some(28);
        observed.nozzle_temp_c = Some(176.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": observed_at,
                "remaining_minutes_at": observed_at,
                "nozzle_temper_at": observed_at
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#00AE42".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(90),
            remaining_grams: Some(900),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-3".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let session_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM printer_live_usage_sessions",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 0);

        let current_weight_g: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight_g, 900);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_ignored_cold_nozzle")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(payload
            .get("usage_recorded_grams")
            .is_none_or(Value::is_null));
        assert_eq!(
            payload.get("thermal_state").and_then(Value::as_str),
            Some("below_extrusion_temp")
        );
        assert_eq!(
            payload.get("nozzle_temp_c").and_then(Value::as_f64),
            Some(176.0)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_blocks_usage_accounting_when_nozzle_is_below_extrusion_temp failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_records_recent_hot_cold_nozzle_ams_lag() {
    let db_path = temp_db_path("usage-recent-hot-cold-nozzle-lag");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Blue",
                hex_color: Some("#3366FF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-3".to_string()),
            rfid_observed_at: None,
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(980),
            remaining_g: Some(980),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.progress_percent = Some(20);
        observed.remaining_minutes = Some(3);
        observed.nozzle_temp_c = Some(122.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": observed_at.clone(),
                "remaining_minutes_at": observed_at.clone(),
                "nozzle_temper_at": observed_at.clone(),
                "nozzle_print_capable_at": observed_at.clone()
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#3366FF".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(93),
            remaining_grams: Some(930),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-3".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (total_used_g, spool_used_g): (i64, i64) = db
            .connection()
            .query_row(
                "SELECT sessions.total_used_g, session_spools.used_g
                 FROM printer_live_usage_sessions sessions
                 JOIN printer_live_usage_session_spools session_spools
                   ON session_spools.session_id = sessions.id
                 WHERE sessions.session_key = 'active-print'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(total_used_g, 50);
        assert_eq!(spool_used_g, 50);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_ignored_cold_nozzle")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload
                .get("recent_print_capable_nozzle")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            payload.get("usage_recorded_grams").and_then(Value::as_i64),
            Some(50)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_records_recent_hot_cold_nozzle_ams_lag failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_ignores_stale_anonymous_progress_for_usage_context() {
    let db_path = temp_db_path("usage-stale-anonymous-progress");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Blue",
                hex_color: Some("#3366FF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-3".to_string()),
            rfid_observed_at: None,
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(980),
            remaining_g: Some(980),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let stale_signal_at = "2026-05-21T23:25:43Z".to_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.progress_percent = Some(20);
        observed.remaining_minutes = Some(3);
        observed.nozzle_temp_c = Some(122.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": stale_signal_at.clone(),
                "remaining_minutes_at": stale_signal_at.clone(),
                "nozzle_temper_at": stale_signal_at.clone(),
                "nozzle_print_capable_at": stale_signal_at.clone()
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#3366FF".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(93),
            remaining_grams: Some(930),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-3".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let session_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM printer_live_usage_sessions",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 0);

        let current_weight_g: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight_g, 930);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert!(payload.get("usage_session_key").is_none_or(Value::is_null));
        assert!(payload
            .get("usage_recorded_grams")
            .is_none_or(Value::is_null));
        assert!(payload
            .get("progress_percent_fresh")
            .is_none_or(Value::is_null));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_ignores_stale_anonymous_progress_for_usage_context failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_accepts_long_job_drop_when_cold_nozzle_signal_is_stale() {
    let db_path = temp_db_path("usage-stale-cold-nozzle-long-job");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(460),
            remaining_g: Some(460),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let stale_signal_at = "2026-05-21T23:25:43Z".to_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("966196804".to_string());
        observed.subtask_name = Some("Long overnight print".to_string());
        observed.progress_percent = Some(0);
        observed.remaining_minutes = Some(208);
        observed.nozzle_temp_c = Some(140.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": stale_signal_at,
                "remaining_minutes_at": stale_signal_at,
                "nozzle_temper_at": stale_signal_at
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(32),
            remaining_grams: Some(320),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (total_used_g, spool_used_g): (i64, i64) = db
            .connection()
            .query_row(
                "SELECT sessions.total_used_g, session_spools.used_g
                 FROM printer_live_usage_sessions sessions
                 JOIN printer_live_usage_session_spools session_spools
                   ON session_spools.session_id = sessions.id
                 WHERE sessions.session_key = 'subtask:966196804'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(total_used_g, 140);
        assert_eq!(spool_used_g, 140);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_ignored_cold_nozzle")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload
                .get("usage_deferred_initial_delta")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload.get("usage_recorded_grams").and_then(Value::as_i64),
            Some(140)
        );
        assert_eq!(
            payload.get("thermal_state").and_then(Value::as_str),
            Some("stale")
        );
        assert_eq!(
            payload.get("nozzle_temp_fresh").and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload
                .get("progress_percent_fresh")
                .and_then(Value::as_bool),
            Some(false)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_accepts_long_job_drop_when_cold_nozzle_signal_is_stale failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_rejects_large_failed_job_ams_drop() {
    let db_path = temp_db_path("usage-failed-job-large-drop");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(840),
            remaining_g: Some(840),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        db.touch_live_usage_session(
            crate::backend::database_printer_usage_sessions::LiveUsageSessionInput {
                printer_id: "printer_1",
                session_key: "subtask:failed-large-drop",
                job_name: Some("Cancelled calibration"),
                print_type: Some("cloud"),
                observed_at: Some(&observed_at),
            },
        )
        .map_err(|error| error.to_string())?;
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("FAILED".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("failed-large-drop".to_string());
        observed.subtask_name = Some("Cancelled calibration".to_string());
        observed.progress_percent = Some(56);
        observed.remaining_minutes = Some(44);
        observed.nozzle_temp_c = Some(220.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": observed_at,
                "remaining_minutes_at": observed_at,
                "nozzle_temper_at": observed_at
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(61),
            remaining_grams: Some(610),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let current_weight_g: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight_g, 840);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_REJECTED'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload.get("reason").and_then(Value::as_str),
            Some("drop_outlier")
        );
        assert_eq!(payload.get("drop_grams").and_then(Value::as_i64), Some(230));
        assert_eq!(
            payload.get("finished_success").and_then(Value::as_bool),
            Some(false)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_rejects_large_failed_job_ams_drop failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_tracks_live_session_without_weight_delta() {
    let db_path = temp_db_path("usage-session-without-weight-delta");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;

        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some("2026-05-19T05:28:14Z".to_string());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("959634500".to_string());
        observed.subtask_name = Some("Medium _ Parts (Centered Hinge)".to_string());
        observed.progress_percent = Some(28);
        observed.remaining_minutes = Some(35);
        observed.active_tray_index = Some(3);

        let mut observed =
            crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
                .map_err(|error| error.to_string())?;

        let (status, total_used_g, success): (String, i64, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:959634500'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "RUNNING");
        assert_eq!(total_used_g, 0);
        assert_eq!(success, None);

        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("idle".to_string());
        observed.progress_percent = Some(100);
        observed.remaining_minutes = Some(0);
        observed.last_seen_at = Some("2026-05-19T06:06:12Z".to_string());
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_jobs, 0);
        assert_eq!(overview[0].usage.successful_jobs, 0);
        assert_eq!(overview[0].usage.total_used_g, 0);

        let (status, success): (String, i64) = db
            .connection()
            .query_row(
                "SELECT status, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:959634500'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "COMPLETED");
        assert_eq!(success, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_tracks_live_session_without_weight_delta failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_closes_stale_running_session_when_new_subtask_starts() {
    let db_path = temp_db_path("usage-new-subtask-closes-stale-running");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Jade White",
                hex_color: Some("#FFFFFF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-4".to_string()),
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
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:1028380749",
                job_name: Some("Cancelled print"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 40,
                observed_at: Some("2026-06-17T17:55:02Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some("2026-06-17T18:04:38Z".to_string());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("1028528243".to_string());
        observed.subtask_name = Some("0.16mm layer, 2 walls, 13% infill".to_string());
        observed.progress_percent = Some(42);
        observed.remaining_minutes = Some(114);
        observed.nozzle_temp_c = Some(220.28125);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "gcode_state_at": "2026-06-17T18:04:38Z",
                "progress_percent_at": "2026-06-17T18:04:38Z",
                "remaining_minutes_at": "2026-06-17T18:04:38Z",
                "nozzle_temper_at": "2026-06-17T18:04:38Z",
                "job_identity_at": "2026-06-17T18:04:38Z"
            },
            "_bfm_job": {
                "gcode_state": "RUNNING",
                "print_type": "cloud",
                "progress_percent": 42,
                "remaining_minutes": 114,
                "session_key": "subtask:1028528243",
                "subtask_id": "1028528243",
                "subtask_name": "0.16mm layer, 2 walls, 13% infill"
            }
        }));

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let rows: Vec<LiveUsageSessionRow> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success, finished_at
                     FROM printer_live_usage_sessions
                     ORDER BY session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![
                (
                    "subtask:1028380749".to_string(),
                    "FAILED".to_string(),
                    40,
                    Some(0),
                    Some("2026-06-17T18:04:38Z".to_string()),
                ),
                (
                    "subtask:1028528243".to_string(),
                    "RUNNING".to_string(),
                    0,
                    None,
                    None,
                ),
            ]
        );

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_jobs, 1);
        assert_eq!(overview[0].usage.successful_jobs, 0);
        assert_eq!(overview[0].usage.failed_jobs, 1);
        assert_eq!(overview[0].usage.total_used_g, 40);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_closes_stale_running_session_when_new_subtask_starts failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_merges_anonymous_usage_back_into_active_subtask() {
    let db_path = temp_db_path("usage-anonymous-session-merges-into-subtask");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Black",
                hex_color: Some("#000000"),
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
        })
        .map_err(|error| error.to_string())?;

        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:1028528243",
                job_name: Some("0.16mm layer, 2 walls, 13% infill"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 10,
                observed_at: Some("2026-06-17T18:10:00Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "active-print",
                job_name: None,
                print_type: None,
                spool_id: "spool_1",
                used_grams: 5,
                observed_at: Some("2026-06-17T18:11:00Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some("2026-06-17T18:12:00Z".to_string());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("1028528243".to_string());
        observed.subtask_name = Some("0.16mm layer, 2 walls, 13% infill".to_string());
        observed.progress_percent = Some(45);
        observed.remaining_minutes = Some(109);
        observed.nozzle_temp_c = Some(220.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "gcode_state_at": "2026-06-17T18:12:00Z",
                "progress_percent_at": "2026-06-17T18:12:00Z",
                "remaining_minutes_at": "2026-06-17T18:12:00Z",
                "nozzle_temper_at": "2026-06-17T18:12:00Z",
                "job_identity_at": "2026-06-17T18:12:00Z"
            },
            "_bfm_job": {
                "gcode_state": "RUNNING",
                "print_type": "cloud",
                "progress_percent": 45,
                "remaining_minutes": 109,
                "session_key": "subtask:1028528243",
                "subtask_id": "1028528243",
                "subtask_name": "0.16mm layer, 2 walls, 13% infill"
            }
        }));

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![(
                "subtask:1028528243".to_string(),
                "RUNNING".to_string(),
                15,
                None
            )]
        );

        let spool_rows: Vec<(String, i64)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT spool_id, used_g
                     FROM printer_live_usage_session_spools
                     ORDER BY spool_id",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(spool_rows, vec![("spool_1".to_string(), 15)]);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_merges_anonymous_usage_back_into_active_subtask failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_keeps_hot_lost_job_session_running() {
    let db_path = temp_db_path("usage-hot-lost-job-stays-running");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;

        let mut current_job = super::default_offline_state();
        current_job.online = true;
        current_job.mqtt_connected = true;
        current_job.last_seen_at = Some("2026-05-27T21:41:23Z".to_string());
        current_job.gcode_state = Some("RUNNING".to_string());
        current_job.print_type = Some("cloud".to_string());
        current_job.subtask_id = Some("979752801".to_string());
        current_job.subtask_name = Some("0.2mm layer, 2 walls, 15% infill".to_string());
        current_job.progress_percent = Some(92);
        current_job.remaining_minutes = Some(7);
        current_job.nozzle_temp_c = Some(219.96875);
        current_job.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "gcode_state_at": "2026-05-27T21:41:23Z",
                "progress_percent_at": "2026-05-27T21:41:23Z",
                "remaining_minutes_at": "2026-05-27T21:41:23Z",
                "nozzle_temper_at": "2026-05-27T21:41:23Z",
                "job_identity_at": "2026-05-27T21:41:23Z"
            },
            "_bfm_job": {
                "gcode_state": "RUNNING",
                "print_type": "cloud",
                "progress_percent": 92,
                "remaining_minutes": 7,
                "session_key": "subtask:979752801",
                "subtask_id": "979752801",
                "subtask_name": "0.2mm layer, 2 walls, 15% infill"
            }
        }));
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", current_job)
            .map_err(|error| error.to_string())?;

        let mut lost_job_fields = super::default_offline_state();
        lost_job_fields.online = true;
        lost_job_fields.mqtt_connected = true;
        lost_job_fields.last_seen_at = Some("2026-05-27T21:42:16Z".to_string());
        lost_job_fields.gcode_state = Some("RUNNING".to_string());
        lost_job_fields.print_type = Some("cloud".to_string());
        lost_job_fields.subtask_id = Some("979752801".to_string());
        lost_job_fields.subtask_name = Some("0.2mm layer, 2 walls, 15% infill".to_string());
        lost_job_fields.progress_percent = Some(92);
        lost_job_fields.remaining_minutes = Some(5);
        lost_job_fields.nozzle_temp_c = Some(219.96875);
        lost_job_fields.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "nozzle_temper_at": "2026-05-27T21:42:16Z"
            },
            "_bfm_job": {
                "active_tray_index": null,
                "gcode_state": null,
                "print_type": null,
                "progress_percent": null,
                "prepare_percent": null,
                "print_stage": null,
                "print_error_code": null,
                "remaining_minutes": null,
                "session_key": null,
                "subtask_id": null,
                "subtask_name": null
            }
        }));
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", lost_job_fields)
            .map_err(|error| error.to_string())?;

        let (session_count, running_count, completed_count): (i64, i64, i64) = db
            .connection()
            .query_row(
                "SELECT COUNT(*),
                        COALESCE(SUM(CASE WHEN status = 'RUNNING' THEN 1 ELSE 0 END), 0),
                        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0)
                 FROM printer_live_usage_sessions
                 WHERE session_key LIKE 'subtask:979752801%'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 1);
        assert_eq!(running_count, 1);
        assert_eq!(completed_count, 0);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_keeps_hot_lost_job_session_running failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_corrects_live_usage_when_ams_rebounds() {
    let db_path = temp_db_path("usage-weight-rebound-correction");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(820),
            remaining_g: Some(820),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:960690016",
                job_name: Some("Single Plane"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 40,
                observed_at: Some("2026-05-19T16:53:57Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("960690016".to_string());
        observed.subtask_name = Some("Single Plane".to_string());
        observed.progress_percent = Some(99);
        observed.remaining_minutes = Some(0);
        observed.active_tray_index = Some(0);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(84),
            remaining_grams: Some(840),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (status, success, total_used_g): (String, i64, i64) = db
            .connection()
            .query_row(
                "SELECT status, success, total_used_g
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:960690016'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "COMPLETED");
        assert_eq!(success, 1);
        assert_eq!(total_used_g, 20);

        let session_spool_used_g: i64 = db
            .connection()
            .query_row(
                "SELECT used_g
                 FROM printer_live_usage_session_spools",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_spool_used_g, 20);

        let spool = db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .expect("spool should exist");
        assert_eq!(spool.current_weight_g, Some(840));

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_CORRECTED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload.get("correction_grams").and_then(Value::as_i64),
            Some(20)
        );
        assert_eq!(
            payload.get("corrected_used_grams").and_then(Value::as_i64),
            Some(20)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_corrects_live_usage_when_ams_rebounds failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_keeps_stale_finish_job_running_and_preserves_usage_rebound() {
    let db_path = temp_db_path("usage-stale-finish-running-rebound");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 2)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Beige",
                hex_color: Some("#F7E6DE"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-2".to_string()),
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
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("idle".to_string());
        observed.subtask_id = Some("960890080".to_string());
        observed.subtask_name = Some("6er Karte - Kleiner Beutel Clip".to_string());
        observed.progress_percent = Some(11);
        observed.remaining_minutes = Some(55);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 1,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#F7E6DE".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(97),
            remaining_grams: Some(970),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-2".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at.clone()),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed.clone())
            .map_err(|error| error.to_string())?;

        let (status, total_used_g, success): (String, i64, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:960890080'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "RUNNING");
        assert_eq!(total_used_g, 30);
        assert_eq!(success, None);

        observed.last_seen_at = Some(observed_at.clone());
        observed.progress_percent = Some(25);
        observed.remaining_minutes = Some(48);
        observed.trays[0].remaining_percent = Some(100);
        observed.trays[0].remaining_grams = Some(1000);
        observed.trays[0].last_identity_seen_at = Some(observed_at.clone());
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (status, total_used_g): (String, i64) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:960890080'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "RUNNING");
        assert_eq!(total_used_g, 30);
        let spool = db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .expect("spool should exist");
        assert_eq!(spool.current_weight_g, Some(970));

        let mut finished = super::default_offline_state();
        finished.online = true;
        finished.mqtt_connected = true;
        finished.last_seen_at = Some(observed_at);
        finished.gcode_state = Some("FINISH".to_string());
        finished.print_type = Some("idle".to_string());
        finished.subtask_id = Some("960890080".to_string());
        finished.subtask_name = Some("6er Karte - Kleiner Beutel Clip".to_string());
        finished.progress_percent = Some(100);
        finished.remaining_minutes = Some(0);
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", finished)
            .map_err(|error| error.to_string())?;

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY started_at",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![(
                "subtask:960890080".to_string(),
                "COMPLETED".to_string(),
                30,
                Some(1)
            )]
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_keeps_stale_finish_job_running_and_preserves_usage_rebound failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_does_not_attach_stale_finished_job_to_weight_sync() {
    let db_path = temp_db_path("usage-stale-finished-weight-sync");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PETG",
                filament_name: "HF",
                color_name: "Green",
                hex_color: Some("#3A7F3A"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-3".to_string()),
            rfid_observed_at: None,
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(930),
            remaining_g: Some(930),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:960890080",
                job_name: Some("6er Karte - Kleiner Beutel Clip"),
                print_type: Some("idle"),
                spool_id: "spool_1",
                used_grams: 30,
                observed_at: Some("2026-05-19T18:08:05Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;
        db.finish_live_usage_session(
            "printer_1",
            "subtask:960890080",
            Some("2026-05-19T18:30:00Z"),
            true,
        )
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("idle".to_string());
        observed.subtask_id = Some("960890080".to_string());
        observed.subtask_name = Some("6er Karte - Kleiner Beutel Clip".to_string());
        observed.progress_percent = Some(100);
        observed.remaining_minutes = Some(0);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 2,
            loaded: true,
            filament_type: Some("PETG".to_string()),
            filament_name: Some("HF".to_string()),
            color_hex: Some("#3A7F3A".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(96),
            remaining_grams: Some(960),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-3".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (session_count, total_used_g): (i64, i64) = db
            .connection()
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(total_used_g), 0)
                 FROM printer_live_usage_sessions
                 WHERE session_key LIKE 'subtask:960890080%'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 1);
        assert_eq!(total_used_g, 30);

        let correction_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*)
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_CORRECTED'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(correction_count, 0);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_IGNORED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert!(payload
            .get("usage_session_key")
            .is_none_or(serde_json::Value::is_null));
        assert!(payload
            .get("finished_success")
            .is_none_or(serde_json::Value::is_null));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_does_not_attach_stale_finished_job_to_weight_sync failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_preserves_long_print_usage_across_late_rebounds_and_carried_finish() {
    let db_path = temp_db_path("usage-long-print-rebounds-carried-finish");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Black",
                hex_color: Some("#000000"),
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
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(800),
            remaining_g: Some(800),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let observed_with_remaining = |remaining_grams: i64, progress_percent: i64| {
            let mut observed = super::default_offline_state();
            observed.online = true;
            observed.mqtt_connected = true;
            observed.last_seen_at = Some(observed_at.clone());
            observed.gcode_state = Some("RUNNING".to_string());
            observed.print_type = Some("cloud".to_string());
            observed.subtask_id = Some("963013155".to_string());
            observed.subtask_name = Some("With supports".to_string());
            observed.active_tray_index = Some(0);
            observed.progress_percent = Some(progress_percent);
            observed.remaining_minutes = Some(80);
            observed.trays = vec![BambuLiveObservedTrayRow {
                ams_index: None,
                tray_index: 0,
                loaded: true,
                filament_type: Some("PLA".to_string()),
                filament_name: Some("Matte".to_string()),
                color_hex: Some("#000000".to_string()),
                tray_weight_g: Some(1000),
                remaining_percent: Some(remaining_grams / 10),
                remaining_grams: Some(remaining_grams),
                observed_rfid_tag: None,
                tray_uuid: Some("tray-rfid-1".to_string()),
                chip_id: None,
                tray_info_idx: None,
                tray_id_name: None,
                nozzle_temp_min_c: None,
                nozzle_temp_max_c: None,
                last_identity_seen_at: Some(observed_at.clone()),
                last_empty_seen_at: None,
                empty_observation_count: Some(0),
                matched_inventory_spool_id: None,
                matched_inventory_mode: None,
                match_status: None,
                match_note: None,
            }];
            observed
        };

        for (remaining_grams, progress_percent) in [
            (780, 26),
            (750, 26),
            (700, 43),
            (740, 43),
            (730, 43),
            (770, 43),
        ] {
            crate::bambu_live_sync::enrich_with_match_status(
                &db,
                "printer_1",
                observed_with_remaining(remaining_grams, progress_percent),
            )
            .map_err(|error| error.to_string())?;
        }

        let (status, total_used_g, success): (String, i64, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:963013155'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "RUNNING");
        assert_eq!(total_used_g, 70);
        assert_eq!(success, None);

        let mut finished = super::default_offline_state();
        finished.online = true;
        finished.mqtt_connected = true;
        finished.last_seen_at = Some(observed_at);
        finished.gcode_state = Some("RUNNING".to_string());
        finished.print_type = Some("cloud".to_string());
        finished.subtask_id = Some("963013155".to_string());
        finished.subtask_name = Some("With supports".to_string());
        finished.progress_percent = Some(98);
        finished.remaining_minutes = Some(1);
        finished.raw_payload_json = Some(serde_json::json!({
            "_bfm_job": {
                "active_tray_index": null,
                "gcode_state": null,
                "print_type": null,
                "progress_percent": null,
                "remaining_minutes": null,
                "session_key": null,
                "subtask_id": null,
                "subtask_name": null
            }
        }));
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", finished)
            .map_err(|error| error.to_string())?;

        let (status, total_used_g, success): (String, i64, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:963013155'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "COMPLETED");
        assert_eq!(total_used_g, 70);
        assert_eq!(success, Some(1));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_preserves_long_print_usage_across_late_rebounds_and_carried_finish failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_finishes_near_complete_carried_live_session() {
    let db_path = temp_db_path("usage-carried-complete");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Jade White",
                hex_color: Some("#FFFFFF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-4".to_string()),
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(280),
            remaining_g: Some(280),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:959318246",
                job_name: Some("Medium _ Base _ 125×125×150mm"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 90,
                observed_at: Some("2026-05-19T02:17:05Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some("2026-05-19T02:43:12Z".to_string());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("959318246".to_string());
        observed.subtask_name = Some("Medium _ Base _ 125×125×150mm".to_string());
        observed.progress_percent = Some(99);
        observed.remaining_minutes = Some(7);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_job": {
                "active_tray_index": null,
                "gcode_state": null,
                "print_type": null,
                "progress_percent": null,
                "remaining_minutes": null,
                "session_key": null,
                "subtask_id": null,
                "subtask_name": null
            }
        }));

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_used_g, 90);
        assert_eq!(overview[0].usage.total_jobs, 1);
        assert_eq!(overview[0].usage.successful_jobs, 1);

        let (status, success): (String, i64) = db
            .connection()
            .query_row(
                "SELECT status, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:959318246'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(status, "COMPLETED");
        assert_eq!(success, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_finishes_near_complete_carried_live_session failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_finishes_single_active_session_when_finish_subtask_changes() {
    let db_path = temp_db_path("usage-finish-subtask-changed");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Jade White",
                hex_color: Some("#FFFFFF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-4".to_string()),
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(50),
            remaining_g: Some(50),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:959634500",
                job_name: Some("Medium _ Parts (Centered Hinge)"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 10,
                observed_at: Some("2026-05-19T06:31:36Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some("2026-05-19T07:09:34Z".to_string());
        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("idle".to_string());
        observed.subtask_id = Some("959708942".to_string());
        observed.subtask_name = Some("Medium _ Parts (Centered Hinge)".to_string());
        observed.progress_percent = Some(100);
        observed.remaining_minutes = Some(0);
        observed.active_tray_index = Some(255);

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY started_at, session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![(
                "subtask:959634500".to_string(),
                "COMPLETED".to_string(),
                10,
                Some(1)
            )]
        );

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_jobs, 1);
        assert_eq!(overview[0].usage.successful_jobs, 1);
        assert_eq!(overview[0].usage.total_used_g, 10);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_finishes_single_active_session_when_finish_subtask_changes failed: {message}");
    }
}

#[test]
fn live_usage_sessions_split_repeated_subtask_after_completion() {
    let db_path = temp_db_path("usage-repeat-subtask");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Jade White",
                hex_color: Some("#FFFFFF"),
                product_url: None,
                vendor: Some("Bambu"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;
        db.insert_spool(&SpoolRow {
            id: "spool_1".to_string(),
            master_id,
            qr_code: None,
            rfid_tag: Some("tray-rfid-4".to_string()),
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(280),
            remaining_g: Some(280),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let first = db
            .record_live_usage_delta(
                crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                    printer_id: "printer_1",
                    session_key: "subtask:959496019",
                    job_name: Some("Medium _ Parts (Centered Hinge)"),
                    print_type: Some("cloud"),
                    spool_id: "spool_1",
                    used_grams: 20,
                    observed_at: Some("2026-05-19T03:43:58Z"),
                    defer_initial_delta: false,
                },
            )
            .map_err(|error| error.to_string())?;
        db.finish_live_usage_session(
            "printer_1",
            "subtask:959496019",
            Some("2026-05-19T04:15:47Z"),
            true,
        )
        .map_err(|error| error.to_string())?;

        let second = db
            .record_live_usage_delta(
                crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                    printer_id: "printer_1",
                    session_key: "subtask:959496019",
                    job_name: Some("Medium _ Parts (Centered Hinge)"),
                    print_type: Some("cloud"),
                    spool_id: "spool_1",
                    used_grams: 30,
                    observed_at: Some("2026-05-19T04:39:54Z"),
                    defer_initial_delta: false,
                },
            )
            .map_err(|error| error.to_string())?;
        assert_ne!(first.session_id, second.session_id);

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY started_at, session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(rows.len(), 2);
        assert_eq!(
            rows[0],
            (
                "subtask:959496019".to_string(),
                "COMPLETED".to_string(),
                20,
                Some(1)
            )
        );
        assert_eq!(
            rows[1],
            (
                "subtask:959496019#run2".to_string(),
                "RUNNING".to_string(),
                30,
                None
            )
        );

        db.finish_live_usage_session(
            "printer_1",
            "subtask:959496019",
            Some("2026-05-19T05:03:23Z"),
            true,
        )
        .map_err(|error| error.to_string())?;
        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_used_g, 50);
        assert_eq!(overview[0].usage.total_jobs, 2);
        assert_eq!(overview[0].usage.successful_jobs, 2);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("live_usage_sessions_split_repeated_subtask_after_completion failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_rebases_pre_usage_ams_rebound_before_counting_drop() {
    let db_path = temp_db_path("usage-pre-drop-ams-rebase");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Black",
                hex_color: Some("#000000"),
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(570),
            remaining_g: Some(570),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let observed_without_identity = |remaining_grams: i64, progress_percent: i64| {
            let mut observed = super::default_offline_state();
            observed.online = true;
            observed.mqtt_connected = true;
            observed.last_seen_at = Some(observed_at.clone());
            observed.gcode_state = Some("FINISH".to_string());
            observed.print_type = Some("idle".to_string());
            observed.progress_percent = Some(progress_percent);
            observed.remaining_minutes = Some(0);
            observed.prepare_percent = Some(49);
            observed.trays = vec![BambuLiveObservedTrayRow {
                ams_index: None,
                tray_index: 0,
                loaded: true,
                filament_type: Some("PLA".to_string()),
                filament_name: Some("Matte".to_string()),
                color_hex: Some("#000000".to_string()),
                tray_weight_g: Some(1000),
                remaining_percent: Some(remaining_grams / 10),
                remaining_grams: Some(remaining_grams),
                observed_rfid_tag: None,
                tray_uuid: Some("tray-rfid-1".to_string()),
                chip_id: None,
                tray_info_idx: None,
                tray_id_name: None,
                nozzle_temp_min_c: None,
                nozzle_temp_max_c: None,
                last_identity_seen_at: Some(observed_at.clone()),
                last_empty_seen_at: None,
                empty_observation_count: Some(0),
                matched_inventory_spool_id: None,
                matched_inventory_mode: None,
                match_status: None,
                match_note: None,
            }];
            observed
        };

        crate::bambu_live_sync::enrich_with_match_status(
            &db,
            "printer_1",
            observed_without_identity(590, 25),
        )
        .map_err(|error| error.to_string())?;
        let current_weight: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight, 590);

        crate::bambu_live_sync::enrich_with_match_status(
            &db,
            "printer_1",
            observed_without_identity(560, 43),
        )
        .map_err(|error| error.to_string())?;

        let observed_with_identity = |remaining_grams: i64, progress_percent: i64| {
            let mut observed = observed_without_identity(remaining_grams, progress_percent);
            observed.gcode_state = Some("RUNNING".to_string());
            observed.print_type = Some("cloud".to_string());
            observed.remaining_minutes = Some(12);
            observed.prepare_percent = Some(100);
            observed.subtask_id = Some("965003524".to_string());
            observed.subtask_name = Some("0.2mm layer, 6 walls, 25% infill".to_string());
            observed
        };
        crate::bambu_live_sync::enrich_with_match_status(
            &db,
            "printer_1",
            observed_with_identity(580, 79),
        )
        .map_err(|error| error.to_string())?;

        let mut finished = observed_with_identity(590, 100);
        finished.gcode_state = Some("FINISH".to_string());
        finished.print_type = Some("idle".to_string());
        finished.remaining_minutes = Some(0);
        finished.active_tray_index = Some(255);
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", finished)
            .map_err(|error| error.to_string())?;

        let row: (String, i64, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT status, total_used_g, success
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:965003524'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(row, ("COMPLETED".to_string(), 30, Some(1)));

        let current_weight: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight, 560);

        let rebase_events: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*) FROM printer_live_events WHERE event_type = 'LIVE_AUTO_WEIGHT_REBASED'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(rebase_events, 1);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_rebases_pre_usage_ams_rebound_before_counting_drop failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_promotes_unknown_print_session_and_corrects_late_rebound() {
    let db_path = temp_db_path("usage-unknown-print-promoted-rebound");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Black",
                hex_color: Some("#000000"),
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
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(790),
            remaining_g: Some(790),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let observed_without_identity = |remaining_grams: i64, progress_percent: i64| {
            let mut observed = super::default_offline_state();
            observed.online = true;
            observed.mqtt_connected = true;
            observed.last_seen_at = Some(observed_at.clone());
            observed.gcode_state = Some("RUNNING".to_string());
            observed.progress_percent = Some(progress_percent);
            observed.remaining_minutes = Some(54);
            observed.trays = vec![BambuLiveObservedTrayRow {
                ams_index: None,
                tray_index: 0,
                loaded: true,
                filament_type: Some("PLA".to_string()),
                filament_name: Some("Matte".to_string()),
                color_hex: Some("#000000".to_string()),
                tray_weight_g: Some(1000),
                remaining_percent: Some(remaining_grams / 10),
                remaining_grams: Some(remaining_grams),
                observed_rfid_tag: None,
                tray_uuid: Some("tray-rfid-1".to_string()),
                chip_id: None,
                tray_info_idx: None,
                tray_id_name: None,
                nozzle_temp_min_c: None,
                nozzle_temp_max_c: None,
                last_identity_seen_at: Some(observed_at.clone()),
                last_empty_seen_at: None,
                empty_observation_count: Some(0),
                matched_inventory_spool_id: None,
                matched_inventory_mode: None,
                match_status: None,
                match_note: None,
            }];
            observed
        };

        for (remaining_grams, progress_percent) in [(770, 0), (760, 41), (720, 41)] {
            crate::bambu_live_sync::enrich_with_match_status(
                &db,
                "printer_1",
                observed_without_identity(remaining_grams, progress_percent),
            )
            .map_err(|error| error.to_string())?;
        }

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY started_at, session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![("active-print".to_string(), "RUNNING".to_string(), 50, None)]
        );

        let observed_with_identity = |remaining_grams: i64, progress_percent: i64| {
            let mut observed = observed_without_identity(remaining_grams, progress_percent);
            observed.subtask_id = Some("963415331".to_string());
            observed.subtask_name = Some("0.2mm layer, 6 walls, 25% infill".to_string());
            observed.print_type = Some("cloud".to_string());
            observed
        };

        for (remaining_grams, progress_percent) in [(760, 83), (750, 91), (740, 93)] {
            crate::bambu_live_sync::enrich_with_match_status(
                &db,
                "printer_1",
                observed_with_identity(remaining_grams, progress_percent),
            )
            .map_err(|error| error.to_string())?;
        }

        let mut finished = observed_with_identity(740, 100);
        finished.gcode_state = Some("FINISH".to_string());
        finished.print_type = Some("idle".to_string());
        finished.remaining_minutes = Some(0);
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", finished)
            .map_err(|error| error.to_string())?;

        let rows: Vec<(String, String, i64, Option<i64>)> = {
            let mut statement = db
                .connection()
                .prepare(
                    "SELECT session_key, status, total_used_g, success
                     FROM printer_live_usage_sessions
                     ORDER BY started_at, session_key",
                )
                .map_err(|error| error.to_string())?;
            let mapped_rows = statement
                .query_map([], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
                })
                .map_err(|error| error.to_string())?;
            mapped_rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?
        };
        assert_eq!(
            rows,
            vec![(
                "subtask:963415331".to_string(),
                "COMPLETED".to_string(),
                30,
                Some(1)
            )]
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("enrich_with_match_status_promotes_unknown_print_session_and_corrects_late_rebound failed: {message}");
    }
}

#[test]
fn live_weight_sync_logs_recorded_usage_decision_for_warmup_delta() {
    let db_path = temp_db_path("usage-decision-log");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("958477605".to_string());
        observed.subtask_name = Some("P1S X1C P1P".to_string());
        observed.progress_percent = Some(6);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(95),
            remaining_grams: Some(950),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let overview = db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        assert_eq!(overview[0].usage.total_used_g, 0);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload.get("usage_session_key").and_then(Value::as_str),
            Some("subtask:958477605")
        );
        assert_eq!(
            payload
                .get("usage_deferred_initial_delta")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            payload.get("usage_recorded_grams").and_then(Value::as_i64),
            Some(0)
        );
        assert_eq!(payload.get("used_grams").and_then(Value::as_i64), Some(50));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("live_weight_sync_logs_recorded_usage_decision_for_warmup_delta failed: {message}");
    }
}

#[test]
fn live_weight_sync_records_small_initial_running_delta() {
    let db_path = temp_db_path("usage-small-initial-delta");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(460),
            remaining_g: Some(460),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("966196804".to_string());
        observed.subtask_name = Some("Single color, trashcan icon".to_string());
        observed.progress_percent = Some(5);
        observed.remaining_minutes = Some(208);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(45),
            remaining_grams: Some(450),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (total_used_g, spool_used_g): (i64, i64) = db
            .connection()
            .query_row(
                "SELECT sessions.total_used_g, session_spools.used_g
                 FROM printer_live_usage_sessions sessions
                 JOIN printer_live_usage_session_spools session_spools
                   ON session_spools.session_id = sessions.id
                 WHERE sessions.session_key = 'subtask:966196804'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(total_used_g, 10);
        assert_eq!(spool_used_g, 10);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_deferred_initial_delta")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload.get("usage_recorded_grams").and_then(Value::as_i64),
            Some(10)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("live_weight_sync_records_small_initial_running_delta failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_attaches_tail_weight_sync_to_recent_completed_session() {
    let db_path = temp_db_path("usage-tail-after-complete");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(330),
            remaining_g: Some(330),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        let finished_at = super::now_iso_string();
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:966196804",
                job_name: Some("Single color, trashcan icon"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 130,
                observed_at: Some(&finished_at),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;
        db.finish_live_usage_session("printer_1", "subtask:966196804", Some(&finished_at), true)
            .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("FINISH".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("966196804".to_string());
        observed.subtask_name = Some("Single color, trashcan icon".to_string());
        observed.progress_percent = Some(100);
        observed.remaining_minutes = Some(0);
        observed.nozzle_temp_c = Some(60.0);
        observed.raw_payload_json = Some(serde_json::json!({
            "_bfm_observed_fields": {
                "progress_percent_at": observed_at.clone(),
                "remaining_minutes_at": observed_at.clone(),
                "nozzle_temper_at": observed_at.clone()
            }
        }));
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(32),
            remaining_grams: Some(320),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at.clone()),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (session_count, total_used_g, spool_used_g): (i64, i64, i64) = db
            .connection()
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(sessions.total_used_g), 0), COALESCE(SUM(session_spools.used_g), 0)
                 FROM printer_live_usage_sessions sessions
                 JOIN printer_live_usage_session_spools session_spools
                   ON session_spools.session_id = sessions.id
                 WHERE sessions.session_key LIKE 'subtask:966196804%'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 1);
        assert_eq!(total_used_g, 140);
        assert_eq!(spool_used_g, 140);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_attached_to_recent_completed_session")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert_eq!(
            payload.get("usage_recorded_grams").and_then(Value::as_i64),
            Some(10)
        );
        assert_eq!(
            payload
                .get("usage_ignored_cold_nozzle")
                .and_then(Value::as_bool),
            Some(false)
        );
        assert_eq!(
            payload.get("thermal_state").and_then(Value::as_str),
            Some("below_extrusion_temp")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_attaches_tail_weight_sync_to_recent_completed_session failed: {message}"
        );
    }
}

#[test]
fn enrich_with_match_status_ignores_stale_near_finish_tail_after_completed_session() {
    let db_path = temp_db_path("usage-stale-tail-after-complete");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 1)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(270),
            remaining_g: Some(270),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        let finished_at = super::now_iso_string();
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:967612042",
                job_name: Some("v1.1 Updated Hooks"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 60,
                observed_at: Some(&finished_at),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;
        db.finish_live_usage_session("printer_1", "subtask:967612042", Some(&finished_at), true)
            .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("967612042".to_string());
        observed.subtask_name = Some("v1.1 Updated Hooks".to_string());
        observed.progress_percent = Some(93);
        observed.remaining_minutes = Some(5);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(24),
            remaining_grams: Some(240),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (session_count, total_used_g, spool_used_g): (i64, i64, i64) = db
            .connection()
            .query_row(
                "SELECT COUNT(*), COALESCE(SUM(sessions.total_used_g), 0), COALESCE(SUM(session_spools.used_g), 0)
                 FROM printer_live_usage_sessions sessions
                 JOIN printer_live_usage_session_spools session_spools
                   ON session_spools.session_id = sessions.id
                 WHERE sessions.session_key LIKE 'subtask:967612042%'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(session_count, 1);
        assert_eq!(total_used_g, 60);
        assert_eq!(spool_used_g, 60);

        let current_weight_g: i64 = db
            .connection()
            .query_row(
                "SELECT current_weight_g FROM filament_spools WHERE id = 'spool_1'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight_g, 240);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_SYNC'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload
                .get("usage_ignored_recent_completed_tail")
                .and_then(Value::as_bool),
            Some(true)
        );
        assert!(payload
            .get("usage_recorded_grams")
            .is_none_or(Value::is_null));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_ignores_stale_near_finish_tail_after_completed_session failed: {message}"
        );
    }
}

#[test]
fn repeated_live_weight_increases_are_deduped_in_live_events() {
    let db_path = temp_db_path("ignored-increase-dedupe");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Basic",
                color_name: "Green",
                hex_color: Some("#00AA00"),
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
            status: "IN_STOCK".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(930),
            remaining_g: Some(930),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("958962547".to_string());
        observed.subtask_name = Some("Bambu Spools".to_string());
        observed.progress_percent = Some(87);
        observed.active_tray_index = Some(2);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 2,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Basic".to_string()),
            color_hex: Some("#00AA00".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(96),
            remaining_grams: Some(960),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed.clone())
            .map_err(|error| error.to_string())?;
        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let ignored_count: i64 = db
            .connection()
            .query_row(
                "SELECT COUNT(*)
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_IGNORED'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(ignored_count, 1);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_IGNORED'
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload.get("reason").and_then(Value::as_str),
            Some("increase")
        );
        assert_eq!(
            payload.get("increase_grams").and_then(Value::as_i64),
            Some(30)
        );
        assert_eq!(
            payload.get("usage_session_key").and_then(Value::as_str),
            Some("subtask:958962547")
        );
        assert!(payload
            .get("dedupe_key")
            .and_then(Value::as_str)
            .is_some_and(|value| value.contains("ams-weight-increase")));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("repeated_live_weight_increases_are_deduped_in_live_events failed: {message}");
    }
}

#[test]
fn enrich_with_match_status_ignores_small_near_finish_ams_drop_after_established_usage() {
    let db_path = temp_db_path("near-finish-small-drop");
    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        db.upsert_printer_with_ams("printer_1", "Bambu Lab P1S", "Brutus", 1, 4)
            .map_err(|error| error.to_string())?;
        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PLA",
                filament_name: "Matte",
                color_name: "Charcoal",
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
            status: "ASSIGNED".to_string(),
            ownership_type: "OWNED".to_string(),
            owner_name: None,
            owner_contact: None,
            ownership_note: None,
            initial_weight_g: Some(1000),
            current_weight_g: Some(480),
            remaining_g: Some(480),
            spool_tare_weight_g: None,
            location_id: None,
            home_location_id: None,
            purchase_date: None,
            purchase_price: None,
            batch_code: None,
            last_used_at: None,
        })
        .map_err(|error| error.to_string())?;
        db.record_live_usage_delta(
            crate::backend::database_printer_usage_sessions::LiveUsageDeltaInput {
                printer_id: "printer_1",
                session_key: "subtask:965288420",
                job_name: Some("Holders with embedded BambuLab Logo"),
                print_type: Some("cloud"),
                spool_id: "spool_1",
                used_grams: 100,
                observed_at: Some("2026-05-21T18:53:06Z"),
                defer_initial_delta: false,
            },
        )
        .map_err(|error| error.to_string())?;

        let observed_at = super::now_iso_string();
        let mut observed = super::default_offline_state();
        observed.online = true;
        observed.mqtt_connected = true;
        observed.last_seen_at = Some(observed_at.clone());
        observed.gcode_state = Some("RUNNING".to_string());
        observed.print_type = Some("cloud".to_string());
        observed.subtask_id = Some("965288420".to_string());
        observed.subtask_name = Some("Holders with embedded BambuLab Logo".to_string());
        observed.progress_percent = Some(92);
        observed.remaining_minutes = Some(6);
        observed.active_tray_index = Some(0);
        observed.trays = vec![BambuLiveObservedTrayRow {
            ams_index: None,
            tray_index: 0,
            loaded: true,
            filament_type: Some("PLA".to_string()),
            filament_name: Some("Matte".to_string()),
            color_hex: Some("#111111".to_string()),
            tray_weight_g: Some(1000),
            remaining_percent: Some(47),
            remaining_grams: Some(470),
            observed_rfid_tag: None,
            tray_uuid: Some("tray-rfid-1".to_string()),
            chip_id: None,
            tray_info_idx: None,
            tray_id_name: None,
            nozzle_temp_min_c: None,
            nozzle_temp_max_c: None,
            last_identity_seen_at: Some(observed_at),
            last_empty_seen_at: None,
            empty_observation_count: Some(0),
            matched_inventory_spool_id: None,
            matched_inventory_mode: None,
            match_status: None,
            match_note: None,
        }];

        crate::bambu_live_sync::enrich_with_match_status(&db, "printer_1", observed)
            .map_err(|error| error.to_string())?;

        let (current_weight_g, remaining_g): (Option<i64>, Option<i64>) = db
            .connection()
            .query_row(
                "SELECT current_weight_g, remaining_g
                 FROM filament_spools
                 WHERE id = 'spool_1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(current_weight_g, Some(480));
        assert_eq!(remaining_g, Some(480));

        let total_used_g: i64 = db
            .connection()
            .query_row(
                "SELECT total_used_g
                 FROM printer_live_usage_sessions
                 WHERE session_key = 'subtask:965288420'",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        assert_eq!(total_used_g, 100);

        let payload_json: String = db
            .connection()
            .query_row(
                "SELECT payload_json
                 FROM printer_live_events
                 WHERE event_type = 'LIVE_AUTO_WEIGHT_IGNORED'
                 ORDER BY created_at DESC
                 LIMIT 1",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        let payload: Value =
            serde_json::from_str(&payload_json).map_err(|error| error.to_string())?;
        assert_eq!(
            payload.get("reason").and_then(Value::as_str),
            Some("near_finish_small_decrease")
        );
        assert_eq!(payload.get("drop_grams").and_then(Value::as_i64), Some(10));
        assert_eq!(
            payload.get("progress_percent").and_then(Value::as_i64),
            Some(92)
        );
        assert_eq!(
            payload.get("remaining_minutes").and_then(Value::as_i64),
            Some(6)
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "enrich_with_match_status_ignores_small_near_finish_ams_drop_after_established_usage failed: {message}"
        );
    }
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

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        0,
        &payload,
        "2026-04-16T14:05:00Z",
        None,
    );

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

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        0,
        &payload,
        "2026-04-16T14:00:00Z",
        None,
    );

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

    let merged = merge_tray_payload(
        Some(&previous),
        None,
        0,
        &payload,
        "2026-04-16T14:05:00Z",
        None,
    );

    assert!(merged.loaded);
    assert_eq!(merged.tray_uuid.as_deref(), Some("tray-uuid-unknown"));
    assert_eq!(
        merged.last_identity_seen_at.as_deref(),
        previous.last_identity_seen_at.as_deref()
    );
}

#[test]
fn merge_tray_payload_keeps_settings_preset_separate_from_rfid_identity() {
    let payload = serde_json::json!({
        "id": 0,
        "tray_info_idx": "GFSA00_04",
        "tray_id_name": "Bambu PLA Basic @BBL P1S 0.4 nozzle",
        "tray_type": "PLA",
        "tray_sub_brands": "Basic"
    });

    let merged = merge_tray_payload(None, None, 0, &payload, "2026-04-16T14:05:00Z", None);

    assert!(merged.loaded);
    assert_eq!(merged.tray_info_idx.as_deref(), Some("GFSA00_04"));
    assert_eq!(
        merged.tray_id_name.as_deref(),
        Some("Bambu PLA Basic @BBL P1S 0.4 nozzle")
    );
    assert!(merged.tray_uuid.is_none());
    assert!(merged.observed_rfid_tag.is_none());
    assert!(merged.last_identity_seen_at.is_none());
}

#[test]
fn merge_tray_snapshots_carries_identity_and_preset_for_partial_loaded_update() {
    let mut previous = make_tray();
    previous.tray_info_idx = Some("GFSA00_04".to_string());
    previous.tray_id_name = Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string());

    let mut next = make_tray();
    next.remaining_percent = Some(76);
    next.remaining_grams = Some(760);
    next.observed_rfid_tag = None;
    next.tray_uuid = None;
    next.chip_id = None;
    next.tray_info_idx = None;
    next.tray_id_name = None;
    next.last_identity_seen_at = None;

    let merged = super::merge_tray_snapshots(&[previous], &[next]);

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].remaining_grams, Some(760));
    assert_eq!(merged[0].observed_rfid_tag.as_deref(), Some("legacy"));
    assert_eq!(merged[0].tray_uuid.as_deref(), Some("tray-uuid-unknown"));
    assert_eq!(merged[0].chip_id.as_deref(), Some("chip"));
    assert_eq!(merged[0].tray_info_idx.as_deref(), Some("GFSA00_04"));
    assert_eq!(
        merged[0].tray_id_name.as_deref(),
        Some("Bambu PLA Basic @BBL P1S 0.4 nozzle")
    );
    assert_eq!(
        merged[0].last_identity_seen_at.as_deref(),
        Some("2026-04-15T10:00:00Z")
    );
}

#[test]
fn merge_tray_snapshots_does_not_carry_identity_when_loaded_metadata_changes() {
    let mut previous = make_tray();
    previous.tray_info_idx = Some("GFSA00_04".to_string());
    previous.tray_id_name = Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string());

    let mut next = make_tray();
    next.filament_name = Some("eSUN PLA+".to_string());
    next.observed_rfid_tag = None;
    next.tray_uuid = None;
    next.chip_id = None;
    next.tray_info_idx = None;
    next.tray_id_name = None;
    next.last_identity_seen_at = None;

    let merged = super::merge_tray_snapshots(&[previous], &[next]);

    assert_eq!(merged.len(), 1);
    assert_eq!(merged[0].filament_name.as_deref(), Some("eSUN PLA+"));
    assert!(merged[0].observed_rfid_tag.is_none());
    assert!(merged[0].tray_uuid.is_none());
    assert!(merged[0].chip_id.is_none());
    assert!(merged[0].tray_info_idx.is_none());
    assert!(merged[0].tray_id_name.is_none());
    assert!(merged[0].last_identity_seen_at.is_none());
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
        nozzle_temp_min_c: None,
        nozzle_temp_max_c: None,
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
