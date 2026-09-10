import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import Database from "better-sqlite3";

// Match the portable backup boundary in src/backend/database_tables.rs. Other
// tables and columns are included by default so new business state stays covered.
const LOCAL_TABLES = new Set([
  "catalog_refresh_jobs",
  "library_domain_revisions",
  "trusted_lan_pairings",
  "trusted_lan_paired_browsers",
  "sync_queue",
]);
const PORTABLE_SETTINGS = new Set([
  "active_printer_id",
  "default_purchase_currency",
  "filament_price_standards_json",
  "library_sync_library_id",
  "low_stock_policy_json",
  "theme_mode",
  "trusted_lan_port",
]);
const CREDENTIAL_MIGRATION_SETTING = "secure_credential_storage_migration_v1";

function requireEvidence(condition, message) {
  if (!condition) throw new Error(`Packaged desktop backup restore ${message}.`);
}

function normalizedRow(row) {
  return JSON.stringify(Object.fromEntries(Object.entries(row)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, Buffer.isBuffer(value) ? { blob: value.toString("base64") } : value])));
}

function portableRow(table, row) {
  if (table === "settings" && !PORTABLE_SETTINGS.has(row.key.trim())) return null;
  if (table === "printers") {
    delete row.ip_address;
    delete row.access_token;
  }
  return row;
}

export function inspectDesktopRestoreState(databasePath) {
  const database = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const names = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all().map(row => row.name);
    for (const required of ["settings", "filament_master_list", "filament_spools", "spool_history_events", "catalog_spool_batches", "catalog_refresh_jobs"]) {
      requireEvidence(names.includes(required), `state is missing ${required}`);
    }
    const allTables = names.map(name => [name, database.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]);
    const tables = allTables.filter(([name]) => !LOCAL_TABLES.has(name) && name !== "catalog_spool_batches")
      .map(([name, rows]) => [name, rows.map(row => portableRow(name, { ...row }))
        .filter(row => row !== null).map(normalizedRow).sort()]);
    // Import removes this one local setting; credential_migration.rs recreates
    // it on the next startup. Its exact transition is checked separately below.
    // Preserve all other tables, settings, revisions, journal and catalog fields.
    const restartTables = allTables.map(([name, rows]) => [name, rows
      .filter(row => name !== "settings" || row.key !== CREDENTIAL_MIGRATION_SETTING)
      .map(normalizedRow).sort()]);
    const journalRows = database.prepare("SELECT * FROM catalog_spool_batches").all().map(normalizedRow).sort();
    requireEvidence(journalRows.length === 1, "must retain exactly one installation batch journal row");
    const libraryId = database.prepare("SELECT value FROM settings WHERE key = 'library_sync_library_id'").get()?.value;
    requireEvidence(typeof libraryId === "string" && libraryId.length > 0, "library identity is missing");
    return {
      portableStateSha256: createHash("sha256").update(JSON.stringify(tables)).digest("hex"),
      restartStateSha256: createHash("sha256").update(JSON.stringify(restartTables)).digest("hex"),
      credentialMigrationMarker: database.prepare("SELECT * FROM settings WHERE key = ?").get(CREDENTIAL_MIGRATION_SETTING) ?? null,
      journalRows,
      libraryId,
      catalogJobsCount: database.prepare("SELECT COUNT(*) AS count FROM catalog_refresh_jobs").get().count,
    };
  } finally {
    database.close();
  }
}

export function assertDesktopRestoredRestart(before, after) {
  requireEvidence(before.credentialMigrationMarker === null,
    "must remove the local credential migration marker during import");
  requireEvidence(isDeepStrictEqual(after.credentialMigrationMarker, {
    key: CREDENTIAL_MIGRATION_SETTING,
    value: "complete",
  }), "restart did not recreate the exact completed credential migration marker");
  requireEvidence(before.restartStateSha256 === after.restartStateSha256,
    "restored state changed across the verified restart outside the credential migration marker");
}

export function seedDesktopRestoreCatalogJob(databasePath, runId) {
  requireEvidence(typeof runId === "string" && /^packaged-e2e-[0-9a-f-]{36}$/.test(runId), "sentinel run identity is invalid");
  const database = new Database(databasePath, { fileMustExist: true });
  const sentinel = {
    job_id: `${runId}-restore-job`,
    authority_key: `${runId}-restore-authority`,
    owner_id: `${runId}-restore-owner`,
    vendor: "Bambu",
    material: "PLA",
    status: "FAILED",
    started_at: "2026-09-10T00:00:00Z",
    finished_at: "2026-09-10T00:00:01Z",
    result_json: null,
    error: "Isolated packaged desktop backup restore sentinel",
  };
  try {
    database.transaction(() => {
      requireEvidence(database.prepare("SELECT COUNT(*) AS count FROM catalog_refresh_jobs").get().count === 0,
        "requires an empty catalog job table before seeding its sentinel");
      database.prepare(`INSERT INTO catalog_refresh_jobs
        (job_id, authority_key, owner_id, vendor, material, status, started_at, finished_at, result_json, error)
        VALUES (@job_id, @authority_key, @owner_id, @vendor, @material, @status, @started_at, @finished_at, @result_json, @error)`)
        .run(sentinel);
    })();
  } finally {
    database.close();
  }
  // Reopen independently after the write commits; an empty or stale fixture
  // must not make a no-op import appear to have cleared local operation state.
  const verification = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    const rows = verification.prepare("SELECT * FROM catalog_refresh_jobs").all();
    requireEvidence(rows.length === 1 && isDeepStrictEqual(rows[0], sentinel), "catalog job sentinel was not persisted exactly");
    return rows.length;
  } finally {
    verification.close();
  }
}

export function assertDesktopRestorePreserved(before, after) {
  requireEvidence(after.catalogJobsCount === 0, "did not clear the synthetic catalog job");
  requireEvidence(before.libraryId === after.libraryId && isDeepStrictEqual(before.journalRows, after.journalRows),
    "changed the installation batch journal or its library identity");
  requireEvidence(before.portableStateSha256 === after.portableStateSha256,
    "changed portable business rows, history or settings");
}

export function validateDesktopRestoreEvidence(evidence, phase) {
  if (phase === "mutate" || phase === "verify") {
    requireEvidence(evidence === null, `${phase} phase must not claim restore evidence`);
    return;
  }
  requireEvidence(["restore", "verify-restored"].includes(phase), "phase is invalid");
  requireEvidence(evidence && typeof evidence === "object" && !Array.isArray(evidence)
    && isDeepStrictEqual(Object.keys(evidence).sort(), ["backup_tables_sha256", "perturbed_weight_g"])
    && typeof evidence.backup_tables_sha256 === "string" && /^[0-9a-f]{64}$/.test(evidence.backup_tables_sha256)
    && evidence.perturbed_weight_g === 123, "completion evidence is invalid");
}
