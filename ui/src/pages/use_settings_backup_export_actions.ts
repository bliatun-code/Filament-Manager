import type { SettingsBackupValidation } from "./settings_backup_model";
import { type Dispatch, type SetStateAction } from "react";
import { downloadTextFile } from "../lib/download_file";
import { toErrorMessage } from "../lib/error_text";
import {
  exportFullBackupJson,
  fetchLibrarySyncFullBackupJson,
  validateFullBackupJson,
} from "../lib/tauri_client";
import type { useI18n } from "../lib/i18n";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupExportSuccessMessage,
  buildSettingsInventoryExportSuccessMessage,
  type SettingsBackupErrorMessageLabels,
  type SettingsInventoryExportFormat,
  type SettingsInventoryExportMessageLabels,
} from "./settings_backup_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

type UseSettingsBackupExportActionsInput = {
  busy: boolean;
  settingsClientTargetGeneration: number | null;
  recordExportedBackupValidation: (
    validationSummary: SettingsBackupValidation,
    exportedAt: string,
  ) => void;
  recordFullBackupExport: (exportedAt: string) => void;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  settingsBackupErrorMessageLabels: () => SettingsBackupErrorMessageLabels;
  settingsClientHostBaseUrl: string | null;
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsInventoryExportMessageLabels: () => SettingsInventoryExportMessageLabels;
  tauri: boolean;
  t: SettingsTranslator;
};

export function useSettingsBackupExportActions({
  busy,
  settingsClientTargetGeneration,
  recordExportedBackupValidation,
  recordFullBackupExport,
  setBusy,
  setError,
  setInfo,
  settingsBackupErrorMessageLabels,
  settingsClientHostBaseUrl,
  settingsClientHostWritePaired,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsInventoryExportMessageLabels,
  tauri,
  t,
}: UseSettingsBackupExportActionsInput) {
  async function handleExportFullBackup() {
    if (!tauri || busy) {
      return;
    }
    if (
      settingsClientReadOnly &&
      (!settingsClientHostWritePaired || !settingsClientHostBaseUrl || !settingsClientLibraryId)
    ) {
      setError(
        t(
          "settings.clientHostBackupRequiresPairing",
          "Pair this client with the host before exporting a full host backup.",
        ),
      );
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload = settingsClientReadOnly
        ? await fetchLibrarySyncFullBackupJson(
            settingsClientHostBaseUrl ?? "",
            settingsClientLibraryId,
          )
        : await exportFullBackupJson();
      const validationSummary = await validateFullBackupJson(payload.content);
      const fileName = `filament-manager-backup-${Date.now()}.json`;
      downloadTextFile(
        payload.content,
        fileName,
        "application/json;charset=utf-8",
      );
      const exportedAt = new Date().toISOString();
      recordFullBackupExport(exportedAt);
      recordExportedBackupValidation({ ...validationSummary, fileName }, exportedAt);
      setInfo(buildSettingsBackupExportSuccessMessage({
        backupExported: t(
          "settings.backupExported",
          "Full backup exported (inventory, history and printers).",
        ),
        librarySyncBackupAutoValidated: t(
          "settings.backupValidationDone",
          "Backup validation completed.",
        ),
      }));
    } catch (backupError) {
      console.error(backupError);
      setError(
        toErrorMessage(
          backupError,
          buildSettingsBackupErrorMessage("exportBackupFailed", settingsBackupErrorMessageLabels()),
          t,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function exportInventory(format: SettingsInventoryExportFormat) {
    if (!tauri || busy) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    const csv = format === "csv";
    try {
      const { settingsInventoryExportContent } = await import("./settings_inventory_rows_loader_model");
      const content = await settingsInventoryExportContent(format, {
        clientReadOnly: settingsClientReadOnly,
        clientHostBaseUrl: settingsClientHostBaseUrl,
        clientLibraryId: settingsClientLibraryId,
        clientTargetGeneration: settingsClientTargetGeneration,
      });
      downloadTextFile(
        content,
        `filament-manager-inventory-${Date.now()}.${format}`,
        csv ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
      );
      setInfo(buildSettingsInventoryExportSuccessMessage(format, settingsInventoryExportMessageLabels()));
    } catch (exportError) {
      console.error(exportError);
      const key = csv ? "exportInventoryCsvFailed" : "exportInventoryJsonFailed";
      setError(toErrorMessage(exportError, buildSettingsBackupErrorMessage(key, settingsBackupErrorMessageLabels()), t));
    } finally {
      setBusy(false);
    }
  }

  return {
    handleExportFullBackup,
    handleExportInventoryCsv: () => exportInventory("csv"),
    handleExportInventoryJson: () => exportInventory("json"),
  };
}
