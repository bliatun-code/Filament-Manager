import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "../lib/spool_row_normalization";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

export type SettingsInventoryRowsLoadOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
  clientTargetGeneration?: number | null;
};

type LoadAllSpoolRows = (
  options: SettingsInventoryRowsLoadOptions,
  limit: number,
) => Promise<NormalizedSpoolWithMasterRow[]>;

export async function loadSettingsInventoryRowsForExport({
  fallbackRows,
  loadAllSpoolRows,
  options,
  pageLimit,
}: {
  fallbackRows: SpoolWithMasterRow[];
  loadAllSpoolRows: LoadAllSpoolRows;
  options: SettingsInventoryRowsLoadOptions;
  pageLimit: number;
}): Promise<NormalizedSpoolWithMasterRow[]> {
  try {
    return await loadAllSpoolRows(options, pageLimit);
  } catch (error) {
    if (options.clientReadOnly) {
      return normalizeSpoolWithMasterRows(fallbackRows);
    }
    throw error;
  }
}
