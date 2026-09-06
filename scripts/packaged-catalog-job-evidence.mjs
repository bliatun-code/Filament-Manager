export const PACKAGED_CATALOG_PRODUCT_URL =
  "https://example.invalid/packaged-catalog-job";

export const EXPECTED_PACKAGED_CATALOG_JOBS = Object.freeze({
  succeeded: 1,
  interrupted: 1,
  imported: 1,
  client_jobs: 0,
});

export function validatePackagedCatalogJobSummary(value) {
  if (
    !value ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify(Object.keys(EXPECTED_PACKAGED_CATALOG_JOBS).sort()) ||
    Object.entries(EXPECTED_PACKAGED_CATALOG_JOBS).some(
      ([key, expected]) => value[key] !== expected,
    )
  ) {
    throw new Error("Packaged catalog job summary is invalid.");
  }
}

export function inspectPackagedCatalogJobs(host, client, runId) {
  if (typeof runId !== "string" || !runId.trim()) {
    throw new Error("Packaged catalog job run identity is missing.");
  }
  const jobs = host.prepare(
    "SELECT job_id, vendor, material, status, started_at, finished_at, result_json, error " +
      "FROM catalog_refresh_jobs ORDER BY job_id",
  ).all();
  const succeeded = jobs.find(({ job_id }) => job_id === `${runId}-catalog-complete`);
  const interrupted = jobs.find(({ job_id }) => job_id === `${runId}-catalog-interrupt`);
  if (
    jobs.length !== 2 ||
    succeeded?.vendor !== "Bambu" || succeeded.material !== "PLA" ||
    succeeded.status !== "SUCCEEDED" || succeeded.error !== null ||
    interrupted?.vendor !== "eSUN" || interrupted.material !== "PETG" ||
    interrupted.status !== "INTERRUPTED" || interrupted.result_json !== null ||
    typeof interrupted.error !== "string" || !interrupted.error.trim() ||
    jobs.some(({ started_at, finished_at }) =>
      !Number.isFinite(Date.parse(started_at)) ||
      !Number.isFinite(Date.parse(finished_at)) ||
      Date.parse(finished_at) < Date.parse(started_at))
  ) {
    throw new Error("Host catalog job receipts do not match the completed and interrupted requests.");
  }
  let result;
  try {
    result = JSON.parse(succeeded.result_json);
  } catch {
    throw new Error("Host catalog job success receipt is not valid JSON.");
  }
  if (result?.imported !== 1 || result.reactivated_count !== 0 || result.discontinued_count !== 0) {
    throw new Error("Host catalog job success receipt has an unexpected import result.");
  }
  const sourceRows = (database) => database.prepare(
    "SELECT vendor, material, filament_name, color_name, hex_color, default_weight, product_url " +
      "FROM filament_master_list WHERE product_url = ? OR filament_name = ?",
  ).all(PACKAGED_CATALOG_PRODUCT_URL, "Packaged catalog job QA");
  const imported = sourceRows(host);
  const expected = {
    vendor: "Bambu", material: "PLA", filament_name: "Packaged catalog job QA",
    color_name: "QA blue", hex_color: "#1A73E8", default_weight: 1000,
    product_url: PACKAGED_CATALOG_PRODUCT_URL,
  };
  if (imported.length !== 1 || Object.entries(expected).some(([key, value]) => imported[0][key] !== value)) {
    throw new Error("Host catalog job did not preserve exactly one synthetic catalog row.");
  }
  const clientJobCount = client.prepare("SELECT COUNT(*) AS count FROM catalog_refresh_jobs").get().count;
  if (clientJobCount !== 0 || sourceRows(client).length !== 0) {
    throw new Error("Client local library was changed by a Host catalog job.");
  }
  return { ...EXPECTED_PACKAGED_CATALOG_JOBS };
}
