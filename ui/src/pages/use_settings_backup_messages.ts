import { useCallback } from "react";
import type { useI18n } from "../lib/i18n";

type SettingsTranslator = ReturnType<typeof useI18n>["t"];

export function useSettingsBackupMessages(t: SettingsTranslator) {
  const settingsInventoryExportMessageLabels = useCallback(() => ({
    inventoryCsvExported: t("settings.inventoryCsvExported", "Inventory CSV exported."),
    inventoryJsonExported: t("settings.inventoryJsonExported", "Inventory JSON exported."),
  }), [t]);

  const settingsImportMessageLabels = useCallback(() => ({
    backupImported: t("settings.backupImported", "Full backup imported successfully."),
    created: t("settings.created", "created"),
    importDetectedInventoryCsv: t("settings.importDetectedInventoryCsv", "Inventory CSV"),
    importDetectedInventoryJson: t("settings.importDetectedInventoryJson", "Inventory JSON"),
    importSource: t("settings.importSource", "Source"),
    inventoryImportDone: t("settings.inventoryImportDone", "Inventory import completed."),
    librarySyncImportedOnClientHint: t(
      "settings.librarySyncImportedOnClientHint",
      "This device is now prepared as the next host. Review Library roles and save when ready to take over.",
    ),
    rows: t("settings.validationRows", "Rows"),
    updated: t("settings.updated", "updated"),
  }), [t]);

  const settingsBackupValidationMessageLabels = useCallback(() => ({
    backupValidationDone: t("settings.backupValidationDone", "Backup validation completed."),
  }), [t]);

  const settingsBackupErrorMessageLabels = useCallback(() => ({
    exportBackupFailed: t("settings.error.exportBackup", "Failed to export full backup."),
    exportInventoryCsvFailed: t(
      "settings.error.exportInventoryCsv",
      "Failed to export inventory CSV.",
    ),
    exportInventoryJsonFailed: t(
      "settings.error.exportInventoryJson",
      "Failed to export inventory JSON.",
    ),
    importDataFailed: t("settings.error.importData", "Failed to import selected file."),
    validateBackupFailed: t(
      "settings.error.validateBackup",
      "Failed to validate backup file.",
    ),
  }), [t]);

  return {
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
  };
}
