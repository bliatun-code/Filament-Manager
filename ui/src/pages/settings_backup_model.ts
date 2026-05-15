import type { BackupValidationStats } from "../lib/tauri_client";
import { isFullBackupValidationFormat } from "../lib/settings_utils";

export type SettingsBackupValidationState = {
  hasExtraTables: boolean;
  hasMissingTables: boolean;
  hasValidatedFullBackup: boolean;
  hasValidatedLatestFullBackup: boolean;
  hasWarnings: boolean;
};

export function buildSettingsBackupValidationState({
  lastBackupValidation,
  lastFullBackupExportedAt,
  lastFullBackupValidatedAt,
}: {
  lastBackupValidation: BackupValidationStats | null;
  lastFullBackupExportedAt: string | null;
  lastFullBackupValidatedAt: string | null;
}): SettingsBackupValidationState {
  const hasMissingTables = (lastBackupValidation?.missing_tables.length ?? 0) > 0;
  const hasExtraTables = (lastBackupValidation?.extra_tables.length ?? 0) > 0;
  const hasValidatedFullBackup = isFullBackupValidationFormat(lastBackupValidation?.format);

  return {
    hasExtraTables,
    hasMissingTables,
    hasValidatedFullBackup,
    hasValidatedLatestFullBackup: hasLatestFullBackupValidation({
      hasValidatedFullBackup,
      lastFullBackupExportedAt,
      lastFullBackupValidatedAt,
    }),
    hasWarnings: hasMissingTables || hasExtraTables,
  };
}

function hasLatestFullBackupValidation({
  hasValidatedFullBackup,
  lastFullBackupExportedAt,
  lastFullBackupValidatedAt,
}: {
  hasValidatedFullBackup: boolean;
  lastFullBackupExportedAt: string | null;
  lastFullBackupValidatedAt: string | null;
}): boolean {
  if (!hasValidatedFullBackup) {
    return false;
  }
  if (!lastFullBackupExportedAt) {
    return true;
  }
  if (!lastFullBackupValidatedAt) {
    return false;
  }
  const exportedAt = new Date(lastFullBackupExportedAt).getTime();
  const validatedAt = new Date(lastFullBackupValidatedAt).getTime();
  if (Number.isNaN(exportedAt) || Number.isNaN(validatedAt)) {
    return false;
  }
  return validatedAt >= exportedAt;
}
