import type { SettingsBackupValidation } from "./settings_backup_model";
import { useMemo, useState } from "react";
import { isFullBackupValidationFormat } from "../lib/settings_utils";
import { buildSettingsBackupValidationState } from "./settings_backup_model";

export function useSettingsBackupValidationState() {
  const [lastFullBackupExportedAt, setLastFullBackupExportedAt] = useState<string | null>(null);
  const [lastFullBackupValidatedAt, setLastFullBackupValidatedAt] = useState<string | null>(null);
  const [lastFullBackupImportedAt, setLastFullBackupImportedAt] = useState<string | null>(null);
  const [lastBackupValidation, setLastBackupValidation] =
    useState<SettingsBackupValidation | null>(null);

  const backupValidationState = useMemo(
    () =>
      buildSettingsBackupValidationState({
        lastBackupValidation,
        lastFullBackupExportedAt,
        lastFullBackupValidatedAt,
      }),
    [lastBackupValidation, lastFullBackupExportedAt, lastFullBackupValidatedAt],
  );

  function clearFullBackupProgress() {
    setLastFullBackupExportedAt(null);
    setLastFullBackupValidatedAt(null);
    setLastFullBackupImportedAt(null);
    setLastBackupValidation(null);
  }

  function clearBackupValidation() {
    setLastBackupValidation(null);
  }

  function recordExportedBackupValidation(summary: SettingsBackupValidation, exportedAt: string) {
    setLastFullBackupExportedAt(exportedAt);
    setLastBackupValidation(summary);
    setLastFullBackupValidatedAt(isFullBackupValidationFormat(summary.format) ? exportedAt : null);
  }

  function recordImportedFullBackup(importedAt: string) {
    setLastFullBackupImportedAt(importedAt);
  }

  function recordBackupValidation(summary: SettingsBackupValidation, validatedAt: string) {
    setLastBackupValidation(summary);
    if (isFullBackupValidationFormat(summary.format)) {
      setLastFullBackupValidatedAt(validatedAt);
    }
  }

  return {
    backupValidationState,
    clearBackupValidation,
    clearFullBackupProgress,
    lastBackupValidation,
    lastFullBackupExportedAt,
    lastFullBackupImportedAt,
    lastFullBackupValidatedAt,
    recordBackupValidation,
    recordExportedBackupValidation,
    recordImportedFullBackup,
  };
}
