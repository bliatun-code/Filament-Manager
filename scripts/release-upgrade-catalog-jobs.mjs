export const RELEASE_UPGRADE_CATALOG_JOB_AUTHORITY =
  '["release-qa-catalog-library",0,"release-qa-credential-profile"]';
export const RELEASE_UPGRADE_CATALOG_JOB_OWNER = "release-qa-catalog-owner";
export const RELEASE_UPGRADE_CATALOG_JOB_ERROR = "catalogJob.interrupted";
export const RELEASE_UPGRADE_CATALOG_JOB_OUTPUT = "Release QA catalog result";

const COLUMNS = [
  "job_id", "authority_key", "owner_id", "vendor", "material", "status",
  "started_at", "finished_at", "result_json", "error",
];
const RESULT_KEYS = [
  "imported", "detected_store", "detected_collection", "discovered_materials",
  "reactivated_count", "discontinued_count", "reused_cached_products",
  "detail_fetches", "output",
];

function invalid(message) {
  // Diagnostics may contain URLs, local paths or other private source values.
  return new Error(`Upgrade fixture catalog jobs ${message}.`);
}

function readJobs(database) {
  const schema = Number(database.pragma("user_version", { simple: true }));
  const definition = database.prepare(
    "SELECT type FROM sqlite_master WHERE name = 'catalog_refresh_jobs'",
  ).get();
  if (schema < 6) {
    if (definition) throw invalid("must not exist before schema 6");
    return [];
  }
  if (definition?.type !== "table") throw invalid("require their schema-6 table");
  const columns = database.pragma("table_xinfo(catalog_refresh_jobs)");
  if (
    columns.length !== COLUMNS.length ||
    columns.some((column, index) => column.name !== COLUMNS[index] || column.hidden !== 0)
  ) {
    throw invalid("must use the exact known columns");
  }
  return database.prepare("SELECT * FROM catalog_refresh_jobs ORDER BY job_id").all();
}

function sanitizedResult(raw) {
  let result;
  try { result = JSON.parse(raw); }
  catch { throw invalid("contain malformed result JSON"); }
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const nullableCount = value => value === null || count(value);
  const nullableText = value => value === null || typeof value === "string";
  if (
    !result || typeof result !== "object" || Array.isArray(result) ||
    JSON.stringify(Object.keys(result).sort()) !== JSON.stringify([...RESULT_KEYS].sort()) ||
    ![result.imported, result.reactivated_count, result.discontinued_count].every(count) ||
    ![result.reused_cached_products, result.detail_fetches].every(nullableCount) ||
    ![result.detected_store, result.detected_collection].every(nullableText) ||
    !(result.discovered_materials === null ||
      (Array.isArray(result.discovered_materials) && result.discovered_materials.every(value => typeof value === "string"))) ||
    typeof result.output !== "string"
  ) {
    throw invalid("must use the exact known result contract");
  }
  return JSON.stringify({
    imported: result.imported,
    detected_store: null,
    detected_collection: null,
    discovered_materials: null,
    reactivated_count: result.reactivated_count,
    discontinued_count: result.discontinued_count,
    reused_cached_products: result.reused_cached_products,
    detail_fetches: result.detail_fetches,
    output: RELEASE_UPGRADE_CATALOG_JOB_OUTPUT,
  });
}

function sanitizedJob(row) {
  const timestamp = value => typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
  if (
    typeof row.job_id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(row.job_id) || row.job_id === "active" ||
    !["Bambu", "eSUN"].includes(row.vendor) ||
    typeof row.material !== "string" || !row.material.trim() ||
    Buffer.byteLength(row.material, "utf8") > 128 || /[\u0000-\u001f\u007f-\u009f]/.test(row.material) ||
    !["RUNNING", "SUCCEEDED", "FAILED", "INTERRUPTED"].includes(row.status) ||
    !timestamp(row.started_at) ||
    (row.status === "RUNNING"
      ? row.finished_at !== null || row.result_json !== null || row.error !== null
      : !timestamp(row.finished_at) || (row.status === "SUCCEEDED"
        ? typeof row.result_json !== "string" || row.error !== null
        : row.result_json !== null || typeof row.error !== "string"))
  ) {
    throw invalid("must use the known identity and status contract");
  }
  return {
    ...row,
    authority_key: RELEASE_UPGRADE_CATALOG_JOB_AUTHORITY,
    owner_id: RELEASE_UPGRADE_CATALOG_JOB_OWNER,
    // No worker accompanies a copied database. Settle it before the preservation
    // snapshot so later recovery cannot legitimately change the saved digest.
    status: row.status === "RUNNING" ? "INTERRUPTED" : row.status,
    finished_at: row.status === "RUNNING" ? row.started_at : row.finished_at,
    result_json: row.status === "SUCCEEDED" ? sanitizedResult(row.result_json) : null,
    error: row.status === "SUCCEEDED" ? null : RELEASE_UPGRADE_CATALOG_JOB_ERROR,
  };
}

export function sanitizeReleaseUpgradeCatalogJobs(database) {
  const rows = readJobs(database);
  // Validate every row before any write, including when called independently.
  const sanitized = rows.map(sanitizedJob);
  if (rows.length) {
    const update = database.prepare(
      "UPDATE catalog_refresh_jobs SET authority_key = ?, owner_id = ?, status = ?, finished_at = ?, result_json = ?, error = ? WHERE job_id = ?",
    );
    database.transaction(() => {
      for (const row of sanitized) update.run(
        row.authority_key, row.owner_id, row.status, row.finished_at,
        row.result_json, row.error, row.job_id,
      );
    })();
  }
  return {
    sanitizedCatalogJobs: rows.length,
    interruptedCatalogJobs: rows.filter(row => row.status === "RUNNING").length,
  };
}

export function assertReleaseUpgradeCatalogJobsSanitized(database) {
  for (const row of readJobs(database)) {
    const expected = sanitizedJob(row);
    if (COLUMNS.some(column => row[column] !== expected[column])) {
      throw invalid("still contain operational identities or diagnostics");
    }
  }
}
