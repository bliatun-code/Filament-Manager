import type { SettingsMaintenanceRouteProps } from "./settings_maintenance_route";
type SettingsMaintenanceTabProps = SettingsMaintenanceRouteProps["tab"];

type AsyncMaintenanceActionKeys =
  | "onDownloadSanitizedSupportBundle"
  | "onExportFullBackup"
  | "onExportInventoryCsv"
  | "onExportInventoryJson"
  | "onImportDataFile"
  | "onResetAppData"
  | "onResetCatalogs"
  | "onRefreshApplicationDiagnostics"
  | "onValidateBackupFile";

type BuildSettingsMaintenanceRoutePropsInput = Omit<
  SettingsMaintenanceTabProps,
  AsyncMaintenanceActionKeys
> & {
  onDownloadSanitizedSupportBundle: () => Promise<void> | void;
  onExportFullBackup: () => Promise<void> | void;
  onExportInventoryCsv: () => Promise<void> | void;
  onExportInventoryJson: () => Promise<void> | void;
  onImportDataFile: (
    ...args: Parameters<SettingsMaintenanceTabProps["onImportDataFile"]>
  ) => Promise<void> | void;
  onResetAppData: () => Promise<void> | void;
  onResetCatalogs: () => Promise<void> | void;
  onRefreshApplicationDiagnostics: () => Promise<void> | void;
  onValidateBackupFile: (
    ...args: Parameters<SettingsMaintenanceTabProps["onValidateBackupFile"]>
  ) => Promise<void> | void;
};

export function buildSettingsMaintenanceRouteProps({
  onDownloadSanitizedSupportBundle,
  onExportFullBackup,
  onExportInventoryCsv,
  onExportInventoryJson,
  onImportDataFile,
  onResetAppData,
  onResetCatalogs,
  onRefreshApplicationDiagnostics,
  onValidateBackupFile,
  ...tab
}: BuildSettingsMaintenanceRoutePropsInput): SettingsMaintenanceRouteProps {
  return {
    tab: {
      ...tab,
      onDownloadSanitizedSupportBundle: () => void onDownloadSanitizedSupportBundle(),
      onExportFullBackup: () => void onExportFullBackup(),
      onExportInventoryCsv: () => void onExportInventoryCsv(),
      onExportInventoryJson: () => void onExportInventoryJson(),
      onImportDataFile: (...args) => void onImportDataFile(...args),
      onResetAppData: () => void onResetAppData(),
      onResetCatalogs: () => void onResetCatalogs(),
      onRefreshApplicationDiagnostics: () => void onRefreshApplicationDiagnostics(),
      onValidateBackupFile: (...args) => void onValidateBackupFile(...args),
    },
  };
}
