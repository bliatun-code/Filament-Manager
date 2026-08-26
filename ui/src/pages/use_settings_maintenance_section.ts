import type { Dispatch, SetStateAction } from "react";
import type { SettingsTabKey } from "./settings_page_model";
import type { Locale } from "../lib/i18n";
import type {
  BackupValidationStats,
  CatalogResetStats,
  LibrarySyncHostValidationResult,
  LibrarySyncRemoteSnapshot,
} from "../lib/tauri_client";
import type { NormalizedSpoolWithMasterRow } from "../lib/spool_row_normalization";
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
import { buildSettingsMaintenanceRouteProps } from "./settings_maintenance_route_props";
import type { LibrarySyncMode } from "./settings_library_sync_model";
import { useSettingsBackupExportActions } from "./use_settings_backup_export_actions";
import { useSettingsBackupFileActions } from "./use_settings_backup_file_actions";
import { useSettingsBackupFileControls } from "./use_settings_backup_file_controls";
import { useSettingsInventoryRowsLoader } from "./use_settings_inventory_rows_loader";
import { useSettingsMaintenanceActions } from "./use_settings_maintenance_actions";
import { useSettingsApplicationDiagnostics } from "./use_settings_application_diagnostics";
import { useSettingsFullBackupActivity } from "./use_settings_full_backup_activity";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsMaintenanceSectionInput = {
  applicationDiagnosticsEnabled: boolean;
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
  settingsClientHostWritePaired: boolean;
  settingsClientLibraryId: string | null;
  settingsClientReadOnly: boolean;
  settingsClientTargetGeneration: number | null;
  settingsInventoryRows: NormalizedSpoolWithMasterRow[];
  settingsImportMessageLabels: () => SettingsImportMessageLabels;
  settingsInventoryExportMessageLabels: () => SettingsInventoryExportMessageLabels;
  settingsMaintenanceResetMessageLabels: () => SettingsMaintenanceResetMessageLabels;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsMaintenanceSection({
  applicationDiagnosticsEnabled,
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
  settingsClientHostWritePaired,
  settingsClientLibraryId,
  settingsClientReadOnly,
  settingsClientTargetGeneration,
  settingsInventoryRows,
  settingsImportMessageLabels,
  settingsInventoryExportMessageLabels,
  settingsMaintenanceResetMessageLabels,
  tauri,
  t,
}: UseSettingsMaintenanceSectionInput) {
  const {
    diagnostics: applicationDiagnostics,
    downloadSanitizedSupportBundle,
    refreshApplicationDiagnostics,
    refreshError: applicationDiagnosticsError,
    refreshStatus: applicationDiagnosticsStatus,
    supportError: supportBundleError,
    supportStatus: supportBundleStatus,
  } = useSettingsApplicationDiagnostics({
    enabled: applicationDiagnosticsEnabled,
    tauri,
    t,
  });

  const {
    latestFullBackupExportedAt,
    recordFullBackupExport,
  } = useSettingsFullBackupActivity();

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
    locale,
    reloadSettings,
    setBusy,
    setConfirmResetAction,
    setError,
    setInfo,
    setLastCatalogReset,
    settingsCatalogResetMessageLabels,
    settingsClientReadOnly,
    settingsMaintenanceResetMessageLabels,
    tauri,
  });

  const loadSettingsInventoryRows = useSettingsInventoryRowsLoader({
    fallbackRows: settingsInventoryRows,
    settingsClientHostBaseUrl,
    settingsClientLibraryId,
    settingsClientReadOnly,
    settingsClientTargetGeneration,
  });

  const {
    handleExportFullBackup,
    handleExportInventoryCsv,
    handleExportInventoryJson,
  } = useSettingsBackupExportActions({
    busy,
    loadSettingsInventoryRows,
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
  });

  const { handleImportDataFile, handleValidateBackupFile } = useSettingsBackupFileActions({
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
  });

  const settingsMaintenanceRouteProps = buildSettingsMaintenanceRouteProps({
    backupImportInputRef,
    backupValidateInputRef,
    backupValidationHasExtraTables,
    backupValidationHasMissingTables,
    backupValidationHasWarnings,
    applicationDiagnostics,
    applicationDiagnosticsError,
    applicationDiagnosticsStatus,
    busy,
    catalogCount,
    confirmResetAction,
    lastBackupValidation,
    lastCatalogReset,
    latestFullBackupExportedAt,
    locale,
    missingSwatchCount,
    printerCount,
    settingsClientHostWritePaired,
    settingsClientReadOnly,
    supportBundleError,
    supportBundleStatus,
    tauri,
    t,
    onExportFullBackup: handleExportFullBackup,
    onExportInventoryCsv: handleExportInventoryCsv,
    onExportInventoryJson: handleExportInventoryJson,
    onDownloadSanitizedSupportBundle: downloadSanitizedSupportBundle,
    onImportDataFile: handleImportDataFile,
    onCancelReset: clearConfirmResetAction,
    onOpenBackupValidate: handleOpenBackupValidate,
    onOpenDataImport: handleOpenDataImport,
    onResetAppData: handleResetAppData,
    onResetCatalogs: handleResetCatalogs,
    onRefreshApplicationDiagnostics: refreshApplicationDiagnostics,
    onValidateBackupFile: handleValidateBackupFile,
  });

  return {
    applicationDiagnosticsStatus,
    handleExportFullBackup,
    handleOpenBackupValidate,
    handleOpenDataImport,
    settingsMaintenanceRouteProps,
  };
}
