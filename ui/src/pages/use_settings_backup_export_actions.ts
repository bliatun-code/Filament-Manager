import { type Dispatch, type SetStateAction } from "react";
import { downloadTextFile } from "../lib/download_file";
import { toErrorMessage } from "../lib/error_text";
import { buildInventoryExportCsv, buildInventoryExportJson } from "../lib/inventory_export";
import {
  exportFullBackupJson,
  exportInventoryCsv,
  exportInventoryJson,
  fetchLibrarySyncFullBackupJson,
  validateFullBackupJson,
  type BackupValidationStats,
  type SpoolWithMasterRow,
} from "../lib/tauri_client";
import type { useI18n } from "../lib/i18n";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupExportSuccessMessage,
  buildSettingsInventoryExportSuccessMessage,
  resolveSettingsInventoryExportSource,
  type SettingsBackupErrorMessageLabels,
  type SettingsInventoryExportMessageLabels,
} from "./settings_backup_model";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

type UseSettingsBackupExportActionsInput = {
  busy: boolean;
  loadSettingsInventoryRows: () => Promise<SpoolWithMasterRow[]>;
  recordExportedBackupValidation: (
    validationSummary: BackupValidationStats,
    exportedAt: string,
  ) => void;
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
  loadSettingsInventoryRows,
  recordExportedBackupValidation,
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
      downloadTextFile(
        payload.content,
        `filament-manager-backup-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
      const exportedAt = new Date().toISOString();
      recordExportedBackupValidation(validationSummary, exportedAt);
      setInfo(buildSettingsBackupExportSuccessMessage({
        backupExported: t(
          "settings.backupExported",
          "Full backup exported (inventory, history and printers).",
        ),
        librarySyncBackupAutoValidated: t(
          "settings.librarySyncBackupAutoValidated",
          "The exported backup was validated automatically and is ready to use in the guided role-change flow.",
        ),
      }));
    } catch (backupError) {
      console.error(backupError);
      setError(
        toErrorMessage(
          backupError,
          buildSettingsBackupErrorMessage("exportBackupFailed", settingsBackupErrorMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleExportInventoryCsv() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload =
        resolveSettingsInventoryExportSource(settingsClientReadOnly) === "loadedRows"
          ? { content: buildInventoryExportCsv(await loadSettingsInventoryRows()) }
          : await exportInventoryCsv();
      downloadTextFile(
        payload.content,
        `filament-manager-inventory-${Date.now()}.csv`,
        "text/csv;charset=utf-8",
      );
      setInfo(
        buildSettingsInventoryExportSuccessMessage("csv", settingsInventoryExportMessageLabels()),
      );
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          buildSettingsBackupErrorMessage(
            "exportInventoryCsvFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleExportInventoryJson() {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const payload =
        resolveSettingsInventoryExportSource(settingsClientReadOnly) === "loadedRows"
          ? { content: buildInventoryExportJson(await loadSettingsInventoryRows()) }
          : await exportInventoryJson();
      downloadTextFile(
        payload.content,
        `filament-manager-inventory-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
      setInfo(
        buildSettingsInventoryExportSuccessMessage("json", settingsInventoryExportMessageLabels()),
      );
    } catch (exportError) {
      console.error(exportError);
      setError(
        toErrorMessage(
          exportError,
          buildSettingsBackupErrorMessage(
            "exportInventoryJsonFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    handleExportFullBackup,
    handleExportInventoryCsv,
    handleExportInventoryJson,
  };
}
