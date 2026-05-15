import type { ChangeEvent, RefObject } from "react";
import { SettingsBackupValidationSummary } from "./settings_backup_validation_summary";
import { SettingsMetricTile } from "./settings_ui";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import type { BackupValidationStats, CatalogResetStats } from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;
type ResetConfirmAction = "APP" | "CATALOG";

type SettingsMaintenanceTabProps = {
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
  return (
    <section className="surface-card xl:col-span-2">
      <div className="section-eyebrow">
        {t("settings.maintenance", "Maintenance")}
      </div>
      <div className="surface-subtle mt-4 overflow-hidden p-0">
        <div className="border-b border-slate-200/80 px-5 py-5 dark:border-slate-700/80">
          <div className="max-w-3xl">
            <div className="section-eyebrow">
              {t("settings.backupTitle", "Backup")}
            </div>
            <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
              {t(
                "settings.backupDescription",
                "Export a full JSON backup with inventory, history and configured printers.",
              )}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SettingsMetricTile label={t("nav.printers", "Printers")} value={printerCount} />
            <SettingsMetricTile label={t("settings.totalCatalog", "Catalog")} value={catalogCount} />
            <SettingsMetricTile
              label={t("settings.missingSwatches", "Missing swatches")}
              value={missingSwatchCount}
            />
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[1.15fr_0.95fr]">
          <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
            <div className="section-eyebrow">
              {t("settings.backupExportGroup", "Backup and export")}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className={settingsActionButtonClass("accent")}
                onClick={onExportFullBackup}
                disabled={!tauri || busy}
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
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/75 p-4 shadow-sm shadow-slate-200/35 dark:border-slate-700 dark:bg-slate-900/50 dark:shadow-none">
            <div className="section-eyebrow">
              {t("settings.backupImportGroup", "Import and validation")}
            </div>
            <div className="mt-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400">
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
                disabled={!tauri || busy}
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
          </div>
        </div>
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
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
        <div className="section-eyebrow">
          {t("settings.resetSectionTitle", "Reset and cleanup")}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="min-h-[250px] rounded-xl border border-amber-300 bg-amber-50/90 p-4 shadow-sm shadow-amber-200/30 dark:border-amber-500/40 dark:bg-amber-500/10 dark:shadow-none">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-200">
              <span aria-hidden="true">!</span>
              {t("settings.resetCatalogs", "Reset catalogs")}
            </div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-amber-400 bg-amber-200 px-4 py-2 text-sm font-semibold text-amber-950 shadow-sm shadow-amber-200/30 disabled:opacity-50 dark:border-amber-400/50 dark:bg-amber-500/20 dark:text-amber-100 dark:shadow-none"
              onClick={onResetCatalogs}
              disabled={!tauri || busy}
            >
              {confirmResetAction === "CATALOG"
                ? t("settings.confirmResetCatalogsAction", "Confirm reset catalogs")
                : t("settings.resetCatalogs", "Reset catalogs")}
            </button>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-6 text-amber-900 dark:text-amber-100/90">
              <li>
                {t(
                  "settings.resetCatalogsList1",
                  "Keeps catalog entries linked to inventory rolls or wishlist items.",
                )}
              </li>
              <li>
                {t("settings.resetCatalogsList2", "Removes only unused catalog entries.")}
              </li>
              <li>
                {t(
                  "settings.resetCatalogsList3",
                  "Reactivates remaining discontinued catalog entries.",
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
              className="mt-3 w-full rounded-xl border border-rose-400 bg-rose-200 px-4 py-2 text-sm font-semibold text-rose-950 shadow-sm shadow-rose-200/30 disabled:opacity-50 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-100 dark:shadow-none"
              onClick={onResetAppData}
              disabled={!tauri || busy}
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
    </section>
  );
}
