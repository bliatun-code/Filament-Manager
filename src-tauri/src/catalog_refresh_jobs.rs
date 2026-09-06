use crate::app_error::{coded_command_error, inventory_error_to_command_string};
use crate::app_services::CompanionService;
use crate::backend::catalog_refresh_jobs::{CatalogRefreshJobInput, CatalogRefreshJobSnapshot};
use crate::backend::database_result::InventoryError;
use crate::backend::filament_database::{
    FilamentDatabase, SourceCatalogEntryInput, SourceCatalogImportStats,
};
use crate::catalog_commands::{
    refresh_bambu_catalog_blocking, refresh_esun_catalog_blocking, require_single_material_filter,
    CatalogRefreshResult,
};
use crate::companion_session::random_hex_token;
use crate::secure_credential_mutation::lock_secure_credential_mutation;
use crate::state::AppState;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

fn live_jobs() -> &'static Mutex<HashSet<(PathBuf, String, String)>> {
    static LIVE: OnceLock<Mutex<HashSet<(PathBuf, String, String)>>> = OnceLock::new();
    LIVE.get_or_init(|| Mutex::new(HashSet::new()))
}

struct LiveCatalogJob((PathBuf, String, String));

impl Drop for LiveCatalogJob {
    fn drop(&mut self) {
        if let Ok(mut jobs) = live_jobs().lock() {
            jobs.remove(&self.0);
        }
    }
}

fn recover_jobs(db: &FilamentDatabase, path: &str) -> Result<PathBuf, String> {
    let path = std::fs::canonicalize(path).map_err(|_| coded_command_error("common.internal"))?;
    let live: Vec<String> = live_jobs()
        .lock()
        .map_err(|_| coded_command_error("common.internal"))?
        .iter()
        .filter(|(database, _, _)| *database == path)
        .map(|(_, id, _)| id.clone())
        .collect();
    db.recover_catalog_refresh_jobs(process_owner())
        .map_err(inventory_error_to_command_string)?;
    db.recover_inactive_catalog_refresh_jobs(process_owner(), &live)
        .map_err(inventory_error_to_command_string)?;
    Ok(path)
}

fn process_owner() -> &'static str {
    static OWNER: OnceLock<String> = OnceLock::new();
    OWNER.get_or_init(|| random_hex_token(32))
}

fn authority_key(db: &FilamentDatabase) -> Result<String, String> {
    let settings = db
        .get_library_sync_settings()
        .map_err(inventory_error_to_command_string)?;
    let profile = db
        .get_or_create_credential_store_profile_id()
        .map_err(inventory_error_to_command_string)?;
    Ok(serde_json::json!([settings.library_id, settings.target_generation, profile]).to_string())
}

pub(crate) struct CatalogJobExecution {
    service: CompanionService,
    authority: String,
    job_id: String,
}

impl CatalogJobExecution {
    pub(crate) fn import(
        &self,
        vendor: &str,
        material: &str,
        started_at: &str,
        entries: &[SourceCatalogEntryInput<'_>],
        summary: impl FnOnce(&SourceCatalogImportStats) -> CatalogRefreshResult,
    ) -> Result<CatalogRefreshResult, String> {
        self.service.with_authoritative_write(|| {
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let db = FilamentDatabase::open(self.service.database_path())
                    .map_err(inventory_error_to_command_string)?;
                if authority_key(&db)? != self.authority {
                    return Err(coded_command_error("common.forbidden"));
                }
                let value = db
                    .import_source_vendor_catalog_with_job_receipt(
                        vendor,
                        material,
                        started_at,
                        entries,
                        &self.authority,
                        &self.job_id,
                        |stats| {
                            serde_json::to_value(summary(stats))
                                .map_err(|error| InventoryError::Db(error.to_string()))
                        },
                    )
                    .map_err(inventory_error_to_command_string)?;
                serde_json::from_value(value).map_err(|_| coded_command_error("common.internal"))
            }))
            .unwrap_or_else(|_| Err(coded_command_error("common.internal")))
        })
    }

    fn finish_failure(&self, result: Option<&CatalogRefreshResult>) {
        // A stale worker must still retire its own operational receipt. This
        // updates only its exact job/authority, never the current catalog.
        let Ok(_gate) = lock_secure_credential_mutation() else {
            return;
        };
        let Ok(db) = FilamentDatabase::open(self.service.database_path()) else {
            return;
        };
        let Ok(Some(job)) = db.get_catalog_refresh_job(&self.authority, &self.job_id) else {
            return;
        };
        if job.status == "RUNNING" {
            let _ = db.complete_catalog_refresh_job(
                &self.authority,
                &self.job_id,
                "FAILED",
                None,
                Some(result.map(|summary| summary.output.as_str()).unwrap_or(
                    "The catalog refresh did not complete. Local catalog data was preserved.",
                )),
            );
        }
    }
}

pub(crate) fn start_job(
    service: CompanionService,
    input: CatalogRefreshJobInput,
) -> Result<CatalogRefreshJobSnapshot, String> {
    start_job_with(service, input, |execution, job| {
        if let Some(result) = crate::packaged_host_client_e2e::run_catalog_job(
            execution.service.database_path(),
            job,
            |started_at, entries| {
                execution.import(
                    &job.vendor,
                    &job.material,
                    started_at,
                    entries,
                    crate::packaged_host_client_e2e::catalog_job_summary,
                )
            },
        )? {
            return Ok(result);
        }
        let material = Some(vec![job.material.clone()]);
        if job.vendor == "Bambu" {
            refresh_bambu_catalog_blocking(
                execution.service.database_path(),
                material,
                None,
                execution,
            )
        } else {
            refresh_esun_catalog_blocking(
                execution.service.database_path(),
                material,
                None,
                execution,
            )
        }
    })
}

fn start_job_with(
    service: CompanionService,
    input: CatalogRefreshJobInput,
    work: impl FnOnce(
            &CatalogJobExecution,
            &CatalogRefreshJobSnapshot,
        ) -> Result<CatalogRefreshResult, String>
        + Send
        + 'static,
) -> Result<CatalogRefreshJobSnapshot, String> {
    let (authority, claim, live) = service.with_authoritative_write(|| {
        let db = FilamentDatabase::open(service.database_path())
            .map_err(inventory_error_to_command_string)?;
        let authority = authority_key(&db)?;
        let path = recover_jobs(&db, service.database_path())?;
        let claim = db
            .claim_catalog_refresh_job(&authority, process_owner(), &input)
            .map_err(inventory_error_to_command_string)?;
        let live = if claim.started {
            let key = (path, claim.job.job_id.clone(), random_hex_token(16));
            live_jobs()
                .lock()
                .map_err(|_| coded_command_error("common.internal"))?
                .insert(key.clone());
            Some(LiveCatalogJob(key))
        } else {
            None
        };
        Ok((authority, claim, live))
    })?;
    if claim.started {
        let execution = CatalogJobExecution {
            service,
            authority,
            job_id: claim.job.job_id.clone(),
        };
        let job = claim.job.clone();
        // The worker belongs to the Host process, not a request, window, or
        // Companion server generation. Receipt recovery handles process exit.
        tauri::async_runtime::spawn_blocking(move || {
            let _live = live;
            let result =
                std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| work(&execution, &job)));
            match result {
                Ok(Ok(summary)) => execution.finish_failure(Some(&summary)),
                _ => execution.finish_failure(None),
            }
        });
    }
    Ok(claim.job)
}

pub(crate) fn get_job(
    service: &CompanionService,
    job_id: Option<&str>,
) -> Result<Option<CatalogRefreshJobSnapshot>, String> {
    service.with_authoritative_write(|| {
        let db = FilamentDatabase::open(service.database_path())
            .map_err(inventory_error_to_command_string)?;
        let authority = authority_key(&db)?;
        recover_jobs(&db, service.database_path())?;
        match job_id {
            Some(id) => db.get_catalog_refresh_job(&authority, id),
            None => db.get_active_catalog_refresh_job(&authority),
        }
        .map_err(inventory_error_to_command_string)
    })
}

pub(crate) fn run_legacy_catalog_refresh(
    service: CompanionService,
    vendor: &str,
    materials: Option<Vec<String>>,
) -> Result<CatalogRefreshResult, String> {
    let material = require_single_material_filter(materials)?.remove(0);
    let job = start_job(
        service.clone(),
        CatalogRefreshJobInput {
            job_id: random_hex_token(16),
            vendor: vendor.to_string(),
            material,
        },
    )?;
    loop {
        let status = get_job(&service, Some(&job.job_id))?
            .ok_or_else(|| coded_command_error("common.not_found"))?;
        if status.status != "RUNNING" {
            return match status.result {
                Some(result) => serde_json::from_value(result)
                    .map_err(|_| coded_command_error("common.internal")),
                None => Err(coded_command_error("common.unavailable")),
            };
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[tauri::command]
pub(crate) async fn start_catalog_refresh_job(
    state: tauri::State<'_, AppState>,
    input: CatalogRefreshJobInput,
) -> Result<CatalogRefreshJobSnapshot, String> {
    let path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        start_job(CompanionService::new_bound_to_current_library(path), input)
    })
    .await
    .map_err(|_| coded_command_error("common.internal"))?
}

#[tauri::command]
pub(crate) async fn get_catalog_refresh_job(
    state: tauri::State<'_, AppState>,
    job_id: Option<String>,
) -> Result<Option<CatalogRefreshJobSnapshot>, String> {
    let path = state.db_path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        get_job(
            &CompanionService::new_bound_to_current_library(path),
            job_id.as_deref(),
        )
    })
    .await
    .map_err(|_| coded_command_error("common.internal"))?
}

#[cfg(test)]
#[path = "catalog_refresh_jobs_tests.rs"]
mod tests;
