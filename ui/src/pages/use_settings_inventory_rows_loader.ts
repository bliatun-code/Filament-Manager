import { useCallback } from "react";
import { loadAllSpoolRows } from "../lib/spool_data_source";
import type { SpoolWithMasterRow } from "../lib/tauri_client";

type UseSettingsInventoryRowsLoaderInput = {
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
};

export function useSettingsInventoryRowsLoader({
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientReadOnly,
}: UseSettingsInventoryRowsLoaderInput) {
  return useCallback(async (): Promise<SpoolWithMasterRow[]> => {
    return loadAllSpoolRows(
      {
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        clientLibraryId: settingsClientLibraryId,
      },
      200,
    );
  }, [
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
  ]);
}
