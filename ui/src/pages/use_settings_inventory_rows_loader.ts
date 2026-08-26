import { useCallback } from "react";
import { loadAllSpoolRows } from "../lib/spool_data_source";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
import type { SpoolWithMasterRow } from "../lib/tauri_client";
import { loadSettingsInventoryRowsForExport } from "./settings_inventory_rows_loader_model";

type UseSettingsInventoryRowsLoaderInput = {
  fallbackRows: SpoolWithMasterRow[];
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsClientTargetGeneration: number | null;
};

export function useSettingsInventoryRowsLoader({
  fallbackRows,
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsClientTargetGeneration,
}: UseSettingsInventoryRowsLoaderInput) {
  return useCallback(async (): Promise<NormalizedSpoolWithMasterRow[]> => {
    return loadSettingsInventoryRowsForExport({
      fallbackRows,
      loadAllSpoolRows,
      options: {
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        clientLibraryId: settingsClientLibraryId,
        clientTargetGeneration: settingsClientTargetGeneration,
      },
      pageLimit: 200,
    });
  }, [
    fallbackRows,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsClientTargetGeneration,
  ]);
}
