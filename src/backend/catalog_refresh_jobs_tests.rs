use super::{CatalogRefreshJobInput, FilamentDatabase};
use crate::backend::database_catalog_inputs::SourceCatalogEntryInput;
use crate::backend::database_result::InventoryError;
use serde_json::json;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Barrier};

struct TestLibrary(PathBuf);

impl TestLibrary {
    fn new() -> Self {
        static NEXT_LIBRARY: AtomicUsize = AtomicUsize::new(0);
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "catalog-jobs-{now}-{}-{}",
            std::process::id(),
            NEXT_LIBRARY.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&directory).expect("create isolated library directory");
        let library = Self(directory);
        library.open().apply_schema().expect("initialize library");
        library
    }

    fn open(&self) -> FilamentDatabase {
        FilamentDatabase::open(self.0.join("library.db")).expect("open isolated library")
    }
}

impl Drop for TestLibrary {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn input(id: &str) -> CatalogRefreshJobInput {
    CatalogRefreshJobInput {
        job_id: id.to_string(),
        vendor: "eSUN".to_string(),
        material: "PLA".to_string(),
    }
}

fn entry() -> SourceCatalogEntryInput<'static> {
    SourceCatalogEntryInput {
        material: "PLA",
        filament_name: "Job receipt synthetic test filament",
        color_name: "Test blue",
        hex_color: Some("#0000FF"),
        product_url: "https://example.invalid/synthetic-test-filament",
        default_weight: 1000,
    }
}

#[test]
fn simultaneous_repeated_ids_claim_exactly_one_worker() {
    let library = Arc::new(TestLibrary::new());
    let barrier = Arc::new(Barrier::new(8));
    let workers: Vec<_> = (0..8)
        .map(|_| {
            let library = Arc::clone(&library);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let db = library.open();
                barrier.wait();
                db.claim_catalog_refresh_job("library-a", "process-a", &input("same-id"))
                    .expect("claim or replay job")
            })
        })
        .collect();
    let claims: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(claims.iter().filter(|claim| claim.started).count(), 1);
    assert!(claims.iter().all(|claim| claim.job == claims[0].job));
}

#[test]
fn competing_job_ids_cannot_queue_a_second_refresh() {
    let library = Arc::new(TestLibrary::new());
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = ["job-a", "job-b"]
        .into_iter()
        .map(|id| {
            let library = Arc::clone(&library);
            let barrier = Arc::clone(&barrier);
            std::thread::spawn(move || {
                let db = library.open();
                barrier.wait();
                db.claim_catalog_refresh_job("library-a", "process-a", &input(id))
            })
        })
        .collect();
    let claims: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(claims.iter().filter(|claim| claim.is_ok()).count(), 1);
    assert_eq!(
        claims
            .iter()
            .filter(|claim| matches!(
                claim,
                Err(InventoryError::InvalidOperation {
                    code: "common.unavailable",
                    ..
                })
            ))
            .count(),
        1
    );
    assert_eq!(
        library
            .open()
            .connection()
            .query_row("SELECT COUNT(*) FROM catalog_refresh_jobs", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
        1
    );
}

#[test]
fn reserved_active_route_id_is_rejected_before_a_job_is_admitted() {
    let library = TestLibrary::new();
    let db = library.open();
    for id in ["active", " active "] {
        let error = db
            .claim_catalog_refresh_job("library-a", "process-a", &input(id))
            .expect_err("the active-status route must never be admitted as a job ID");
        assert!(matches!(
            error,
            InventoryError::InvalidOperation {
                code: "common.invalid_request",
                ..
            }
        ));
    }
    assert!(db
        .get_active_catalog_refresh_job("library-a")
        .unwrap()
        .is_none());
    let admitted = db
        .claim_catalog_refresh_job("library-a", "process-a", &input("active-job"))
        .expect("the reserved route must not reject ordinary IDs sharing its prefix");
    assert!(admitted.started);
    assert_eq!(admitted.job.job_id, "active-job");
}

#[test]
fn job_identity_rejects_payload_and_authority_mismatches() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    let mut changed = input("job-a");
    changed.material = "PETG".to_string();
    assert!(db
        .claim_catalog_refresh_job("library-a", "process-a", &changed)
        .is_err());
    assert!(db
        .claim_catalog_refresh_job("library-b", "process-a", &input("job-a"))
        .is_err());
    assert!(db
        .get_catalog_refresh_job("library-b", "job-a")
        .unwrap()
        .is_none());
    assert!(db
        .get_active_catalog_refresh_job("library-b")
        .unwrap()
        .is_none());
    assert!(db
        .complete_catalog_refresh_job(
            "library-b",
            "job-a",
            "FAILED",
            None,
            Some("wrong authority")
        )
        .is_err());
    changed = input("job-a");
    changed.vendor = " esun ".to_string();
    changed.material = " pla ".to_string();
    assert!(
        !db.claim_catalog_refresh_job("library-a", "process-a", &changed)
            .unwrap()
            .started
    );
}

#[test]
fn completed_receipt_survives_database_reopen_and_cannot_be_overwritten() {
    let library = TestLibrary::new();
    {
        let db = library.open();
        db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
            .unwrap();
        db.complete_catalog_refresh_job(
            "library-a",
            "job-a",
            "SUCCEEDED",
            Some(&json!({"imported": 7})),
            None,
        )
        .unwrap();
    }
    let db = library.open();
    assert_eq!(db.recover_catalog_refresh_jobs("process-b").unwrap(), 0);
    let replay = db
        .claim_catalog_refresh_job("library-a", "process-b", &input("job-a"))
        .unwrap();
    assert!(!replay.started);
    assert_eq!(replay.job.status, "SUCCEEDED");
    assert!(replay.job.started_at.ends_with('Z'));
    assert!(replay.job.started_at.contains('T'));
    assert!(replay.job.finished_at.as_deref().unwrap().ends_with('Z'));
    assert_eq!(replay.job.result, Some(json!({"imported": 7})));
    assert!(replay.job.finished_at.is_some());
    assert!(db
        .complete_catalog_refresh_job("library-a", "job-a", "FAILED", None, Some("late failure"))
        .is_err());
}

#[test]
fn process_recovery_interrupts_orphans_without_repeating_them() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    assert_eq!(db.recover_catalog_refresh_jobs("process-a").unwrap(), 0);
    assert_eq!(
        db.get_active_catalog_refresh_job("library-a")
            .unwrap()
            .unwrap()
            .job_id,
        "job-a"
    );
    assert_eq!(db.recover_catalog_refresh_jobs("process-b").unwrap(), 1);
    assert_eq!(db.recover_catalog_refresh_jobs("process-b").unwrap(), 0);
    let replay = db
        .claim_catalog_refresh_job("library-a", "process-b", &input("job-a"))
        .unwrap();
    assert!(!replay.started);
    assert_eq!(replay.job.status, "INTERRUPTED");
    assert!(replay.job.result.is_none());
    assert!(
        db.claim_catalog_refresh_job("library-a", "process-b", &input("job-b"))
            .unwrap()
            .started
    );
}

#[test]
fn inactive_worker_recovery_preserves_live_jobs_and_retires_only_the_current_owner() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    assert_eq!(
        db.recover_inactive_catalog_refresh_jobs("process-a", &["job-a".to_string()])
            .unwrap(),
        0
    );
    assert_eq!(
        db.recover_inactive_catalog_refresh_jobs("process-b", &[])
            .unwrap(),
        0
    );
    assert_eq!(
        db.recover_inactive_catalog_refresh_jobs("process-a", &[])
            .unwrap(),
        1
    );
    let job = db
        .get_catalog_refresh_job("library-a", "job-a")
        .unwrap()
        .unwrap();
    assert_eq!(job.status, "INTERRUPTED");
    assert!(
        !db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
            .unwrap()
            .started
    );
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-b"))
        .unwrap();
    db.complete_catalog_refresh_job(
        "library-a",
        "job-b",
        "SUCCEEDED",
        Some(&json!({"imported": 0})),
        None,
    )
    .unwrap();
    assert_eq!(
        db.recover_inactive_catalog_refresh_jobs("process-a", &[])
            .unwrap(),
        0
    );
    assert_eq!(
        db.get_catalog_refresh_job("library-a", "job-b")
            .unwrap()
            .unwrap()
            .status,
        "SUCCEEDED"
    );
}

#[test]
fn import_and_receipt_commit_together_and_replay_never_imports_again() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    let result = db
        .import_source_vendor_catalog_with_job_receipt(
            "eSUN",
            "PLA",
            "2026-09-05 00:00:00",
            &[entry()],
            "library-a",
            "job-a",
            |stats| Ok(json!({"imported": stats.imported_count()})),
        )
        .unwrap();
    assert_eq!(result, json!({"imported": 1}));
    assert_eq!(
        db.get_catalog_refresh_job("library-a", "job-a")
            .unwrap()
            .unwrap()
            .result,
        Some(result)
    );
    assert!(db
        .import_source_vendor_catalog_with_job_receipt(
            "eSUN",
            "PLA",
            "2026-09-05 00:00:00",
            &[entry()],
            "library-a",
            "job-a",
            |_| panic!("completed job must never repeat import"),
        )
        .is_err());
}

#[test]
fn late_receipt_failure_rolls_back_catalog_and_keeps_job_running() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    db.connection().execute_batch(
        "CREATE TRIGGER reject_job_receipt BEFORE UPDATE OF status ON catalog_refresh_jobs
         WHEN NEW.status = 'SUCCEEDED' BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END;",
    ).unwrap();
    let error = db
        .import_source_vendor_catalog_with_job_receipt(
            "eSUN",
            "PLA",
            "2026-09-05 00:00:00",
            &[entry()],
            "library-a",
            "job-a",
            |stats| Ok(json!({"imported": stats.imported_count()})),
        )
        .expect_err("receipt failure must roll back source import");
    assert!(error.to_string().contains("synthetic receipt failure"));
    let count: i64 = db
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM filament_master_list WHERE filament_name = ?1",
            [entry().filament_name],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
    assert_eq!(
        db.get_catalog_refresh_job("library-a", "job-a")
            .unwrap()
            .unwrap()
            .status,
        "RUNNING"
    );
}

#[test]
fn catalog_reset_interrupts_active_import_and_preserves_the_idempotency_receipt() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    db.reset_catalog_data().unwrap();
    let replay = db
        .claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    assert!(!replay.started);
    assert_eq!(replay.job.status, "INTERRUPTED");
    assert!(db
        .import_source_vendor_catalog_with_job_receipt(
            "eSUN",
            "PLA",
            "2026-09-05 00:00:00",
            &[entry()],
            "library-a",
            "job-a",
            |_| panic!("pre-reset worker must not import into the reset catalog"),
        )
        .is_err());
    let count: i64 = db
        .connection()
        .query_row(
            "SELECT COUNT(*) FROM filament_master_list WHERE filament_name = ?1",
            [entry().filament_name],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 0);
}

#[test]
fn job_receipts_are_excluded_from_portable_backup_and_cleared_on_restore_and_reset() {
    let library = TestLibrary::new();
    let db = library.open();
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-a"))
        .unwrap();
    db.complete_catalog_refresh_job(
        "library-a",
        "job-a",
        "SUCCEEDED",
        Some(&json!({"imported":0})),
        None,
    )
    .unwrap();
    let backup = db.export_full_backup_json().unwrap();
    let content: serde_json::Value = serde_json::from_str(&backup).unwrap();
    assert!(content["tables"].get("catalog_refresh_jobs").is_none());
    db.import_full_backup_json(&backup).unwrap();
    assert!(db
        .get_catalog_refresh_job("library-a", "job-a")
        .unwrap()
        .is_none());
    db.claim_catalog_refresh_job("library-a", "process-a", &input("job-b"))
        .unwrap();
    db.reset_app_state_data().unwrap();
    assert!(db
        .get_active_catalog_refresh_job("library-a")
        .unwrap()
        .is_none());
}
