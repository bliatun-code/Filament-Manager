import type { BackupValidationStats, ImportDataStats } from "../lib/tauri_client";
import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "../lib/number_display";
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

export type SettingsImportMessageLabels = {
  backupImported: string;
  created: string;
  importDetectedInventoryCsv: string;
  importDetectedInventoryJson: string;
  importSource: string;
  inventoryImportDone: string;
  librarySyncImportedOnClientHint: string;
  rows: string;
  updated: string;
};

export type SettingsBackupExportMessageLabels = {
  backupExported: string;
  librarySyncBackupAutoValidated: string;
};

export type SettingsBackupValidationMessageLabels = {
  backupValidationDone: string;
};

export type SettingsInventoryExportFormat = "csv" | "json";

export type SettingsInventoryExportMessageLabels = {
  inventoryCsvExported: string;
  inventoryJsonExported: string;
};

export type SettingsInventoryExportSource = "loadedRows" | "localCommand";

export function resolveSettingsInventoryExportSource(
  settingsClientReadOnly: boolean,
): SettingsInventoryExportSource {
  return settingsClientReadOnly ? "loadedRows" : "localCommand";
}

export type SettingsBackupErrorMessageKey =
  | "exportBackupFailed"
  | "exportInventoryCsvFailed"
  | "exportInventoryJsonFailed"
  | "importDataFailed"
  | "validateBackupFailed";

export type SettingsBackupErrorMessageLabels = Record<SettingsBackupErrorMessageKey, string>;

export function buildSettingsBackupErrorMessage(
  key: SettingsBackupErrorMessageKey,
  labels: SettingsBackupErrorMessageLabels,
): string {
  return labels[key];
}

export function buildSettingsBackupExportSuccessMessage(
  labels: SettingsBackupExportMessageLabels,
): string {
  return `${labels.backupExported} ${labels.librarySyncBackupAutoValidated}`;
}

export function buildSettingsBackupValidationSuccessMessage(
  labels: SettingsBackupValidationMessageLabels,
): string {
  return labels.backupValidationDone;
}

export function buildSettingsInventoryExportSuccessMessage(
  format: SettingsInventoryExportFormat,
  labels: SettingsInventoryExportMessageLabels,
): string {
  return format === "csv" ? labels.inventoryCsvExported : labels.inventoryJsonExported;
}

export function shouldPrepareImportedFullBackupAsHost({
  detectedFormat,
  librarySyncMode,
}: {
  detectedFormat: ImportDataStats["detected_format"];
  librarySyncMode: string | null | undefined;
}): boolean {
  return detectedFormat === "FULL_BACKUP" && librarySyncMode === "CLIENT";
}

export function resolveSettingsFullBackupImportedAt({
  detectedFormat,
  importedAt,
}: {
  detectedFormat: ImportDataStats["detected_format"];
  importedAt: string;
}): string | null {
  return detectedFormat === "FULL_BACKUP" ? importedAt : null;
}

export function buildSettingsImportSuccessMessage({
  importedOnClient,
  labels,
  locale = "en",
  result,
}: {
  importedOnClient: boolean;
  labels: SettingsImportMessageLabels;
  locale?: NumberDisplayLocale;
  result: ImportDataStats;
}): string {
  if (result.detected_format === "FULL_BACKUP") {
    const clientHint = importedOnClient ? ` ${labels.librarySyncImportedOnClientHint}` : "";
    return `${labels.backupImported} ${labels.rows}: ${formatDisplayInteger(
      result.imported_count,
      locale,
    )}.${clientHint}`;
  }

  const sourceLabel =
    result.detected_format === "INVENTORY_CSV"
      ? labels.importDetectedInventoryCsv
      : labels.importDetectedInventoryJson;

  return `${labels.inventoryImportDone} ${labels.importSource}: ${sourceLabel}. ${labels.rows}: ${formatDisplayInteger(
    result.imported_count,
    locale,
  )} (${labels.created} ${formatDisplayInteger(
    result.created_count,
    locale,
  )}, ${labels.updated} ${formatDisplayInteger(result.updated_count, locale)}).`;
}
