import type { ChangeEvent, RefObject } from "react";
import { SettingsBackupValidationSummary } from "./settings_backup_validation_summary";
import { SettingsApplicationDiagnosticsPanel } from "./settings_application_diagnostics_panel";
import {
  SettingsMetricTile,
  SettingsNotice,
  SettingsSectionBody,
  SettingsSectionControls,
  SettingsSectionHeader,
  SettingsSectionPanel,
  SettingsSurfaceCard,
} from "./settings_ui";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import type {
  ApplicationDiagnostics,
  BackupValidationStats,
  CatalogResetStats,
} from "../lib/tauri_client";
import type { SettingsDiagnosticsRequestStatus } from "../pages/settings_application_diagnostics_model";
import type { Locale } from "../lib/i18n";
import { formatDisplayInteger } from "../lib/number_display";
import { formatSettingsDateTime } from "../lib/settings_utils";

type TranslateFn = (key: string, fallback: string) => string;
type ResetConfirmAction = "APP" | "CATALOG";

function SettingsResetConfirmation({
  cancelLabel,
  confirmDisabled,
  confirmLabel,
  message,
  onCancel,
  onConfirm,
  tone,
}: {
  cancelLabel: string;
  confirmDisabled: boolean;
  confirmLabel: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
  tone: "danger" | "warning";
}) {
  const confirmVariant = tone === "danger" ? "danger" : "warning";
  const cancelVariant = tone === "danger" ? "dangerQuiet" : "warningQuiet";

  return (
    <SettingsNotice className="mt-3" tone={tone}>
      <div role="alert">
        <div className="whitespace-pre-line leading-5">{message}</div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={`w-full sm:w-auto ${settingsActionButtonClass(confirmVariant, "comfortable")}`}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
          <button
            type="button"
            className={`w-full sm:w-auto ${settingsActionButtonClass(cancelVariant, "comfortable")}`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </SettingsNotice>
  );
}

export type SettingsMaintenanceTabProps = {
  applicationDiagnostics: ApplicationDiagnostics | null;
  applicationDiagnosticsError: string | null;
  applicationDiagnosticsStatus: SettingsDiagnosticsRequestStatus;
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
  latestFullBackupExportedAt: string | null;
  locale: Locale;
  missingSwatchCount: number;
  printerCount: number;
  settingsClientHostWritePaired: boolean;
  settingsClientReadOnly: boolean;
  supportBundleError: string | null;
  supportBundleStatus: SettingsDiagnosticsRequestStatus;
  tauri: boolean;
  t: TranslateFn;
  onExportFullBackup: () => void;
  onDownloadSanitizedSupportBundle: () => void;
  onExportInventoryCsv: () => void;
  onExportInventoryJson: () => void;
  onImportDataFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onCancelReset: () => void;
  onOpenBackupValidate: () => void;
  onOpenDataImport: () => void;
  onResetAppData: () => void;
  onResetCatalogs: () => void;
  onRefreshApplicationDiagnostics: () => void;
  onValidateBackupFile: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function SettingsMaintenanceTab({
  applicationDiagnostics,
  applicationDiagnosticsError,
  applicationDiagnosticsStatus,
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
  onExportFullBackup,
  onDownloadSanitizedSupportBundle,
  onExportInventoryCsv,
  onExportInventoryJson,
  onImportDataFile,
  onCancelReset,
  onOpenBackupValidate,
  onOpenDataImport,
  onResetAppData,
  onResetCatalogs,
  onRefreshApplicationDiagnostics,
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
          status={
            <div className="max-w-sm rounded-lg border border-slate-300/70 bg-white/60 px-3 py-2 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-950/30 dark:text-slate-300">
              <div className="font-semibold text-slate-800 dark:text-slate-100">
                {latestFullBackupExportedAt
                  ? t(
                      "settings.latestFullBackupExportOnDevice",
                      "Latest full-backup export on this device",
                    )
                  : t(
                      "settings.noFullBackupExportRecordedOnDevice",
                      "No full-backup export recorded on this device yet",
                    )}
              </div>
              {latestFullBackupExportedAt ? (
                <div className="mt-0.5 tabular-nums">
                  {formatSettingsDateTime(latestFullBackupExportedAt, locale)}
                </div>
              ) : null}
            </div>
          }
        >
          {settingsClientReadOnly ? (
            <SettingsNotice className="mt-3" tone="info">
              {t(
                "settings.clientHostOnlyMaintenance",
                "This device is a client. Full backup is exported from the paired host. Import, reset and repair actions must still be run on the host so library data stays in one place.",
              )}
            </SettingsNotice>
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
            {!lastBackupValidation ? (
              <div className="surface-subtle mt-2 border-dashed px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                {t(
                  "settings.noBackupValidationYet",
                  "Validate a backup file here to see compatibility details before importing.",
                )}
              </div>
            ) : null}
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
                locale={locale}
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

      {tauri ? (
        <SettingsApplicationDiagnosticsPanel
          diagnostics={applicationDiagnostics}
          diagnosticsError={applicationDiagnosticsError}
          diagnosticsStatus={applicationDiagnosticsStatus}
          locale={locale}
          supportBundleError={supportBundleError}
          supportBundleStatus={supportBundleStatus}
          tauri={tauri}
          t={t}
          onDownloadSanitizedSupportBundle={onDownloadSanitizedSupportBundle}
          onRefreshApplicationDiagnostics={onRefreshApplicationDiagnostics}
        />
      ) : null}

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
            {confirmResetAction === "CATALOG" ? (
              <SettingsResetConfirmation
                cancelLabel={t("common.cancel", "Cancel")}
                confirmDisabled={hostOnlyActionDisabled}
                confirmLabel={t(
                  "settings.confirmResetCatalogsAction",
                  "Confirm catalog repair",
                )}
                message={t(
                  "settings.confirmResetCatalogs",
                  "Repair the catalog?\n\nThe bundled seed catalog is restored. Only unused non-seeded catalog entries are removed; inventory and wishlist references are preserved.",
                )}
                onCancel={onCancelReset}
                onConfirm={onResetCatalogs}
                tone="warning"
              />
            ) : (
              <button
                type="button"
                className={`mt-3 w-full ${settingsActionButtonClass("warning", "comfortable")}`}
                onClick={onResetCatalogs}
                disabled={hostOnlyActionDisabled}
              >
                {t("settings.resetCatalogs", "Repair catalog")}
              </button>
            )}
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
            {confirmResetAction === "APP" ? (
              <SettingsResetConfirmation
                cancelLabel={t("common.cancel", "Cancel")}
                confirmDisabled={hostOnlyActionDisabled}
                confirmLabel={t(
                  "settings.confirmResetAppAction",
                  "Confirm reset app data",
                )}
                message={t(
                  "settings.confirmResetApp",
                  "Reset app data?\n\nThis clears inventory, printer mappings, print history, wishlist, and trusted-LAN paired browsers. Catalog entries are kept.",
                )}
                onCancel={onCancelReset}
                onConfirm={onResetAppData}
                tone="danger"
              />
            ) : (
              <button
                type="button"
                className={`mt-3 w-full ${settingsActionButtonClass("danger", "comfortable")}`}
                onClick={onResetAppData}
                disabled={hostOnlyActionDisabled}
              >
                {t("settings.resetApp", "Reset app data")}
              </button>
            )}
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
        <SettingsNotice className="mt-4" tone="neutral">
          {t("settings.removed", "Removed")}:{" "}
          {formatDisplayInteger(lastCatalogReset.removed_count, locale)} /{" "}
          {t("settings.remaining", "Remaining")}:{" "}
          {formatDisplayInteger(lastCatalogReset.remaining_count, locale)} /{" "}
          {t("settings.reactivated", "Reactivated")}:{" "}
          {formatDisplayInteger(lastCatalogReset.reactivated_count, locale)}
        </SettingsNotice>
      ) : null}
    </SettingsSurfaceCard>
  );
}
