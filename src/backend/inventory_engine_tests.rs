use super::{
    AssignPrinterSlotInput, CreateManualSpoolInput, CreatePrinterInput, CreateSpoolInput,
    DeleteSpoolInput, InventoryEngine, ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput,
    UpdateSpoolDetailsInput, WeightSource,
};
use crate::backend::filament_database::{
    BambuLiveIntegrationRow, BambuLiveObservedStateRow, BambuLiveObservedTrayRow, FilamentDatabase,
    ManualMasterInput,
};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-engine-{test_name}-{nanos}.db"))
}

#[test]
fn create_manual_borrowed_in_spool_registers_inbound_loan() {
    let db_path = temp_db_path("create-manual-borrowed-in");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "borrowed_spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Sky Blue".to_string(),
                hex_color: Some("#88ccff".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("borrowed-qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Alice".to_string()),
                owner_contact: Some("alice@example.com".to_string()),
                ownership_note: Some("Return after the prototype batch".to_string()),
                initial_weight_g: Some(850),
                location: Some("Shelf A".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let created_spool = engine
            .db
            .get_spool_by_id("borrowed_spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected borrowed spool to exist".to_string())?;
        assert_eq!(created_spool.ownership_type, "BORROWED_IN");
        assert_eq!(created_spool.owner_name.as_deref(), Some("Alice"));
        assert_eq!(
            created_spool.owner_contact.as_deref(),
            Some("alice@example.com")
        );

        let backup = engine
            .db
            .export_full_backup_json()
            .map_err(|error| error.to_string())?;
        let parsed: serde_json::Value =
            serde_json::from_str(&backup).map_err(|error| error.to_string())?;
        let loan_rows = parsed
            .get("tables")
            .and_then(|tables| tables.get("spool_loans"))
            .and_then(|rows| rows.as_array())
            .ok_or_else(|| "expected spool_loans table in backup export".to_string())?;
        let borrowed_in_loan = loan_rows
            .iter()
            .find(|row| {
                row.get("spool_id")
                    .and_then(|value| value.as_str())
                    .map(|value| value == "borrowed_spool_1")
                    .unwrap_or(false)
            })
            .ok_or_else(|| "expected inbound loan row for borrowed spool".to_string())?;

        assert_eq!(
            borrowed_in_loan
                .get("loan_direction")
                .and_then(|value| value.as_str()),
            Some("INBOUND")
        );
        assert_eq!(
            borrowed_in_loan
                .get("loan_status")
                .and_then(|value| value.as_str()),
            Some("ACTIVE")
        );
        assert_eq!(
            borrowed_in_loan
                .get("counterparty_name")
                .and_then(|value| value.as_str()),
            Some("Alice")
        );
        assert_eq!(
            borrowed_in_loan
                .get("grams_out")
                .and_then(|value| value.as_i64()),
            Some(850)
        );

        let outbound_loans = engine
            .list_spool_loans(20, true)
            .map_err(|error| error.to_string())?;
        assert!(outbound_loans.is_empty());

        let active_outbound_loans = engine
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert!(active_outbound_loans.is_empty());

        let lend_result = engine.lend_spool(super::LendSpoolInput {
            spool_id: "borrowed_spool_1".to_string(),
            borrower_name: "Bob".to_string(),
            grams_out: Some(850),
            note: None,
        });
        assert!(lend_result.is_err());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("create_manual_borrowed_in_spool_registers_inbound_loan test failed: {message}");
    }
}

#[test]
fn create_spool_with_location_persists_location_and_home_location() {
    let db_path = temp_db_path("create-spool-with-location");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        let master_id = engine
            .db
            .upsert_manual_master(ManualMasterInput {
                material: "PETG",
                filament_name: "HS",
                color_name: "Blue",
                hex_color: Some("#3366ff"),
                product_url: None,
                vendor: Some("eSUN"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        engine
            .create_spool(CreateSpoolInput {
                id: "spool_1".to_string(),
                master_id,
                qr_code: None,
                status: "IN_STOCK".to_string(),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                current_weight_g: Some(1000),
                location_id: Some("Shelf G".to_string()),
                home_location_id: None,
                purchase_date: None,
                purchase_price: None,
                batch_code: None,
            })
            .map_err(|error| error.to_string())?;

        let spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected created spool".to_string())?;
        assert_eq!(spool.location_id.as_deref(), Some("Shelf G"));
        assert_eq!(spool.home_location_id.as_deref(), Some("Shelf G"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("create_spool_with_location_persists_location_and_home_location failed: {message}");
    }
}

#[test]
fn delete_spool_clears_printer_slot_assignment() {
    let db_path = temp_db_path("delete-spool-clears-slot");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Bambu Lab P1S".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(4),
            })
            .map_err(|error| error.to_string())?;
        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Green".to_string(),
                hex_color: Some("#00B140".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("delete-slot-qr".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let slot_id = "printer_1_ams_1_slot_1";
        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: slot_id.to_string(),
                spool_id: Some("spool_1".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        engine
            .delete_spool(DeleteSpoolInput {
                spool_id: "spool_1".to_string(),
                reason: Some("Removed from active inventory".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let printer_overview = engine
            .db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = printer_overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == slot_id)
            .ok_or_else(|| "expected assigned slot to exist".to_string())?;
        assert!(slot.spool_id.is_none());

        let stored_spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected soft-deleted spool to remain for history".to_string())?;
        assert_eq!(stored_spool.status, "DELETED");
        assert!(stored_spool.location_id.is_none());

        let active_spools = engine
            .list_spools(20, 0)
            .map_err(|error| error.to_string())?;
        assert!(active_spools.is_empty());

        let history_rows = engine
            .list_spool_history("spool_1", 20)
            .map_err(|error| error.to_string())?;
        assert!(history_rows.iter().any(|row| row.event_type == "DELETED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("delete_spool_clears_printer_slot_assignment test failed: {message}");
    }
}

#[test]
fn delete_spool_rejects_active_loan() {
    let db_path = temp_db_path("delete-spool-active-loan");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Blue".to_string(),
                hex_color: Some("#2563EB".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("active-loan-delete-qr".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;
        engine
            .lend_spool(super::LendSpoolInput {
                spool_id: "spool_1".to_string(),
                borrower_name: "Alice".to_string(),
                grams_out: Some(800),
                note: None,
            })
            .map_err(|error| error.to_string())?;

        let delete_result = engine.delete_spool(DeleteSpoolInput {
            spool_id: "spool_1".to_string(),
            reason: Some("Accidental delete attempt".to_string()),
        });
        assert!(delete_result.is_err());

        let stored_spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected loaned spool to remain".to_string())?;
        assert_eq!(stored_spool.status, "BORROWED");
        assert_eq!(
            stored_spool.location_id.as_deref(),
            Some("Loaned to: Alice")
        );

        let active_loans = engine
            .list_active_spool_loans()
            .map_err(|error| error.to_string())?;
        assert_eq!(active_loans.len(), 1);

        let history_rows = engine
            .list_spool_history("spool_1", 20)
            .map_err(|error| error.to_string())?;
        assert!(!history_rows.iter().any(|row| row.event_type == "DELETED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("delete_spool_rejects_active_loan test failed: {message}");
    }
}

#[test]
fn return_borrowed_in_spool_hands_back_and_hides_from_inventory() {
    let db_path = temp_db_path("return-borrowed-in");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Bambu Lab P1S".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(4),
            })
            .map_err(|error| error.to_string())?;

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "borrowed_spool_2".to_string(),
                material: "PETG".to_string(),
                filament_name: "Translucent".to_string(),
                color_name: "Orange".to_string(),
                hex_color: Some("#ff9a3d".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("borrowed-qr-2".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Return once fit-checks are done".to_string()),
                initial_weight_g: Some(820),
                location: Some("Shelf B".to_string()),
            })
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ext_slot_1".to_string(),
                spool_id: Some("borrowed_spool_2".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        engine
            .update_spool_weight("borrowed_spool_2", 610, None, WeightSource::Manual)
            .map_err(|error| error.to_string())?;

        let inbound_loans = engine
            .list_spool_loans_for_direction(20, true, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_loans.len(), 1);

        let returned = engine
            .return_inbound_spool_loan(ReturnSpoolLoanInput {
                loan_id: inbound_loans[0].loan.id.clone(),
                returned_grams: 610,
                note: Some("Owner picked it up".to_string()),
            })
            .map_err(|error| error.to_string())?;

        assert_eq!(returned.loan_direction, "INBOUND");
        assert_eq!(returned.loan_status, "RETURNED");
        assert_eq!(returned.returned_grams, Some(610));
        assert_eq!(returned.consumed_grams, Some(210));

        let hidden_from_inventory = engine
            .list_spools(20, 0)
            .map_err(|error| error.to_string())?;
        assert!(hidden_from_inventory.is_empty());

        let stored_spool = engine
            .db
            .get_spool_by_id("borrowed_spool_2")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected handed-back spool row to remain for history".to_string())?;
        assert_eq!(stored_spool.status, "DELETED");
        assert_eq!(stored_spool.remaining_g, Some(610));

        let qr_lookup = engine
            .find_spool_by_qr("borrowed-qr-2")
            .map_err(|error| error.to_string())?;
        assert!(qr_lookup.is_none());

        let inbound_history = engine
            .list_spool_loans_for_direction(20, true, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_history.len(), 1);
        assert_eq!(inbound_history[0].loan.loan_status, "RETURNED");

        let outbound_history = engine
            .list_spool_loans(20, true)
            .map_err(|error| error.to_string())?;
        assert!(outbound_history.is_empty());

        let printer_overview = engine
            .db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let ext_slot = printer_overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == "printer_1_ext_slot_1")
            .ok_or_else(|| "expected printer ext slot to exist".to_string())?;
        assert!(ext_slot.spool_id.is_none());

        let history_rows = engine
            .list_spool_history("borrowed_spool_2", 20)
            .map_err(|error| error.to_string())?;
        assert!(history_rows
            .iter()
            .any(|row| row.event_type == "BORROWED_IN_RETURNED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "return_borrowed_in_spool_hands_back_and_hides_from_inventory test failed: {message}"
        );
    }
}

#[test]
fn assign_printer_slot_derives_unknown_live_rfid_override_on_host() {
    let db_path = temp_db_path("derive-host-rfid-override");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Bambu Lab P1S".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Green".to_string(),
                hex_color: Some("#00FF00".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-host-override".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf A".to_string()),
            })
            .map_err(|error| error.to_string())?;

        engine
            .db
            .save_bambu_live_integration(
                "printer_1",
                &BambuLiveIntegrationRow {
                    enabled: true,
                    host: Some("192.168.1.10".to_string()),
                    access_code: None,
                    printer_serial: Some("SERIAL-1".to_string()),
                    last_error: None,
                    observed_state: Some(BambuLiveObservedStateRow {
                        online: true,
                        last_seen_at: Some("2026-04-16T12:00:00Z".to_string()),
                        mqtt_connected: true,
                        progress_percent: None,
                        remaining_minutes: None,
                        prepare_percent: None,
                        print_stage: None,
                        print_error_code: None,
                        job_state_code: None,
                        gcode_state: None,
                        print_type: None,
                        subtask_id: None,
                        subtask_name: None,
                        active_ams_index: None,
                        active_tray_index: None,
                        nozzle_temp_c: None,
                        bed_temp_c: None,
                        ams_humidity_index: None,
                        ams_temperature_c: None,
                        ams_reading_bits: None,
                        ams_exist_bits: None,
                        ams_read_done_bits: None,
                        ams_bambu_bits: None,
                        ams_status_code: None,
                        ams_status_main: None,
                        ams_status_sub: None,
                        raw_status_note: None,
                        raw_payload_json: None,
                        trays: vec![BambuLiveObservedTrayRow {
                            ams_index: None,
                            tray_index: 0,
                            loaded: true,
                            filament_type: Some("PLA".to_string()),
                            filament_name: Some("Unknown".to_string()),
                            color_hex: Some("#00FF00".to_string()),
                            tray_weight_g: Some(1000),
                            remaining_percent: Some(82),
                            remaining_grams: Some(820),
                            observed_rfid_tag: None,
                            tray_uuid: Some("tray-uuid-unknown".to_string()),
                            chip_id: None,
                            tray_info_idx: None,
                            tray_id_name: None,
                            last_identity_seen_at: Some("2026-04-16T12:00:00Z".to_string()),
                            last_empty_seen_at: None,
                            empty_observation_count: Some(0),
                            matched_inventory_spool_id: None,
                            matched_inventory_mode: None,
                            match_status: Some("unknown_rfid".to_string()),
                            match_note: Some("RFID not registered".to_string()),
                        }],
                    }),
                },
            )
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: Some("spool_1".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        let printer_overview = engine
            .db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = printer_overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "expected ams slot".to_string())?;

        assert_eq!(slot.spool_id.as_deref(), Some("spool_1"));
        assert_eq!(
            slot.rfid_override_tray_uuid.as_deref(),
            Some("tray-uuid-unknown")
        );
        assert_eq!(slot.rfid_override_color_hex.as_deref(), Some("#00FF00"));
        assert!(slot.live_cache_cleared_at.is_none());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("assign_printer_slot_derives_unknown_live_rfid_override_on_host failed: {message}");
    }
}

#[test]
fn assign_printer_slot_derives_manual_clear_cache_suppression_on_host() {
    let db_path = temp_db_path("derive-host-clear-cache");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Bambu Lab P1S".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#FFFFFF".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-host-clear".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf B".to_string()),
            })
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: Some("spool_1".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: None,
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        let printer_overview = engine
            .db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = printer_overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "expected ams slot".to_string())?;

        assert!(slot.spool_id.is_none());
        assert!(slot.rfid_override_tray_uuid.is_none());
        assert!(slot.rfid_override_color_hex.is_none());
        assert!(slot.live_cache_cleared_at.is_some());
        let restored_spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected restored spool".to_string())?;
        assert_eq!(restored_spool.location_id.as_deref(), Some("Shelf B"));
        assert_eq!(restored_spool.home_location_id.as_deref(), Some("Shelf B"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "assign_printer_slot_derives_manual_clear_cache_suppression_on_host failed: {message}"
        );
    }
}

#[test]
fn assign_printer_slot_derives_manual_reassignment_cache_suppression_on_host() {
    let db_path = temp_db_path("derive-host-reassign-cache");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Bambu Lab P1S".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        for (spool_id, color_name, hex_color) in [
            ("spool_old", "Black", "#000000"),
            ("spool_new", "Orange", "#FF7A00"),
        ] {
            engine
                .create_manual_spool(CreateManualSpoolInput {
                    id: spool_id.to_string(),
                    material: "PLA".to_string(),
                    filament_name: "Basic".to_string(),
                    color_name: color_name.to_string(),
                    hex_color: Some(hex_color.to_string()),
                    product_url: None,
                    vendor: Some("Manual".to_string()),
                    default_weight_g: Some(1000),
                    qr_code: Some(format!("qr-{spool_id}")),
                    status: Some("IN_STOCK".to_string()),
                    ownership_type: Some("OWNED".to_string()),
                    owner_name: None,
                    owner_contact: None,
                    ownership_note: None,
                    initial_weight_g: Some(1000),
                    location: Some("Shelf C".to_string()),
                })
                .map_err(|error| error.to_string())?;
        }

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: Some("spool_old".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: Some("spool_new".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        let printer_overview = engine
            .db
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = printer_overview[0]
            .slots
            .iter()
            .find(|slot| slot.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "expected ams slot".to_string())?;

        assert_eq!(slot.spool_id.as_deref(), Some("spool_new"));
        assert!(slot.rfid_override_tray_uuid.is_none());
        assert!(slot.rfid_override_color_hex.is_none());
        assert!(slot.live_cache_cleared_at.is_some());
        let old_spool = engine
            .db
            .get_spool_by_id("spool_old")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected previous spool".to_string())?;
        assert_eq!(old_spool.location_id.as_deref(), Some("Shelf C"));
        assert_eq!(old_spool.home_location_id.as_deref(), Some("Shelf C"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "assign_printer_slot_derives_manual_reassignment_cache_suppression_on_host failed: {message}"
        );
    }
}

#[test]
fn update_spool_details_syncs_home_location_to_current_location_when_unassigned() {
    let db_path = temp_db_path("sync-home-location-when-unassigned");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PETG".to_string(),
                filament_name: "Blue".to_string(),
                color_name: "Blue".to_string(),
                hex_color: Some("#2F6DFF".to_string()),
                product_url: None,
                vendor: Some("eSUN".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-sync-home".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: None,
            })
            .map_err(|error| error.to_string())?;

        engine
            .update_spool_details(UpdateSpoolDetailsInput {
                spool_id: "spool_1".to_string(),
                qr_code: Some("qr-sync-home".to_string()),
                status: "IN_STOCK".to_string(),
                location: None,
                home_location: Some(Some("Shelf D".to_string())),
            })
            .map_err(|error| error.to_string())?;

        let spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected updated spool".to_string())?;
        assert_eq!(spool.home_location_id.as_deref(), Some("Shelf D"));
        assert_eq!(spool.location_id.as_deref(), Some("Shelf D"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "update_spool_details_syncs_home_location_to_current_location_when_unassigned failed: {message}"
        );
    }
}

#[test]
fn update_spool_details_keeps_active_inbound_location_while_updating_home_location() {
    let db_path = temp_db_path("keep-active-inbound-location-when-updating-home");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "borrowed_spool_1".to_string(),
                material: "PETG".to_string(),
                filament_name: "Translucent".to_string(),
                color_name: "Orange".to_string(),
                hex_color: Some("#ff9a3d".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("borrowed-qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Return once fit-checks are done".to_string()),
                initial_weight_g: Some(820),
                location: Some("Shelf B".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let borrowed_before = engine
            .db
            .get_spool_by_id("borrowed_spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected borrowed-in spool".to_string())?;

        engine
            .update_spool_details(UpdateSpoolDetailsInput {
                spool_id: "borrowed_spool_1".to_string(),
                qr_code: borrowed_before.qr_code.clone(),
                status: borrowed_before.status.clone(),
                location: None,
                home_location: Some(Some("Owner Shelf".to_string())),
            })
            .map_err(|error| error.to_string())?;

        let borrowed_after = engine
            .db
            .get_spool_by_id("borrowed_spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected updated borrowed-in spool".to_string())?;
        assert_eq!(
            borrowed_after.home_location_id.as_deref(),
            Some("Owner Shelf")
        );
        assert_eq!(borrowed_after.location_id.as_deref(), Some("Shelf B"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "update_spool_details_keeps_active_inbound_location_while_updating_home_location failed: {message}"
        );
    }
}

#[test]
fn update_spool_details_keeps_printer_location_while_updating_home_location() {
    let db_path = temp_db_path("keep-printer-location-when-updating-home");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "P1S".to_string(),
                name: "Brutus".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#FFFFFF".to_string()),
                product_url: None,
                vendor: Some("Bambu".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-keep-printer-location".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf E".to_string()),
            })
            .map_err(|error| error.to_string())?;

        engine
            .assign_printer_slot(AssignPrinterSlotInput {
                printer_id: "printer_1".to_string(),
                slot_id: "printer_1_ams_1_slot_1".to_string(),
                spool_id: Some("spool_1".to_string()),
                rfid_override_tray_uuid: None,
                rfid_override_color_hex: None,
                clear_live_cache_before_next_refresh: None,
            })
            .map_err(|error| error.to_string())?;

        let assigned_before = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected assigned spool".to_string())?;

        engine
            .update_spool_details(UpdateSpoolDetailsInput {
                spool_id: "spool_1".to_string(),
                qr_code: assigned_before.qr_code.clone(),
                status: assigned_before.status.clone(),
                location: assigned_before.location_id.clone(),
                home_location: Some(Some("Shelf F".to_string())),
            })
            .map_err(|error| error.to_string())?;

        let spool = engine
            .db
            .get_spool_by_id("spool_1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected updated spool".to_string())?;
        assert_eq!(spool.home_location_id.as_deref(), Some("Shelf F"));
        assert!(spool
            .location_id
            .as_deref()
            .is_some_and(|value| value.starts_with("Printer:")));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "update_spool_details_keeps_printer_location_while_updating_home_location failed: {message}"
        );
    }
}

#[test]
fn update_borrowed_in_spool_updates_spool_and_active_inbound_loan() {
    let db_path = temp_db_path("update-borrowed-in");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "borrowed_spool_3".to_string(),
                material: "PLA".to_string(),
                filament_name: "Matte".to_string(),
                color_name: "Black".to_string(),
                hex_color: Some("#111111".to_string()),
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("borrowed-qr-3".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Alice".to_string()),
                owner_contact: Some("alice@example.com".to_string()),
                ownership_note: Some("Prototype batch".to_string()),
                initial_weight_g: Some(910),
                location: Some("Shelf C".to_string()),
            })
            .map_err(|error| error.to_string())?;

        engine
            .update_borrowed_in_spool(UpdateBorrowedInSpoolInput {
                spool_id: "borrowed_spool_3".to_string(),
                owner_name: "Carla".to_string(),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Return after print-fit review".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let updated_spool = engine
            .db
            .get_spool_with_master_by_id("borrowed_spool_3")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected updated borrowed-in spool".to_string())?;
        assert_eq!(updated_spool.spool.owner_name.as_deref(), Some("Carla"));
        assert_eq!(
            updated_spool.spool.owner_contact.as_deref(),
            Some("carla@example.com")
        );
        assert_eq!(
            updated_spool.spool.ownership_note.as_deref(),
            Some("Return after print-fit review")
        );

        let inbound_loans = engine
            .list_spool_loans_for_direction(20, false, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_loans.len(), 1);
        assert_eq!(inbound_loans[0].loan.counterparty_name, "Carla");
        assert_eq!(
            inbound_loans[0].loan.counterparty_contact.as_deref(),
            Some("carla@example.com")
        );
        assert_eq!(
            inbound_loans[0].loan.counterparty_note.as_deref(),
            Some("Return after print-fit review")
        );

        let history_rows = engine
            .list_spool_history("borrowed_spool_3", 20)
            .map_err(|error| error.to_string())?;
        assert!(history_rows
            .iter()
            .any(|row| row.event_type == "DETAILS_UPDATED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "update_borrowed_in_spool_updates_spool_and_active_inbound_loan test failed: {message}"
        );
    }
}
