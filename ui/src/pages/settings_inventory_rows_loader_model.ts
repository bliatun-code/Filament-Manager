import { resolveClientHostCacheTarget } from "../lib/host_write_target";
import { loadAllSpoolRows, type SpoolDataSourceOptions } from "../lib/spool_data_source";
import { normalizeSpoolWithMasterRows } from "../lib/spool_row_normalization";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import { resolveSettingsInventoryExportSource, type SettingsInventoryExportFormat } from "./settings_backup_model";
import { exportInventoryCsv, exportInventoryJson, fetchCachedLibrarySyncSpools, getLibrarySyncPageStatus } from "../lib/tauri_client";

export async function loadSettingsInventoryRowsForExport(
  options: SpoolDataSourceOptions,
  {
    loadRows = loadAllSpoolRows,
    loadCache = fetchCachedLibrarySyncSpools,
    loadStatus = getLibrarySyncPageStatus,
  } = {},
) {
  if (!options.clientReadOnly) return loadRows(options, 200);
  const target = resolveClientHostCacheTarget(options);
  if (!target) throw new Error("Host connection details are missing for inventory export.");

  let rows;
  try {
    rows = await loadRows(options, 200);
  } catch (error) {
    const saved = await loadCache(target.baseUrl, target.libraryId, target.targetGeneration);
    if (!saved) throw error;
    rows = normalizeSpoolWithMasterRows(saved.rows);
  }
  const current = await loadStatus();
  if (
    current.mode !== "CLIENT" || current.host_base_url?.trim() !== target.baseUrl ||
    current.library_id.trim() !== target.libraryId || current.target_generation !== target.targetGeneration
  ) {
    throw new Error("Host connection changed during inventory export.");
  }
  return rows;
}

export async function settingsInventoryExportContent(format: SettingsInventoryExportFormat, options: SpoolDataSourceOptions) {
  if (resolveSettingsInventoryExportSource(options.clientReadOnly) === "localCommand") {
    const payload = format === "csv" ? await exportInventoryCsv() : await exportInventoryJson();
    return payload.content;
  }
  const rows = await loadSettingsInventoryRowsForExport(options);
  return format === "csv" ? buildInventoryExportCsv(rows) : buildInventoryExportJson(rows);
}
