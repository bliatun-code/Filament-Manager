use super::CompanionService;
use crate::backend::filament_database::{
    BambuLiveIntegrationRow, BambuLiveObservedStateRow, BambuLiveObservedTrayRow, FilamentDatabase,
    ManualMasterInput, SpoolRow,
};
use crate::backend::inventory_engine::{
    CreateManualSpoolInput, CreatePrinterInput, InventoryEngine, LendSpoolInput,
    ReturnSpoolLoanInput, UpdateBorrowedInSpoolInput, UpdateSpoolDetailsInput, WeightSource,
};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

fn temp_db_path(test_name: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    std::env::temp_dir().join(format!("filament-manager-companion-{test_name}-{nanos}.db"))
}

#[test]
fn companion_service_returns_spool_detail_and_updates_weight() {
    let db_path = temp_db_path("spool-detail");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());

        let before = service
            .get_spool_detail("spool_1", Some(50), Some(200))
            .map_err(|error| error.to_string())?;
        assert_eq!(before.spool.spool.id, "spool_1");
        assert!(!before.history.is_empty());

        service
            .update_spool_weight("spool_1", 780, None, WeightSource::Manual)
            .map_err(|error| error.to_string())?;

        let after = service
            .get_spool_detail("spool_1", Some(50), Some(200))
            .map_err(|error| error.to_string())?;
        assert_eq!(after.spool.spool.remaining_g, Some(780));
        assert!(after
            .history
            .iter()
            .any(|row| row.event_type == "WEIGHT_UPDATED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_returns_spool_detail_and_updates_weight failed: {message}");
    }
}

#[test]
fn companion_service_creates_borrowed_in_manual_spool() {
    let db_path = temp_db_path("borrowed-in-create");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        service
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_borrowed_1".to_string(),
                material: "PETG".to_string(),
                filament_name: "Prototype".to_string(),
                color_name: "Blue".to_string(),
                hex_color: None,
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(850),
                qr_code: None,
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Return after fit-checks".to_string()),
                initial_weight_g: Some(850),
                location: Some("Borrowed Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let detail = service
            .get_spool_detail("spool_borrowed_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.spool.spool.ownership_type, "BORROWED_IN");
        assert_eq!(detail.spool.spool.owner_name.as_deref(), Some("Carla"));
        assert_eq!(detail.spool.spool.remaining_g, Some(850));
        assert_eq!(
            detail
                .active_loan
                .as_ref()
                .map(|row| row.loan.loan_direction.as_str()),
            Some("INBOUND")
        );
        assert!(detail
            .history
            .iter()
            .any(|row| row.event_type == "BORROWED_IN_REGISTERED"));

        let inbound_loans = service
            .list_spool_loans(20, false, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_loans.len(), 1);
        assert_eq!(inbound_loans[0].loan.spool_id, "spool_borrowed_1");
        assert_eq!(inbound_loans[0].loan.loan_direction, "INBOUND");
        assert_eq!(inbound_loans[0].loan.loan_status, "ACTIVE");

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_creates_borrowed_in_manual_spool failed: {message}");
    }
}

#[test]
fn companion_service_finds_old_active_inbound_loan_in_spool_detail() {
    let db_path = temp_db_path("borrowed-in-detail-old-active-loan");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;

        let master_id = db
            .upsert_manual_master(ManualMasterInput {
                material: "PETG",
                filament_name: "Shared",
                color_name: "Blue",
                hex_color: Some("#2563EB"),
                product_url: None,
                vendor: Some("Generic"),
                default_weight: Some(1000),
            })
            .map_err(|error| error.to_string())?;

        let make_spool = |id: &str| SpoolRow {
            id: id.to_string(),
            master_id: master_id.clone(),
            qr_code: None,
            rfid_tag: None,
            rfid_observed_at: None,
            status: "IN_STOCK".to_string(),
            ownership_type: "BORROWED_IN".to_string(),
            owner_name: Some("Carla".to_string()),
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
        };

        db.insert_spool(&make_spool("target_borrowed_spool"))
            .map_err(|error| error.to_string())?;
        db.create_inbound_spool_loan("target_borrowed_spool", "Carla", None, None, 1000)
            .map_err(|error| error.to_string())?;

        std::thread::sleep(Duration::from_secs(1));

        for index in 0..251 {
            let spool_id = format!("recent_borrowed_spool_{index}");
            db.insert_spool(&make_spool(&spool_id))
                .map_err(|error| error.to_string())?;
            db.create_inbound_spool_loan(&spool_id, "Carla", None, None, 1000)
                .map_err(|error| error.to_string())?;
        }

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let detail = service
            .get_spool_detail("target_borrowed_spool", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        let active_loan = detail
            .active_loan
            .ok_or_else(|| "missing old active inbound loan in spool detail".to_string())?;
        assert_eq!(active_loan.loan.spool_id, "target_borrowed_spool");
        assert_eq!(active_loan.loan.loan_direction, "INBOUND");

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_finds_old_active_inbound_loan_in_spool_detail failed: {message}");
    }
}

#[test]
fn companion_service_finds_spool_by_qr() {
    let db_path = temp_db_path("find-by-qr");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_qr_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("lookup-qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let matched = service
            .find_spool_by_qr("lookup-qr-1")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected spool link lookup to find spool".to_string())?;

        assert_eq!(matched.spool.id, "spool_qr_1");
        assert_eq!(matched.spool.qr_code.as_deref(), Some("lookup-qr-1"));
        assert_eq!(matched.master.filament_name, "Basic");
        assert!(service
            .find_spool_by_qr("missing-qr")
            .map_err(|error| error.to_string())?
            .is_none());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_finds_spool_by_qr failed: {message}");
    }
}

#[test]
fn companion_service_finds_spool_row_by_id_when_qr_code_is_missing() {
    let db_path = temp_db_path("find-row-by-qr-or-id");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_qr_2".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Black".to_string(),
                hex_color: Some("#111111".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: None,
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let matched = service
            .find_spool_row_by_qr_or_id("spool_qr_2")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected QR/id lookup to find spool".to_string())?;

        assert_eq!(matched.id, "spool_qr_2");
        assert_eq!(matched.qr_code, None);

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_finds_spool_row_by_id_when_qr_code_is_missing failed: {message}");
    }
}

#[test]
fn companion_service_finds_spool_detail_by_id_when_qr_code_is_missing() {
    let db_path = temp_db_path("find-detail-by-qr-or-id");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_qr_3".to_string(),
                material: "PETG".to_string(),
                filament_name: "Tough".to_string(),
                color_name: "Blue".to_string(),
                hex_color: Some("#2563EB".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: None,
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let matched = service
            .find_spool_by_qr("spool_qr_3")
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "expected QR/id lookup to find spool detail".to_string())?;

        assert_eq!(matched.spool.id, "spool_qr_3");
        assert_eq!(matched.spool.qr_code, None);
        assert_eq!(matched.master.material, "PETG");

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_service_finds_spool_detail_by_id_when_qr_code_is_missing failed: {message}"
        );
    }
}

#[test]
fn companion_service_updates_borrowed_in_spool_metadata() {
    let db_path = temp_db_path("borrowed-in-update");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_borrowed_edit_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Sample".to_string(),
                color_name: "Green".to_string(),
                hex_color: None,
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("borrowed-edit-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Original owner note".to_string()),
                initial_weight_g: Some(1000),
                location: Some("Borrowed Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        service
            .update_borrowed_in_spool(UpdateBorrowedInSpoolInput {
                spool_id: "spool_borrowed_edit_1".to_string(),
                owner_name: "Nora".to_string(),
                owner_contact: Some("nora@example.com".to_string()),
                ownership_note: Some("Return after finishing the sample set".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let detail = service
            .get_spool_detail("spool_borrowed_edit_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.spool.spool.owner_name.as_deref(), Some("Nora"));
        assert_eq!(
            detail.spool.spool.owner_contact.as_deref(),
            Some("nora@example.com")
        );
        assert_eq!(
            detail.spool.spool.ownership_note.as_deref(),
            Some("Return after finishing the sample set")
        );
        assert!(detail
            .history
            .iter()
            .any(|row| row.event_type == "DETAILS_UPDATED"));

        let inbound_loans = service
            .list_spool_loans(20, false, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_loans.len(), 1);
        assert_eq!(inbound_loans[0].loan.spool_id, "spool_borrowed_edit_1");
        assert_eq!(inbound_loans[0].loan.counterparty_name, "Nora");
        assert_eq!(
            inbound_loans[0].loan.counterparty_contact.as_deref(),
            Some("nora@example.com")
        );
        assert_eq!(
            inbound_loans[0].loan.counterparty_note.as_deref(),
            Some("Return after finishing the sample set")
        );
        assert_eq!(
            inbound_loans[0].loan.lent_note.as_deref(),
            Some("Return after finishing the sample set")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_updates_borrowed_in_spool_metadata failed: {message}");
    }
}

#[test]
fn companion_service_updates_spool_details() {
    let db_path = temp_db_path("spool-details-update");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_detail_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "Silver".to_string(),
                hex_color: Some("#cccccc".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("detail-qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf A".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        service
            .update_spool_details(UpdateSpoolDetailsInput {
                spool_id: "spool_detail_1".to_string(),
                qr_code: Some("detail-qr-2".to_string()),
                status: "LOST".to_string(),
                location: Some("Archive Bin".to_string()),
                home_location: None,
            })
            .map_err(|error| error.to_string())?;

        let detail = service
            .get_spool_detail("spool_detail_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.spool.spool.status, "LOST");
        assert_eq!(
            detail.spool.spool.location_id.as_deref(),
            Some("Archive Bin")
        );
        assert_eq!(detail.spool.spool.qr_code.as_deref(), Some("detail-qr-2"));
        assert!(detail
            .history
            .iter()
            .any(|row| row.event_type == "DETAILS_UPDATED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_updates_spool_details failed: {message}");
    }
}

#[test]
fn companion_service_assigns_and_clears_printer_slot() {
    let db_path = temp_db_path("assign-slot");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
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
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let printer = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|row| row.printer.id == "printer_1")
            .ok_or_else(|| "missing printer overview".to_string())?;
        let slot_id = printer
            .slots
            .first()
            .map(|slot| slot.slot_id.clone())
            .ok_or_else(|| "missing printer slot".to_string())?;

        service
            .assign_printer_slot("printer_1", &slot_id, Some("spool_1"), None, None, false)
            .map_err(|error| error.to_string())?;

        let after_assign = service
            .get_spool_detail("spool_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(after_assign.spool.spool.status, "ASSIGNED");
        assert_eq!(
            after_assign.spool.spool.location_id,
            Some(format!("Printer:Bench Printer:{slot_id}"))
        );

        service
            .assign_printer_slot("printer_1", &slot_id, None, None, None, false)
            .map_err(|error| error.to_string())?;

        let cleared_printer = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?
            .into_iter()
            .find(|row| row.printer.id == "printer_1")
            .ok_or_else(|| "missing printer overview after clear".to_string())?;
        assert!(cleared_printer
            .slots
            .iter()
            .all(|slot| slot.slot_id != slot_id || slot.spool_id.is_none()));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_assigns_and_clears_printer_slot failed: {message}");
    }
}

#[test]
fn companion_service_list_printer_overview_exposes_live_slot_snapshot() {
    let db_path = temp_db_path("printer-live-overview");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(1),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.10".to_string()),
                access_code: None,
                access_code_configured: false,
                access_code_binding_id: None,
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL-1".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: Some(BambuLiveObservedStateRow {
                    online: true,
                    last_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                    mqtt_connected: true,
                    progress_percent: Some(27),
                    remaining_minutes: Some(18),
                    prepare_percent: None,
                    print_stage: None,
                    print_error_code: None,
                    job_state_code: None,
                    gcode_state: Some("RUNNING".to_string()),
                    print_type: Some("local".to_string()),
                    subtask_id: Some("benchy-1".to_string()),
                    subtask_name: Some("Benchy".to_string()),
                    active_ams_index: None,
                    active_tray_index: Some(0),
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
                        nozzle_temp_min_c: None,
                        nozzle_temp_max_c: None,
                        last_identity_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
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

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let overview = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "missing printer slot".to_string())?;

        assert_eq!(slot.live_tray_uuid.as_deref(), Some("tray-uuid-unknown"));
        assert_eq!(slot.live_color_hex.as_deref(), Some("#00FF00"));
        assert_eq!(slot.live_match_status.as_deref(), Some("unknown_rfid"));
        assert_eq!(
            slot.live_last_identity_seen_at.as_deref(),
            Some("2026-04-16T14:00:00Z")
        );
        assert_eq!(slot.live_is_active, Some(true));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_service_list_printer_overview_exposes_live_slot_snapshot failed: {message}"
        );
    }
}

#[test]
fn companion_service_keeps_flat_bambu_live_tray_on_first_ams_only() {
    let db_path = temp_db_path("printer-live-flat-tray-first-ams-only");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(2),
                slots_per_ams: Some(4),
            })
            .map_err(|error| error.to_string())?;

        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.10".to_string()),
                access_code: None,
                access_code_configured: false,
                access_code_binding_id: None,
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL-1".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: Some(BambuLiveObservedStateRow {
                    online: true,
                    last_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                    mqtt_connected: true,
                    progress_percent: Some(27),
                    remaining_minutes: Some(18),
                    prepare_percent: None,
                    print_stage: None,
                    print_error_code: None,
                    job_state_code: None,
                    gcode_state: Some("RUNNING".to_string()),
                    print_type: Some("local".to_string()),
                    subtask_id: Some("benchy-1".to_string()),
                    subtask_name: Some("Benchy".to_string()),
                    active_ams_index: None,
                    active_tray_index: Some(0),
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
                        filament_name: Some("AMS 1 spool".to_string()),
                        color_hex: Some("#00FF00".to_string()),
                        tray_weight_g: Some(1000),
                        remaining_percent: Some(82),
                        remaining_grams: Some(820),
                        observed_rfid_tag: None,
                        tray_uuid: Some("tray-uuid-ams-1".to_string()),
                        chip_id: None,
                        tray_info_idx: None,
                        tray_id_name: None,
                        nozzle_temp_min_c: None,
                        nozzle_temp_max_c: None,
                        last_identity_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
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

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let overview = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let ams_1_slot_1 = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "missing AMS 1 slot".to_string())?;
        let ams_2_slot_1 = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ams_2_slot_1")
            .ok_or_else(|| "missing AMS 2 slot".to_string())?;

        assert_eq!(
            ams_1_slot_1.live_tray_uuid.as_deref(),
            Some("tray-uuid-ams-1")
        );
        assert_eq!(ams_1_slot_1.live_is_active, Some(true));
        assert!(ams_2_slot_1.live_tray_uuid.is_none());
        assert!(ams_2_slot_1.live_filament_name.is_none());
        assert_eq!(ams_2_slot_1.live_is_active, Some(false));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_keeps_flat_bambu_live_tray_on_first_ams_only failed: {message}");
    }
}

#[test]
fn companion_service_maps_indexed_bambu_live_tray_to_second_ams() {
    let db_path = temp_db_path("printer-live-indexed-tray-second-ams");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(2),
                slots_per_ams: Some(4),
            })
            .map_err(|error| error.to_string())?;

        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.10".to_string()),
                access_code: None,
                access_code_configured: false,
                access_code_binding_id: None,
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL-1".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: Some(BambuLiveObservedStateRow {
                    online: true,
                    last_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                    mqtt_connected: true,
                    progress_percent: Some(27),
                    remaining_minutes: Some(18),
                    prepare_percent: None,
                    print_stage: None,
                    print_error_code: None,
                    job_state_code: None,
                    gcode_state: Some("RUNNING".to_string()),
                    print_type: Some("local".to_string()),
                    subtask_id: Some("benchy-1".to_string()),
                    subtask_name: Some("Benchy".to_string()),
                    active_ams_index: Some(1),
                    active_tray_index: Some(0),
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
                        ams_index: Some(1),
                        tray_index: 0,
                        loaded: true,
                        filament_type: Some("PLA".to_string()),
                        filament_name: Some("AMS 2 spool".to_string()),
                        color_hex: Some("#FF0000".to_string()),
                        tray_weight_g: Some(1000),
                        remaining_percent: Some(82),
                        remaining_grams: Some(820),
                        observed_rfid_tag: None,
                        tray_uuid: Some("tray-uuid-ams-2".to_string()),
                        chip_id: None,
                        tray_info_idx: None,
                        tray_id_name: None,
                        nozzle_temp_min_c: None,
                        nozzle_temp_max_c: None,
                        last_identity_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
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

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let overview = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let ams_1_slot_1 = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ams_1_slot_1")
            .ok_or_else(|| "missing AMS 1 slot".to_string())?;
        let ams_2_slot_1 = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ams_2_slot_1")
            .ok_or_else(|| "missing AMS 2 slot".to_string())?;

        assert!(ams_1_slot_1.live_tray_uuid.is_none());
        assert_eq!(ams_1_slot_1.live_is_active, Some(false));
        assert_eq!(
            ams_2_slot_1.live_tray_uuid.as_deref(),
            Some("tray-uuid-ams-2")
        );
        assert_eq!(
            ams_2_slot_1.live_filament_name.as_deref(),
            Some("AMS 2 spool")
        );
        assert_eq!(ams_2_slot_1.live_is_active, Some(true));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_maps_indexed_bambu_live_tray_to_second_ams failed: {message}");
    }
}

#[test]
fn companion_service_list_printer_overview_maps_bambu_external_live_tray() {
    let db_path = temp_db_path("printer-live-external-overview");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_printer(CreatePrinterInput {
                id: "printer_1".to_string(),
                model: "Bambu X1C".to_string(),
                name: "Bench Printer".to_string(),
                ams_units: Some(0),
                slots_per_ams: Some(1),
            })
            .map_err(|error| error.to_string())?;

        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.save_bambu_live_integration(
            "printer_1",
            &BambuLiveIntegrationRow {
                enabled: true,
                host: Some("192.168.1.10".to_string()),
                access_code: None,
                access_code_configured: false,
                access_code_binding_id: None,
                access_code_stale_binding_ids: Vec::new(),
                printer_serial: Some("SERIAL-1".to_string()),
                last_error: None,
                tls_identity: None,
                observed_state: Some(BambuLiveObservedStateRow {
                    online: true,
                    last_seen_at: Some("2026-04-16T14:00:00Z".to_string()),
                    mqtt_connected: true,
                    progress_percent: Some(27),
                    remaining_minutes: Some(18),
                    prepare_percent: None,
                    print_stage: None,
                    print_error_code: None,
                    job_state_code: Some(4),
                    gcode_state: Some("RUNNING".to_string()),
                    print_type: Some("local".to_string()),
                    subtask_id: Some("benchy-1".to_string()),
                    subtask_name: Some("Benchy".to_string()),
                    active_ams_index: None,
                    active_tray_index: Some(255),
                    nozzle_temp_c: None,
                    bed_temp_c: None,
                    ams_humidity_index: None,
                    ams_temperature_c: None,
                    ams_reading_bits: None,
                    ams_exist_bits: Some("0010".to_string()),
                    ams_read_done_bits: None,
                    ams_bambu_bits: None,
                    ams_status_code: None,
                    ams_status_main: None,
                    ams_status_sub: None,
                    raw_status_note: None,
                    raw_payload_json: None,
                    trays: vec![BambuLiveObservedTrayRow {
                        ams_index: None,
                        tray_index: 255,
                        loaded: true,
                        filament_type: Some("PLA".to_string()),
                        filament_name: Some("External spool".to_string()),
                        color_hex: Some("#2255AA".to_string()),
                        tray_weight_g: Some(1000),
                        remaining_percent: Some(82),
                        remaining_grams: Some(820),
                        observed_rfid_tag: None,
                        tray_uuid: None,
                        chip_id: None,
                        tray_info_idx: Some("EXTERNAL_PRESET".to_string()),
                        tray_id_name: Some("Bambu PLA Basic @BBL P1S 0.4 nozzle".to_string()),
                        nozzle_temp_min_c: Some(190.0),
                        nozzle_temp_max_c: Some(240.0),
                        last_identity_seen_at: None,
                        last_empty_seen_at: None,
                        empty_observation_count: Some(0),
                        matched_inventory_spool_id: None,
                        matched_inventory_mode: None,
                        match_status: Some("unknown_from_printer".to_string()),
                        match_note: Some(
                            "AMS reported an RFID/AMS identity that is not registered in inventory."
                                .to_string(),
                        ),
                    }],
                }),
            },
        )
        .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let overview = service
            .list_printer_overview()
            .map_err(|error| error.to_string())?;
        let slot = overview[0]
            .slots
            .iter()
            .find(|row| row.slot_id == "printer_1_ext_slot_1")
            .ok_or_else(|| "missing external printer slot".to_string())?;

        assert_eq!(slot.live_filament_type.as_deref(), Some("PLA"));
        assert_eq!(slot.live_filament_name.as_deref(), Some("External spool"));
        assert_eq!(slot.live_color_hex.as_deref(), Some("#2255AA"));
        assert_eq!(slot.live_tray_info_idx.as_deref(), Some("EXTERNAL_PRESET"));
        assert_eq!(slot.live_ams_exist_bits.as_deref(), Some("0010"));
        assert_eq!(
            slot.live_tray_id_name.as_deref(),
            Some("Bambu PLA Basic @BBL P1S 0.4 nozzle")
        );
        assert_eq!(slot.live_nozzle_temp_min_c, Some(190.0));
        assert_eq!(slot.live_nozzle_temp_max_c, Some(240.0));
        assert!(slot.live_last_identity_seen_at.is_none());
        assert_eq!(slot.live_is_active, Some(true));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!(
            "companion_service_list_printer_overview_maps_bambu_external_live_tray failed: {message}"
        );
    }
}

#[test]
fn companion_service_hands_back_borrowed_in_spool() {
    let db_path = temp_db_path("borrowed-in-hand-back");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_borrowed_return_1".to_string(),
                material: "PETG".to_string(),
                filament_name: "Borrowed".to_string(),
                color_name: "Black".to_string(),
                hex_color: None,
                product_url: None,
                vendor: Some("Generic".to_string()),
                default_weight_g: Some(820),
                qr_code: Some("borrowed-return-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("BORROWED_IN".to_string()),
                owner_name: Some("Carla".to_string()),
                owner_contact: Some("carla@example.com".to_string()),
                ownership_note: Some("Return after fixture print".to_string()),
                initial_weight_g: Some(820),
                location: Some("Borrowed Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let detail = service
            .get_spool_detail("spool_borrowed_return_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        let loan_id = detail
            .active_loan
            .as_ref()
            .map(|row| row.loan.id.clone())
            .ok_or_else(|| "missing active inbound loan".to_string())?;

        let returned = service
            .return_inbound_spool_loan(ReturnSpoolLoanInput {
                loan_id,
                returned_grams: 760,
                note: Some("Handed back after fixture print".to_string()),
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(returned.loan_direction, "INBOUND");
        assert_eq!(returned.loan_status, "RETURNED");
        assert_eq!(returned.returned_grams, Some(760));

        let hidden_spool = service
            .get_spool("spool_borrowed_return_1")
            .map_err(|error| error.to_string())?;
        assert!(hidden_spool.is_none());

        let inbound_loans = service
            .list_spool_loans(20, true, Some("INBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(inbound_loans.len(), 1);
        assert_eq!(
            inbound_loans[0].loan.return_note.as_deref(),
            Some("Handed back after fixture print")
        );

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_hands_back_borrowed_in_spool failed: {message}");
    }
}

#[test]
fn companion_service_lends_spool() {
    let db_path = temp_db_path("lend-spool");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let loan = service
            .lend_spool(LendSpoolInput {
                spool_id: "spool_1".to_string(),
                borrower_name: "Alice".to_string(),
                grams_out: Some(720),
                note: Some("Prototype batch".to_string()),
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(loan.borrower_name, "Alice");
        assert_eq!(loan.grams_out, 720);

        let detail = service
            .get_spool_detail("spool_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.spool.spool.status, "BORROWED");
        assert_eq!(detail.spool.spool.remaining_g, Some(720));
        assert_eq!(
            detail.spool.spool.location_id.as_deref(),
            Some("Loaned to: Alice")
        );
        assert!(detail.active_loan.is_some());
        assert!(detail
            .history
            .iter()
            .any(|row| row.event_type == "LOANED_OUT"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_lends_spool failed: {message}");
    }
}

#[test]
fn companion_service_returns_outbound_loan() {
    let db_path = temp_db_path("return-loan");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());
        let loan = service
            .lend_spool(LendSpoolInput {
                spool_id: "spool_1".to_string(),
                borrower_name: "Alice".to_string(),
                grams_out: Some(720),
                note: None,
            })
            .map_err(|error| error.to_string())?;

        let returned = service
            .return_spool_loan(ReturnSpoolLoanInput {
                loan_id: loan.id.clone(),
                returned_grams: 660,
                note: Some("Returned after test print".to_string()),
            })
            .map_err(|error| error.to_string())?;
        assert_eq!(returned.loan_status, "RETURNED");
        assert_eq!(returned.returned_grams, Some(660));

        let detail = service
            .get_spool_detail("spool_1", Some(20), Some(50))
            .map_err(|error| error.to_string())?;
        assert_eq!(detail.spool.spool.status, "IN_STOCK");
        assert_eq!(detail.spool.spool.remaining_g, Some(660));
        assert!(detail.active_loan.is_none());
        assert!(detail
            .history
            .iter()
            .any(|row| row.event_type == "LOAN_RETURNED"));

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_returns_outbound_loan failed: {message}");
    }
}

#[test]
fn companion_service_lists_outbound_loan_history() {
    let db_path = temp_db_path("loan-history");

    let result = (|| -> Result<(), String> {
        let db = FilamentDatabase::open(&db_path).map_err(|error| error.to_string())?;
        db.apply_schema().map_err(|error| error.to_string())?;
        let engine = InventoryEngine::new(db);

        engine
            .create_manual_spool(CreateManualSpoolInput {
                id: "spool_1".to_string(),
                material: "PLA".to_string(),
                filament_name: "Basic".to_string(),
                color_name: "White".to_string(),
                hex_color: Some("#ffffff".to_string()),
                product_url: None,
                vendor: Some("Manual".to_string()),
                default_weight_g: Some(1000),
                qr_code: Some("qr-1".to_string()),
                status: Some("IN_STOCK".to_string()),
                ownership_type: Some("OWNED".to_string()),
                owner_name: None,
                owner_contact: None,
                ownership_note: None,
                initial_weight_g: Some(1000),
                location: Some("Shelf".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let service = CompanionService::new(db_path.to_string_lossy().to_string());

        let loan = service
            .lend_spool(LendSpoolInput {
                spool_id: "spool_1".to_string(),
                borrower_name: "Alice".to_string(),
                grams_out: Some(700),
                note: Some("Prototype loan".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let active_only = service
            .list_spool_loans(20, false, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(active_only.len(), 1);
        assert_eq!(active_only[0].loan.id, loan.id);
        assert_eq!(active_only[0].loan.loan_status, "ACTIVE");

        service
            .return_spool_loan(ReturnSpoolLoanInput {
                loan_id: loan.id.clone(),
                returned_grams: 660,
                note: Some("Returned later".to_string()),
            })
            .map_err(|error| error.to_string())?;

        let completed = service
            .list_spool_loans(20, true, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].loan.id, loan.id);
        assert_eq!(completed[0].loan.loan_status, "RETURNED");

        let active_after_return = service
            .list_spool_loans(20, false, Some("OUTBOUND"))
            .map_err(|error| error.to_string())?;
        assert!(active_after_return.is_empty());

        Ok(())
    })();

    let _ = std::fs::remove_file(&db_path);
    if let Err(message) = result {
        panic!("companion_service_lists_outbound_loan_history failed: {message}");
    }
}
