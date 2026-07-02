import type { ChangeEvent, RefObject } from "react";
import { SettingsBackupValidationSummary } from "./settings_backup_validation_summary";
import {
  SettingsMetricTile,
  SettingsSectionBody,
  SettingsSectionControls,
  SettingsSectionHeader,
  SettingsSectionPanel,
  SettingsSurfaceCard,
} from "./settings_ui";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import type { BackupValidationStats, CatalogResetStats } from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;
type ResetConfirmAction = "APP" | "CATALOG";

export type SettingsMaintenanceTabProps = {
  backupImportInputRef: RefObject<HTMLInputElement | null>;
  backupValidateInputRef: RefObject<HTMLInputElement | null>;
  backupValidationHasExtraTables: boolean;
  backupValidationHasMissingTables: boolean;
  backupValidationHasWarnings: boolean;
  busy: boolean;
  catalogCount: number;
  confirmResetAction: ResetConfirmAction | null;
  lastBackupValidation: BackupValidationStats | null;
  lastCatalogReset: CatalogResetStats | null;
  missingSwatchCount: number;
  printerCount: number;
  settingsClientHostWritePaired: boolean;
  settingsClientReadOnly: boolean;
  tauri: boolean;
  t: TranslateFn;
  onExportFullBackup: () => void;
  onExportInventoryCsv: () => void;
  onExportInventoryJson: () => void;
  onImportDataFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenBackupValidate: () => void;
  onOpenDataImport: () => void;
  onResetAppData: () => void;
  onResetCatalogs: () => void;
  onValidateBackupFile: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function SettingsMaintenanceTab({
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
  settingsClientHostWritePaired,
  settingsClientReadOnly,
  tauri,
  t,
  onExportFullBackup,
  onExportInventoryCsv,
  onExportInventoryJson,
  onImportDataFile,
  onOpenBackupValidate,
  onOpenDataImport,
  onResetAppData,
  onResetCatalogs,
  onValidateBackupFile,
}: SettingsMaintenanceTabProps) {
  const hostOnlyActionDisabled = !tauri || busy || settingsClientReadOnly;
  const fullBackupActionDisabled =
    !tauri || busy || (settingsClientReadOnly && !settingsClientHostWritePaired);

  return (
    <SettingsSurfaceCard
      className="xl:col-span-2"
      eyebrow={t("settings.maintenance", "Maintenance")}
    >
      <SettingsSectionPanel className="mt-4">
        <SettingsSectionHeader
          eyebrow={t("settings.backupTitle", "Backup")}
          description={t(
            "settings.backupDescription",
            "Export a full JSON backup with inventory, history and configured printers.",
          )}
          descriptionClassName="text-slate-700 dark:text-slate-300"
          metrics={
            <>
              <SettingsMetricTile label={t("nav.printers", "Printers")} value={printerCount} />
              <SettingsMetricTile label={t("settings.totalCatalog", "Catalog")} value={catalogCount} />
              <SettingsMetricTile
                label={t("settings.missingSwatches", "Missing swatches")}
                value={missingSwatchCount}
              />
            </>
          }
        >
          {settingsClientReadOnly ? (
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-medium text-sky-900 dark:text-sky-100">
              {t(
                "settings.clientHostOnlyMaintenance",
                "This device is a client. Full backup is exported from the paired host. Import, reset and repair actions must still be run on the host so library data stays in one place.",
              )}
            </div>
          ) : null}
        </SettingsSectionHeader>

        <SettingsSectionBody className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.95fr]">
          <SettingsSectionControls>
            <div className="section-eyebrow">
              {t("settings.backupExportGroup", "Backup and export")}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={settingsActionButtonClass("accent")}
                onClick={onExportFullBackup}
                disabled={fullBackupActionDisabled}
              >
                {t("settings.exportFullBackup", "Export full backup (JSON)")}
              </button>
              <button
                type="button"
                className={settingsActionButtonClass()}
                onClick={onExportInventoryCsv}
                disabled={!tauri || busy}
              >
                {t("settings.exportInventoryCsv", "Export inventory CSV")}
              </button>
              <button
                type="button"
                className={settingsActionButtonClass()}
                onClick={onExportInventoryJson}
                disabled={!tauri || busy}
              >
                {t("settings.exportInventoryJson", "Export inventory JSON")}
              </button>
            </div>
          </SettingsSectionControls>

          <SettingsSectionControls>
            <div className="section-eyebrow">
              {t("settings.backupImportGroup", "Import and validation")}
            </div>
            <div className="surface-subtle mt-2 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
              {t(
                "settings.noBackupValidationYet",
                "Validate a backup file here to see compatibility details before importing.",
              )}
            </div>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                className={`${settingsActionButtonClass()} w-full`}
                onClick={onOpenDataImport}
                disabled={hostOnlyActionDisabled}
              >
                {t("settings.importDataFile", "Import backup/data file")}
              </button>
              <button
                type="button"
                className={`${settingsActionButtonClass()} w-full`}
                onClick={onOpenBackupValidate}
                disabled={!tauri || busy}
              >
                {t("settings.validateBackup", "Validate backup file")}
              </button>
            </div>

            {lastBackupValidation ? (
              <SettingsBackupValidationSummary
                hasExtraTables={backupValidationHasExtraTables}
                hasMissingTables={backupValidationHasMissingTables}
                hasWarnings={backupValidationHasWarnings}
                summary={lastBackupValidation}
                t={t}
              />
            ) : null}
          </SettingsSectionControls>
        </SettingsSectionBody>
        <input
          ref={backupImportInputRef}
          type="file"
          accept="application/json,.json,text/csv,.csv"
          className="hidden"
          onChange={onImportDataFile}
        />
        <input
          ref={backupValidateInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={onValidateBackupFile}
        />
      </SettingsSectionPanel>

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
        <div className="section-eyebrow">
          {t("settings.resetSectionTitle", "Reset and cleanup")}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-h-[250px] rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm shadow-amber-200/30 dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-none">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-200">
              <span aria-hidden="true">!</span>
              {t("settings.resetCatalogs", "Repair catalog")}
            </div>
            <button
              type="button"
              className={`mt-3 w-full ${settingsActionButtonClass("warning", "comfortable")}`}
              onClick={onResetCatalogs}
              disabled={hostOnlyActionDisabled}
            >
              {confirmResetAction === "CATALOG"
                ? t("settings.confirmResetCatalogsAction", "Confirm catalog repair")
                : t("settings.resetCatalogs", "Repair catalog")}
            </button>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-amber-900 dark:text-amber-100/90">
              <li>
                {t(
                  "settings.resetCatalogsList1",
                  "Keeps the bundled seed catalog and entries linked to inventory or wishlist.",
                )}
              </li>
              <li>
                {t("settings.resetCatalogsList2", "Removes only unused non-seeded catalog entries.")}
              </li>
              <li>
                {t(
                  "settings.resetCatalogsList3",
                  "Reimports missing seed entries and repairs catalog metadata.",
                )}
              </li>
            </ul>
          </div>

          <div className="min-h-[250px] rounded-xl border border-rose-300 bg-rose-50/90 p-4 shadow-sm shadow-rose-200/30 dark:border-rose-500/40 dark:bg-rose-500/10 dark:shadow-none">
            <div className="flex items-center gap-2 text-sm font-semibold text-rose-950 dark:text-rose-200">
              <span aria-hidden="true">!</span>
              {t("settings.resetApp", "Reset app data")}
            </div>
            <button
              type="button"
              className={`mt-3 w-full ${settingsActionButtonClass("danger", "comfortable")}`}
              onClick={onResetAppData}
              disabled={hostOnlyActionDisabled}
            >
              {confirmResetAction === "APP"
                ? t("settings.confirmResetAppAction", "Confirm reset app data")
                : t("settings.resetApp", "Reset app data")}
            </button>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-rose-900 dark:text-rose-100/90">
              <li>
                {t("settings.resetAppList1", "Clears inventory rolls and roll lifecycle history.")}
              </li>
              <li>
                {t("settings.resetAppList2", "Clears printer mappings, print statistics and wishlist.")}
              </li>
              <li>
                {t("settings.resetAppList3", "Keeps master catalog entries and swatch data.")}
              </li>
            </ul>
          </div>
        </div>
      </div>
      {lastCatalogReset ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
          {t("settings.removed", "Removed")}: {lastCatalogReset.removed_count} /{" "}
          {t("settings.remaining", "Remaining")}: {lastCatalogReset.remaining_count} /{" "}
          {t("settings.reactivated", "Reactivated")}: {lastCatalogReset.reactivated_count}
        </div>
      ) : null}
    </SettingsSurfaceCard>
  );
}
