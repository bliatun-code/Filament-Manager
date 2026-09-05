use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::database_catalog_inputs::SourceCatalogEntryInput;
use super::database_catalog_source::{
    import_source_vendor_catalog_in_transaction, SourceCatalogImportStats,
};
use super::database_core::FilamentDatabase;
use super::database_result::{InventoryError, InventoryResult};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CatalogRefreshJobInput {
    pub job_id: String,
    pub vendor: String,
    pub material: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct CatalogRefreshJobSnapshot {
    pub job_id: String,
    pub vendor: String,
    pub material: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub result: Option<Value>,
    pub error: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CatalogRefreshJobClaim {
    pub job: CatalogRefreshJobSnapshot,
    pub started: bool,
}

const JOB_COLUMNS: &str =
    "job_id, vendor, material, status, started_at, finished_at, result_json, error";

impl FilamentDatabase {
    pub fn claim_catalog_refresh_job(
        &self,
        authority_key: &str,
        owner_id: &str,
        input: &CatalogRefreshJobInput,
    ) -> InventoryResult<CatalogRefreshJobClaim> {
        let input = normalize_input(input)?;
        require_identity(authority_key)?;
        require_identity(owner_id)?;
        self.with_inventory_transaction(|conn| {
            let existing = conn
                .query_row(
                    &format!("SELECT authority_key, {JOB_COLUMNS} FROM catalog_refresh_jobs WHERE job_id = ?1"),
                    [&input.job_id],
                    |row| Ok((row.get::<_, String>(0)?, read_job(row, 1)?)),
                )
                .optional()?;
            if let Some((existing_authority, job)) = existing {
                if existing_authority != authority_key
                    || job.vendor != input.vendor
                    || job.material != input.material
                {
                    return Err(conflict("The catalog job ID already belongs to a different request."));
                }
                return Ok(CatalogRefreshJobClaim { job, started: false });
            }
            let busy: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM catalog_refresh_jobs WHERE status = 'RUNNING')",
                [],
                |row| row.get(0),
            )?;
            if busy {
                return Err(conflict("A catalog refresh is already running in this library."));
            }
            conn.execute(
                "INSERT INTO catalog_refresh_jobs (job_id, authority_key, owner_id, vendor, material, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'RUNNING')",
                params![input.job_id, authority_key, owner_id, input.vendor, input.material],
            )?;
            let job = get_job(conn, authority_key, &input.job_id)?.ok_or(InventoryError::NotFound)?;
            Ok(CatalogRefreshJobClaim { job, started: true })
        })
    }

    pub fn get_catalog_refresh_job(
        &self,
        authority_key: &str,
        job_id: &str,
    ) -> InventoryResult<Option<CatalogRefreshJobSnapshot>> {
        get_job(self.connection(), authority_key, job_id)
    }

    pub fn get_active_catalog_refresh_job(
        &self,
        authority_key: &str,
    ) -> InventoryResult<Option<CatalogRefreshJobSnapshot>> {
        Ok(self.connection().query_row(
            &format!("SELECT {JOB_COLUMNS} FROM catalog_refresh_jobs WHERE authority_key = ?1 AND status = 'RUNNING'"),
            [authority_key],
            |row| read_job(row, 0),
        ).optional()?)
    }

    /// The caller supplies a stable process owner, never a server/session ID.
    /// A previous process cannot still be importing into this singleton library.
    pub fn recover_catalog_refresh_jobs(&self, current_owner_id: &str) -> InventoryResult<usize> {
        require_identity(current_owner_id)?;
        Ok(self.connection().execute(
            "UPDATE catalog_refresh_jobs SET status = 'INTERRUPTED', finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
             error = 'Catalog refresh was interrupted before completion. No catalog changes were committed.'
             WHERE status = 'RUNNING' AND owner_id != ?1",
            [current_owner_id],
        )?)
    }

    /// Called under the shell's authority gate with its live-worker registry.
    /// This retires jobs whose worker exited while failure persistence was
    /// unavailable, without interrupting a worker still fetching or importing.
    pub fn recover_inactive_catalog_refresh_jobs(
        &self,
        current_owner_id: &str,
        live_job_ids: &[String],
    ) -> InventoryResult<usize> {
        require_identity(current_owner_id)?;
        let live_ids = serde_json::to_string(live_job_ids)
            .map_err(|error| InventoryError::Db(error.to_string()))?;
        self.with_inventory_transaction(|conn| {
            Ok(conn.execute(
                "UPDATE catalog_refresh_jobs SET status = 'INTERRUPTED', finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                 error = 'Catalog refresh was interrupted before completion. No catalog changes were committed.'
                 WHERE status = 'RUNNING' AND owner_id = ?1
                   AND job_id NOT IN (SELECT value FROM json_each(?2))",
                params![current_owner_id, live_ids],
            )?)
        })
    }

    pub fn complete_catalog_refresh_job(
        &self,
        authority_key: &str,
        job_id: &str,
        status: &str,
        result: Option<&Value>,
        error: Option<&str>,
    ) -> InventoryResult<()> {
        complete_job(
            self.connection(),
            authority_key,
            job_id,
            status,
            result,
            error,
        )
    }

    /// The source import and durable success receipt commit together. In
    /// particular a late receipt error must roll back every imported row.
    #[allow(clippy::too_many_arguments)]
    pub fn import_source_vendor_catalog_with_job_receipt(
        &self,
        vendor: &str,
        material: &str,
        refresh_started_at: &str,
        entries: &[SourceCatalogEntryInput<'_>],
        authority_key: &str,
        job_id: &str,
        build_result: impl FnOnce(&SourceCatalogImportStats) -> InventoryResult<Value>,
    ) -> InventoryResult<Value> {
        self.with_inventory_transaction(|conn| {
            let job = get_job(conn, authority_key, job_id)?.ok_or(InventoryError::NotFound)?;
            if job.status != "RUNNING"
                || !job.vendor.eq_ignore_ascii_case(vendor.trim())
                || job.material != material.trim().to_uppercase()
            {
                return Err(conflict("The catalog job no longer permits this import."));
            }
            let stats = import_source_vendor_catalog_in_transaction(
                conn,
                vendor,
                material,
                refresh_started_at,
                entries,
            )?;
            let result = build_result(&stats)?;
            complete_job(
                conn,
                authority_key,
                job_id,
                "SUCCEEDED",
                Some(&result),
                None,
            )?;
            Ok(result)
        })
    }
}

fn get_job(
    conn: &Connection,
    authority_key: &str,
    job_id: &str,
) -> InventoryResult<Option<CatalogRefreshJobSnapshot>> {
    Ok(conn.query_row(
        &format!("SELECT {JOB_COLUMNS} FROM catalog_refresh_jobs WHERE authority_key = ?1 AND job_id = ?2"),
        params![authority_key, job_id],
        |row| read_job(row, 0),
    ).optional()?)
}

fn read_job(row: &Row<'_>, offset: usize) -> rusqlite::Result<CatalogRefreshJobSnapshot> {
    let result_json: Option<String> = row.get(offset + 6)?;
    let result = result_json
        .map(|value| {
            serde_json::from_str(&value).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    offset + 6,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    Ok(CatalogRefreshJobSnapshot {
        job_id: row.get(offset)?,
        vendor: row.get(offset + 1)?,
        material: row.get(offset + 2)?,
        status: row.get(offset + 3)?,
        started_at: row.get(offset + 4)?,
        finished_at: row.get(offset + 5)?,
        result,
        error: row.get(offset + 7)?,
    })
}

fn complete_job(
    conn: &Connection,
    authority_key: &str,
    job_id: &str,
    status: &str,
    result: Option<&Value>,
    error: Option<&str>,
) -> InventoryResult<()> {
    let valid = match status {
        "SUCCEEDED" => result.is_some() && error.is_none(),
        "FAILED" | "INTERRUPTED" => {
            result.is_none() && error.is_some_and(|value| !value.trim().is_empty())
        }
        _ => false,
    };
    if !valid {
        return Err(invalid_request("Invalid catalog job completion."));
    }
    let changed = conn.execute(
        "UPDATE catalog_refresh_jobs SET status = ?1, finished_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), result_json = ?2, error = ?3
         WHERE authority_key = ?4 AND job_id = ?5 AND status = 'RUNNING'",
        params![status, result.map(Value::to_string), error, authority_key, job_id],
    )?;
    if changed != 1 {
        return Err(conflict("The catalog job no longer accepts a completion."));
    }
    Ok(())
}

fn normalize_input(input: &CatalogRefreshJobInput) -> InventoryResult<CatalogRefreshJobInput> {
    let job_id = input.job_id.trim();
    if job_id.is_empty()
        || job_id == "active"
        || job_id.len() > 128
        || !job_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    {
        return Err(invalid_request("A valid catalog job ID is required."));
    }
    let vendor = match input.vendor.trim().to_ascii_lowercase().as_str() {
        "bambu" => "Bambu",
        "esun" => "eSUN",
        _ => return Err(invalid_request("Vendor must be Bambu or eSUN.")),
    };
    let material = input.material.trim().to_uppercase();
    if material.is_empty() || material.len() > 128 || material.chars().any(char::is_control) {
        return Err(invalid_request("A valid catalog material is required."));
    }
    Ok(CatalogRefreshJobInput {
        job_id: job_id.to_string(),
        vendor: vendor.to_string(),
        material,
    })
}

fn require_identity(value: &str) -> InventoryResult<()> {
    if value.trim().is_empty() {
        return Err(invalid_request(
            "A catalog job authority and process owner are required.",
        ));
    }
    Ok(())
}

fn conflict(message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "common.unavailable",
        message: message.to_string(),
    }
}

#[cfg(test)]
#[path = "catalog_refresh_jobs_tests.rs"]
mod tests;

fn invalid_request(message: &str) -> InventoryError {
    InventoryError::InvalidOperation {
        code: "common.invalid_request",
        message: message.to_string(),
    }
}
