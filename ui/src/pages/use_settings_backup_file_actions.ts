import { type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import type { Locale } from "../lib/i18n";
import { clearDashboardPageSnapshot } from "../lib/dashboard_page_snapshot_cache";
import { toErrorMessage } from "../lib/error_text";
import {
  importDataFile,
  validateFullBackupJson,
  type BackupValidationStats,
  type CatalogResetStats,
  type LibrarySyncHostValidationResult,
  type LibrarySyncRemoteSnapshot,
} from "../lib/tauri_client";
import {
  buildSettingsBackupErrorMessage,
  buildSettingsBackupValidationSuccessMessage,
  buildSettingsImportSuccessMessage,
  resolveSettingsFullBackupImportedAt,
  shouldPrepareImportedFullBackupAsHost,
  type SettingsBackupErrorMessageLabels,
  type SettingsBackupValidationMessageLabels,
  type SettingsImportMessageLabels,
} from "./settings_backup_model";
import type { LibrarySyncMode } from "./settings_library_sync_model";

type UseSettingsBackupFileActionsInput = {
  busy: boolean;
  clearBackupValidation: () => void;
  clearConfirmResetAction: () => void;
  librarySyncModeDraft: LibrarySyncMode;
  locale: Locale;
  recordBackupValidation: (summary: BackupValidationStats, validatedAt: string) => void;
  recordImportedFullBackup: (importedAt: string) => void;
  reloadSettings: () => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<SettingsTabKey>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setInfo: Dispatch<SetStateAction<string | null>>;
  setLastCatalogReset: Dispatch<SetStateAction<CatalogResetStats | null>>;
  setLibrarySyncHostBaseUrlDraft: Dispatch<SetStateAction<string>>;
  setLibrarySyncModeDraft: Dispatch<SetStateAction<LibrarySyncMode>>;
  setLibrarySyncSnapshot: Dispatch<SetStateAction<LibrarySyncRemoteSnapshot | null>>;
  setLibrarySyncValidation: Dispatch<SetStateAction<LibrarySyncHostValidationResult | null>>;
  settingsBackupErrorMessageLabels: () => SettingsBackupErrorMessageLabels;
  settingsBackupValidationMessageLabels: () => SettingsBackupValidationMessageLabels;
  settingsClientReadOnly: boolean;
  settingsImportMessageLabels: () => SettingsImportMessageLabels;
  tauri: boolean;
  t: (key: string, fallback?: string) => string;
};

export function useSettingsBackupFileActions({
  busy,
  clearBackupValidation,
  clearConfirmResetAction,
  librarySyncModeDraft,
  locale,
  recordBackupValidation,
  recordImportedFullBackup,
  reloadSettings,
  setActiveTab,
  setBusy,
  setError,
  setInfo,
  setLastCatalogReset,
  setLibrarySyncHostBaseUrlDraft,
  setLibrarySyncModeDraft,
  setLibrarySyncSnapshot,
  setLibrarySyncValidation,
  settingsBackupErrorMessageLabels,
  settingsBackupValidationMessageLabels,
  settingsClientReadOnly,
  settingsImportMessageLabels,
  tauri,
  t,
}: UseSettingsBackupFileActionsInput) {
  async function handleImportDataFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tauri || busy || settingsClientReadOnly) {
      return;
    }
    clearConfirmResetAction();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      let fullBackupValidation: BackupValidationStats | null = null;
      try {
        fullBackupValidation = await validateFullBackupJson(content);
      } catch {
        // Inventory CSV/JSON imports are not full-library restores and continue
        // through the non-destructive merge path below. Malformed full backups
        // are rejected by the command-side preflight before any write occurs.
      }
      if (
        fullBackupValidation &&
        !window.confirm(
          t(
            "settings.confirmImportBackup",
            "Import full backup now?\n\nThis will replace current inventory, history, configured printers and maintenance data.",
          ),
        )
      ) {
        return;
      }
      const result = await importDataFile(content);
      if (fullBackupValidation) {
        clearDashboardPageSnapshot();
      }
      setLastCatalogReset(null);
      clearBackupValidation();
      await reloadSettings();
      const fullBackupImportedAt = resolveSettingsFullBackupImportedAt({
        detectedFormat: result.detected_format,
        importedAt: new Date().toISOString(),
      });
      if (fullBackupImportedAt) {
        recordImportedFullBackup(fullBackupImportedAt);
        if (shouldPrepareImportedFullBackupAsHost({
          detectedFormat: result.detected_format,
          librarySyncMode: librarySyncModeDraft,
        })) {
          setLibrarySyncModeDraft("HOST");
          setLibrarySyncHostBaseUrlDraft("");
          setLibrarySyncValidation(null);
          setLibrarySyncSnapshot(null);
          setActiveTab("GENERAL");
          setInfo(buildSettingsImportSuccessMessage({
            importedOnClient: true,
            labels: settingsImportMessageLabels(),
            locale,
            result,
          }));
          return;
        }
        setInfo(buildSettingsImportSuccessMessage({
          importedOnClient: false,
          labels: settingsImportMessageLabels(),
          locale,
          result,
        }));
      } else {
        setInfo(buildSettingsImportSuccessMessage({
          importedOnClient: false,
          labels: settingsImportMessageLabels(),
          locale,
          result,
        }));
      }
    } catch (importError) {
      console.error(importError);
      setError(
        toErrorMessage(
          importError,
          buildSettingsBackupErrorMessage("importDataFailed", settingsBackupErrorMessageLabels()),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleValidateBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const content = await file.text();
      const summary = await validateFullBackupJson(content);
      recordBackupValidation(summary, new Date().toISOString());
      setInfo(buildSettingsBackupValidationSuccessMessage(settingsBackupValidationMessageLabels()));
    } catch (validationError) {
      console.error(validationError);
      setError(
        toErrorMessage(
          validationError,
          buildSettingsBackupErrorMessage(
            "validateBackupFailed",
            settingsBackupErrorMessageLabels(),
          ),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    handleImportDataFile,
    handleValidateBackupFile,
  };
}
