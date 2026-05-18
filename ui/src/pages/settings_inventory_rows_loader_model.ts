import type { SpoolWithMasterRow } from "../lib/tauri_client";

export type SettingsInventoryRowsLoadOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

type LoadAllSpoolRows = (
  options: SettingsInventoryRowsLoadOptions,
  limit: number,
) => Promise<SpoolWithMasterRow[]>;

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
}): Promise<SpoolWithMasterRow[]> {
  try {
    return await loadAllSpoolRows(options, pageLimit);
  } catch (error) {
    if (options.clientReadOnly) {
      return fallbackRows;
    }
    throw error;
  }
}
