import type { SettingsMaintenanceRouteProps } from "./settings_maintenance_route";
type SettingsMaintenanceTabProps = SettingsMaintenanceRouteProps["tab"];

type AsyncMaintenanceActionKeys =
  | "onExportFullBackup"
  | "onExportInventoryCsv"
  | "onExportInventoryJson"
  | "onImportDataFile"
  | "onResetAppData"
  | "onResetCatalogs"
  | "onValidateBackupFile";

type BuildSettingsMaintenanceRoutePropsInput = Omit<
  SettingsMaintenanceTabProps,
  AsyncMaintenanceActionKeys
> & {
  onExportFullBackup: () => Promise<void> | void;
  onExportInventoryCsv: () => Promise<void> | void;
  onExportInventoryJson: () => Promise<void> | void;
  onImportDataFile: (
    ...args: Parameters<SettingsMaintenanceTabProps["onImportDataFile"]>
  ) => Promise<void> | void;
  onResetAppData: () => Promise<void> | void;
  onResetCatalogs: () => Promise<void> | void;
  onValidateBackupFile: (
    ...args: Parameters<SettingsMaintenanceTabProps["onValidateBackupFile"]>
  ) => Promise<void> | void;
};

export function buildSettingsMaintenanceRouteProps({
  onExportFullBackup,
  onExportInventoryCsv,
  onExportInventoryJson,
  onImportDataFile,
  onResetAppData,
  onResetCatalogs,
  onValidateBackupFile,
  ...tab
}: BuildSettingsMaintenanceRoutePropsInput): SettingsMaintenanceRouteProps {
  return {
    tab: {
      ...tab,
      onExportFullBackup: () => void onExportFullBackup(),
      onExportInventoryCsv: () => void onExportInventoryCsv(),
      onExportInventoryJson: () => void onExportInventoryJson(),
      onImportDataFile: (...args) => void onImportDataFile(...args),
      onResetAppData: () => void onResetAppData(),
      onResetCatalogs: () => void onResetCatalogs(),
      onValidateBackupFile: (...args) => void onValidateBackupFile(...args),
    },
  };
}
