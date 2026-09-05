use super::{
    raw_configuration_from_process, resolve_configuration, RawConfiguration, ResolvedConfiguration,
    HOST_GENERATION_1_PHASE, HOST_ROLE, LIBRARY_ID,
};
use crate::backend::catalog_refresh_jobs::CatalogRefreshJobSnapshot;
use crate::backend::filament_database::{
    FilamentDatabase, SourceCatalogEntryInput, SourceCatalogImportStats,
};
use crate::catalog_commands::CatalogRefreshResult;
use std::path::Path;
use std::time::Duration;

const INTERRUPTED_SOURCE_HOLD: Duration = Duration::from_secs(600);
const FILAMENT_NAME: &str = "Packaged catalog job QA";
const COLOR_NAME: &str = "QA blue";
const PRODUCT_URL: &str = "https://example.invalid/packaged-catalog-job";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Fixture {
    Complete,
    Interrupt,
}

/// Only the existing private packaged gate can substitute source work. Normal
/// jobs still use the same production admission, HTTP, authority and receipt
/// paths; an invalid active gate fails closed before any vendor request.
pub(crate) fn run_catalog_job(
    database_path: &str,
    job: &CatalogRefreshJobSnapshot,
    import: impl FnOnce(&str, &[SourceCatalogEntryInput<'_>]) -> Result<CatalogRefreshResult, String>,
) -> Result<Option<CatalogRefreshResult>, String> {
    run_catalog_job_for_configuration(
        raw_configuration_from_process()?,
        database_path,
        job,
        import,
    )
}

fn run_catalog_job_for_configuration(
    raw: RawConfiguration,
    database_path: &str,
    job: &CatalogRefreshJobSnapshot,
    import: impl FnOnce(&str, &[SourceCatalogEntryInput<'_>]) -> Result<CatalogRefreshResult, String>,
) -> Result<Option<CatalogRefreshResult>, String> {
    let Some(config) = resolve_configuration(raw)? else {
        return Ok(None);
    };
    match fixture_for_job(&config, database_path, job)? {
        Fixture::Complete => {
            let started_at = FilamentDatabase::open(database_path)
                .map_err(|error| error.to_string())?
                .sqlite_now()
                .map_err(|error| error.to_string())?;
            import(
                &started_at,
                &[SourceCatalogEntryInput {
                    material: "PLA",
                    filament_name: FILAMENT_NAME,
                    color_name: COLOR_NAME,
                    hex_color: Some("#1A73E8"),
                    product_url: PRODUCT_URL,
                    default_weight: 1000,
                }],
            )
            .map(Some)
        }
        Fixture::Interrupt => {
            // Do not react to the Host stop marker: that would retire this job
            // as FAILED before app exit. The next Host process must discover
            // the durable RUNNING row left by the terminated source worker.
            std::thread::sleep(INTERRUPTED_SOURCE_HOLD);
            Err("Packaged catalog interruption fixture exceeded its bounded lifetime.".to_string())
        }
    }
}

fn fixture_for_job(
    config: &ResolvedConfiguration,
    database_path: &str,
    job: &CatalogRefreshJobSnapshot,
) -> Result<Fixture, String> {
    if config.public.role != HOST_ROLE || config.public.phase != HOST_GENERATION_1_PHASE {
        return Err("Packaged catalog source work requires the first Host generation.".to_string());
    }
    let actual = std::fs::canonicalize(Path::new(database_path))
        .map_err(|_| "Packaged catalog source database could not be resolved.".to_string())?;
    if actual != config.database_path {
        return Err("Packaged catalog source must use the managed Host database.".to_string());
    }
    let db = FilamentDatabase::open(&actual).map_err(|error| error.to_string())?;
    let settings = db
        .get_library_sync_settings()
        .map_err(|error| error.to_string())?;
    if settings.mode != "HOST" || settings.library_id != LIBRARY_ID {
        return Err("Packaged catalog source requires the synthetic Host library.".to_string());
    }
    if job.status != "RUNNING" {
        return Err("Packaged catalog source requires an admitted running job.".to_string());
    }
    if job.job_id == format!("{}-catalog-complete", config.public.run_id)
        && job.vendor == "Bambu"
        && job.material == "PLA"
    {
        return Ok(Fixture::Complete);
    }
    if job.job_id == format!("{}-catalog-interrupt", config.public.run_id)
        && job.vendor == "eSUN"
        && job.material == "PETG"
    {
        return Ok(Fixture::Interrupt);
    }
    Err("Packaged catalog source request does not match this run's fixed fixture.".to_string())
}

pub(crate) fn catalog_job_summary(stats: &SourceCatalogImportStats) -> CatalogRefreshResult {
    serde_json::from_value(serde_json::json!({
        "imported": stats.imported_count(),
        "detected_store": "Packaged Host-Client E2E",
        "detected_collection": "Synthetic catalog",
        "discovered_materials": ["PLA"],
        "reactivated_count": stats.reactivated_count,
        "discontinued_count": 0,
        "reused_cached_products": 0,
        "detail_fetches": 0,
        "output": "Packaged Host-Client E2E synthetic catalog refresh completed.",
    }))
    .expect("the fixed packaged catalog summary matches the production result type")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::catalog_refresh_jobs::CatalogRefreshJobInput;
    use crate::backend::database_result::InventoryError;
    use crate::packaged_host_client_e2e::{
        tests::private_fixture, CLIENT_PAIR_PHASE, CLIENT_ROLE, HOST_GENERATION_2_PHASE,
        MARKER_FILE_NAME,
    };
    use std::path::PathBuf;

    struct TestFixture {
        directory: PathBuf,
        raw: RawConfiguration,
    }

    impl TestFixture {
        fn new(role: &str, phase: &str) -> Self {
            let (directory, _, raw) = private_fixture(role, phase);
            let path = raw.database_path.as_ref().unwrap();
            std::fs::remove_file(path).unwrap();
            let db = FilamentDatabase::open(path).unwrap();
            db.apply_schema().unwrap();
            let mut settings = db.get_library_sync_settings().unwrap();
            settings.mode = "HOST".to_string();
            settings.library_id = LIBRARY_ID.to_string();
            db.save_library_sync_settings(&settings).unwrap();
            drop(db);
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
            }
            Self { directory, raw }
        }

        fn config(&self) -> ResolvedConfiguration {
            resolve_configuration(self.raw.clone()).unwrap().unwrap()
        }

        fn job(&self, suffix: &str, vendor: &str, material: &str) -> CatalogRefreshJobSnapshot {
            CatalogRefreshJobSnapshot {
                job_id: format!("{}-catalog-{suffix}", self.raw.run_id.as_deref().unwrap()),
                vendor: vendor.to_string(),
                material: material.to_string(),
                status: "RUNNING".to_string(),
                started_at: "2026-09-05T00:00:00Z".to_string(),
                finished_at: None,
                result: None,
                error: None,
            }
        }

        fn path(&self) -> String {
            self.raw
                .database_path
                .as_ref()
                .unwrap()
                .to_string_lossy()
                .into_owned()
        }
    }

    impl Drop for TestFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.directory);
        }
    }

    #[test]
    fn absent_or_invalid_activation_never_substitutes_a_catalog_source() {
        let fixture = TestFixture::new(HOST_ROLE, HOST_GENERATION_1_PHASE);
        let job = fixture.job("complete", "Bambu", "PLA");
        assert!(run_catalog_job_for_configuration(
            RawConfiguration::default(),
            &fixture.path(),
            &job,
            |_, _| panic!("normal use must never execute synthetic import")
        )
        .unwrap()
        .is_none());
        let mut invalid = fixture.raw.clone();
        invalid.enabled = Some("true".to_string());
        assert!(
            run_catalog_job_for_configuration(invalid, &fixture.path(), &job, |_, _| panic!(
                "invalid activation must fail closed"
            ))
            .is_err()
        );
        std::fs::write(fixture.directory.join(MARKER_FILE_NAME), "wrong run marker").unwrap();
        assert!(run_catalog_job_for_configuration(
            fixture.raw.clone(),
            &fixture.path(),
            &job,
            |_, _| panic!("mismatched marker must fail closed")
        )
        .is_err());
    }

    #[test]
    fn synthetic_source_requires_exact_host_path_role_phase_library_and_request() {
        let fixture = TestFixture::new(HOST_ROLE, HOST_GENERATION_1_PHASE);
        let config = fixture.config();
        let complete = fixture.job("complete", "Bambu", "PLA");
        assert_eq!(
            fixture_for_job(&config, &fixture.path(), &complete).unwrap(),
            Fixture::Complete
        );
        assert_eq!(
            fixture_for_job(
                &config,
                &fixture.path(),
                &fixture.job("interrupt", "eSUN", "PETG")
            )
            .unwrap(),
            Fixture::Interrupt
        );
        for job in [
            fixture.job("complete", "eSUN", "PLA"),
            fixture.job("complete", "Bambu", "PETG"),
            fixture.job("foreign-run", "Bambu", "PLA"),
        ] {
            assert!(fixture_for_job(&config, &fixture.path(), &job).is_err());
        }
        let mut stale = complete.clone();
        stale.status = "SUCCEEDED".to_string();
        assert!(fixture_for_job(&config, &fixture.path(), &stale).is_err());
        assert!(fixture_for_job(
            &config,
            &fixture.directory.join("client.db").to_string_lossy(),
            &complete
        )
        .is_err());
        let db = FilamentDatabase::open(fixture.path()).unwrap();
        let mut settings = db.get_library_sync_settings().unwrap();
        settings.library_id = "real-user-library".to_string();
        db.save_library_sync_settings(&settings).unwrap();
        assert!(fixture_for_job(&config, &fixture.path(), &complete).is_err());
        drop(db);
        for (role, phase) in [
            (CLIENT_ROLE, CLIENT_PAIR_PHASE),
            (HOST_ROLE, HOST_GENERATION_2_PHASE),
        ] {
            let other = TestFixture::new(role, phase);
            assert!(fixture_for_job(
                &other.config(),
                &other.path(),
                &other.job("complete", "Bambu", "PLA")
            )
            .is_err());
        }
    }

    #[test]
    fn completed_fixture_uses_source_import_and_durable_receipt_with_exact_synthetic_row() {
        let fixture = TestFixture::new(HOST_ROLE, HOST_GENERATION_1_PHASE);
        let job = fixture.job("complete", "Bambu", "PLA");
        let db = FilamentDatabase::open(fixture.path()).unwrap();
        db.claim_catalog_refresh_job(
            "synthetic-authority",
            "synthetic-owner",
            &CatalogRefreshJobInput {
                job_id: job.job_id.clone(),
                vendor: job.vendor.clone(),
                material: job.material.clone(),
            },
        )
        .unwrap();
        let result = run_catalog_job_for_configuration(
            fixture.raw.clone(),
            &fixture.path(),
            &job,
            |started_at, entries| {
                let value = db
                    .import_source_vendor_catalog_with_job_receipt(
                        "Bambu",
                        "PLA",
                        started_at,
                        entries,
                        "synthetic-authority",
                        &job.job_id,
                        |stats| {
                            serde_json::to_value(catalog_job_summary(stats))
                                .map_err(|error| InventoryError::Db(error.to_string()))
                        },
                    )
                    .map_err(|error| error.to_string())?;
                serde_json::from_value(value).map_err(|error| error.to_string())
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(serde_json::to_value(result).unwrap()["imported"], 1);
        let row: (String, String, String, String, i64) = db.connection().query_row(
            "SELECT vendor, material, color_name, hex_color, default_weight FROM filament_master_list WHERE filament_name = ?1 AND product_url = ?2",
            [FILAMENT_NAME, PRODUCT_URL], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).unwrap();
        assert_eq!(
            row,
            (
                "Bambu".to_string(),
                "PLA".to_string(),
                COLOR_NAME.to_string(),
                "#1A73E8".to_string(),
                1000
            )
        );
        let saved = db
            .get_catalog_refresh_job("synthetic-authority", &job.job_id)
            .unwrap()
            .unwrap();
        assert_eq!(saved.status, "SUCCEEDED");
        assert_eq!(saved.result.unwrap()["imported"], 1);
    }
}
