import { useSettingsMessageLabels } from "./use_settings_message_labels";

type TranslateFn = (key: string, fallback?: string) => string;

export function useSettingsMessageGroups(t: TranslateFn) {
  const messageLabels = useSettingsMessageLabels(t);
  const {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
  } = messageLabels.librarySync;
  const {
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  } = messageLabels.trustedLan;
  const { settingsPrinterMessageLabels } = messageLabels.printer;
  const {
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
  } = messageLabels.maintenance;
  const {
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
  } = messageLabels.backup;
  const {
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
  } = messageLabels.inventoryPrint;
  const {
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
  } = messageLabels.catalog;
  const {
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
  } = messageLabels.swatch;

  return {
    librarySyncActionMessageLabels,
    librarySyncErrorMessageLabels,
    librarySyncPairingMessageLabels,
    settingsBackupErrorMessageLabels,
    settingsBackupValidationMessageLabels,
    settingsCatalogRefreshMessageLabels,
    settingsCatalogRefreshSummaryLabels,
    settingsCatalogResetMessageLabels,
    settingsImportMessageLabels,
    settingsInventoryExportMessageLabels,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
    settingsMaintenanceResetMessageLabels,
    settingsPrinterMessageLabels,
    settingsSwatchBulkMessageLabels,
    settingsSwatchErrorMessageLabels,
    settingsSwatchSavedMessageLabels,
    trustedLanActionMessageLabels,
    trustedLanConfigMessageLabels,
    trustedLanLoadMessageLabels,
    trustedLanValidationMessageLabels,
  };
}
