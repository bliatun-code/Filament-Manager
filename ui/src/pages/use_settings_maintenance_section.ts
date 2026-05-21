import type { Dispatch, SetStateAction } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import type { Locale } from "../lib/i18n";
import type {
  BackupValidationStats,
  CatalogResetStats,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
  SpoolWithMasterRow,
  TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import type {
  SettingsBackupErrorMessageLabels,
  SettingsBackupValidationMessageLabels,
  SettingsImportMessageLabels,
  SettingsInventoryExportMessageLabels,
} from "./settings_backup_model";
import type {
  SettingsCatalogResetMessageLabels,
  SettingsMaintenanceResetMessageLabels,
} from "./settings_maintenance_model";
import type {
  SettingsInventoryOverviewPrintPdfLabels,
  SettingsInventoryPrintLabels,
  SettingsInventoryPrintMessageLabels,
} from "./settings_inventory_print_model";
import { buildSettingsMaintenanceRouteProps } from "./settings_maintenance_route_props";
import type { LibrarySyncMode } from "./settings_library_sync_model";
import { useSettingsBackupExportActions } from "./use_settings_backup_export_actions";
import { useSettingsBackupFileActions } from "./use_settings_backup_file_actions";
import { useSettingsBackupFileControls } from "./use_settings_backup_file_controls";
import { useSettingsInventoryPrintAction } from "./use_settings_inventory_print_action";
import { useSettingsInventoryRowsLoader } from "./use_settings_inventory_rows_loader";
import { useSettingsMaintenanceActions } from "./use_settings_maintenance_actions";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsMaintenanceSectionInput = {
  backupValidationHasExtraTables: boolean;
  backupValidationHasMissingTables: boolean;
  backupValidationHasWarnings: boolean;
  busy: boolean;
  catalogCount: number;
  clearBackupValidation: () => void;
  lastBackupValidation: BackupValidationStats | null;
  lastCatalogReset: CatalogResetStats | null;
  librarySyncModeDraft: LibrarySyncMode;
  locale: Locale;
  missingSwatchCount: number;
  printerCount: number;
  recordBackupValidation: (summary: BackupValidationStats, validatedAt: string) => void;
  recordExportedBackupValidation: (
    validationSummary: BackupValidationStats,
    exportedAt: string,
  ) => void;
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
  settingsCatalogResetMessageLabels: () => SettingsCatalogResetMessageLabels;
  settingsClientHostBaseUrl: string | null;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsInventoryRows: SpoolWithMasterRow[];
  settingsImportMessageLabels: () => SettingsImportMessageLabels;
  settingsInventoryExportMessageLabels: () => SettingsInventoryExportMessageLabels;
  settingsInventoryOverviewPrintMessageLabels: () => SettingsInventoryPrintMessageLabels;
  settingsInventoryOverviewPrintPdfLabels: () => SettingsInventoryOverviewPrintPdfLabels;
  settingsInventoryPrintLabels: () => SettingsInventoryPrintLabels;
  settingsMaintenanceResetMessageLabels: () => SettingsMaintenanceResetMessageLabels;
  tauri: boolean;
  t: TranslateFn;
  trustedLanStatus: TrustedLanCompanionStatus | null;
};

export function useSettingsMaintenanceSection({
  backupValidationHasExtraTables,
  backupValidationHasMissingTables,
  backupValidationHasWarnings,
  busy,
  catalogCount,
  clearBackupValidation,
  lastBackupValidation,
  lastCatalogReset,
  librarySyncModeDraft,
  locale,
  missingSwatchCount,
  printerCount,
  recordBackupValidation,
  recordExportedBackupValidation,
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
  settingsCatalogResetMessageLabels,
  settingsClientHostBaseUrl,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsInventoryRows,
  settingsImportMessageLabels,
  settingsInventoryExportMessageLabels,
  settingsInventoryOverviewPrintMessageLabels,
  settingsInventoryOverviewPrintPdfLabels,
  settingsInventoryPrintLabels,
  settingsMaintenanceResetMessageLabels,
  tauri,
  t,
  trustedLanStatus,
}: UseSettingsMaintenanceSectionInput) {
  const {
    backupImportInputRef,
    backupValidateInputRef,
    clearConfirmResetAction,
    confirmResetAction,
    handleOpenBackupValidate,
    handleOpenDataImport,
    setConfirmResetAction,
  } = useSettingsBackupFileControls({
    busy,
    tauri,
  });

  const { handleResetAppData, handleResetCatalogs } = useSettingsMaintenanceActions({
    busy,
    clearConfirmResetAction,
    confirmResetAction,
    reloadSettings,
    setBusy,
    setConfirmResetAction,
    setError,
    setInfo,
    setLastCatalogReset,
    settingsCatalogResetMessageLabels,
    settingsMaintenanceResetMessageLabels,
    tauri,
  });

  const loadSettingsInventoryRows = useSettingsInventoryRowsLoader({
    fallbackRows: settingsInventoryRows,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
  });

  const {
    handleExportFullBackup,
    handleExportInventoryCsv,
    handleExportInventoryJson,
  } = useSettingsBackupExportActions({
    busy,
    loadSettingsInventoryRows,
    recordExportedBackupValidation,
    setBusy,
    setError,
    setInfo,
    settingsBackupErrorMessageLabels,
    settingsClientReadOnly,
    settingsInventoryExportMessageLabels,
    tauri,
    t,
  });

  const { handlePrintInventoryOverviewA4 } = useSettingsInventoryPrintAction({
    busy,
    loadSettingsInventoryRows,
    locale,
    setBusy,
    setError,
    setInfo,
    settingsClientHostBaseUrl,
    settingsClientReadOnly,
    settingsInventoryOverviewPrintMessageLabels,
    settingsInventoryOverviewPrintPdfLabels,
    settingsInventoryPrintLabels,
    tauri,
    trustedLanStatus,
  });

  const { handleImportDataFile, handleValidateBackupFile } = useSettingsBackupFileActions({
    busy,
    clearBackupValidation,
    clearConfirmResetAction,
    librarySyncModeDraft,
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
    settingsImportMessageLabels,
    tauri,
  });

  const settingsMaintenanceRouteProps = buildSettingsMaintenanceRouteProps({
    backupImportInputRef,
    backupValidateInputRef,
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    busy,
    catalogCount,
    confirmResetAction,
    lastBackupValidation,
    lastCatalogReset,
    missingSwatchCount,
    printerCount,
    tauri,
    t,
    onExportFullBackup: handleExportFullBackup,
    onExportInventoryCsv: handleExportInventoryCsv,
    onExportInventoryJson: handleExportInventoryJson,
    onImportDataFile: handleImportDataFile,
    onOpenBackupValidate: handleOpenBackupValidate,
    onOpenDataImport: handleOpenDataImport,
    onResetAppData: handleResetAppData,
    onResetCatalogs: handleResetCatalogs,
    onValidateBackupFile: handleValidateBackupFile,
  });

  return {
    handleExportFullBackup,
    handleOpenBackupValidate,
    handleOpenDataImport,
    handlePrintInventoryOverviewA4,
    settingsMaintenanceRouteProps,
  };
}
