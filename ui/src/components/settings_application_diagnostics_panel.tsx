import {
  SettingsMetricTile,
  SettingsNotice,
  SettingsSectionBody,
  SettingsSectionControls,
  SettingsSectionHeader,
  SettingsSectionPanel,
} from "./settings_ui";
import { semanticChipClass } from "../lib/chip_styles";
import { settingsActionButtonClass } from "../lib/settings_ui_classes";
import type {
  ApplicationDiagnostics,
  DiagnosticCheckStatus,
} from "../lib/tauri_client";
import {
  applicationDiagnosticsHealth,
  applicationDiagnosticsTone,
  diagnosticCheckTone,
  formatDiagnosticBytes,
  type SettingsDiagnosticsRequestStatus,
} from "../pages/settings_application_diagnostics_model";
import type { Locale } from "../lib/i18n";

type TranslateFn = (key: string, fallback: string) => string;

function diagnosticCheckLabel(
  status: DiagnosticCheckStatus,
  t: TranslateFn,
): string {
  if (status === "ok") {
    return t("settings.diagnosticsCheckOk", "Passed");
  }
  if (status === "issues_found") {
    return t("settings.diagnosticsCheckIssues", "Issues found");
  }
  return t("settings.diagnosticsCheckUnavailable", "Unavailable");
}

function diagnosticsHealthLabel(
  diagnostics: ApplicationDiagnostics,
  t: TranslateFn,
): string {
  const health = applicationDiagnosticsHealth(diagnostics);
  if (health === "healthy") {
    return t("settings.diagnosticsHealthy", "Healthy");
  }
  if (health === "issues") {
    return t("settings.diagnosticsNeedsAttention", "Needs attention");
  }
  return t("settings.diagnosticsUnavailable", "Database unavailable");
}

export function SettingsApplicationDiagnosticsPanel({
  diagnostics,
  diagnosticsError,
  diagnosticsStatus,
  supportBundleError,
  supportBundleStatus,
  locale,
  tauri,
  t,
  onDownloadSanitizedSupportBundle,
  onRefreshApplicationDiagnostics,
}: {
  diagnostics: ApplicationDiagnostics | null;
  diagnosticsError: string | null;
  diagnosticsStatus: SettingsDiagnosticsRequestStatus;
  supportBundleError: string | null;
  supportBundleStatus: SettingsDiagnosticsRequestStatus;
  locale: Locale;
  tauri: boolean;
  t: TranslateFn;
  onDownloadSanitizedSupportBundle: () => void;
  onRefreshApplicationDiagnostics: () => void;
}) {
  const health = diagnostics ? applicationDiagnosticsHealth(diagnostics) : "unavailable";

  return (
    <SettingsSectionPanel id="settings-application-diagnostics-panel" className="mt-6">
      <SettingsSectionHeader
        eyebrow={t("settings.applicationDiagnosticsTitle", "Application diagnostics")}
        description={t(
          "settings.applicationDiagnosticsDescription",
          "Review local database health and download a sanitized support file without inventory content or credentials.",
        )}
        status={
          diagnostics ? (
            <span className={semanticChipClass(applicationDiagnosticsTone(health))}>
              {diagnosticsHealthLabel(diagnostics, t)}
            </span>
          ) : null
        }
      >
        {diagnosticsStatus === "loading" ? (
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400" role="status">
            {t("common.loading", "Loading...")}
          </div>
        ) : null}
        {diagnosticsError ? (
          <SettingsNotice className="mt-3" tone="danger">
            <div role="alert">
              {diagnosticsError}
              {diagnostics ? (
                <span className="ml-1">
                  {t(
                    "settings.diagnosticsLastGoodVisible",
                    "The last successful result remains visible.",
                  )}
                </span>
              ) : null}
            </div>
          </SettingsNotice>
        ) : null}
      </SettingsSectionHeader>

      <SettingsSectionBody className="space-y-4 p-5">
        {diagnostics ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <SettingsMetricTile
                label={t("settings.version", "Version")}
                value={diagnostics.app_version}
              />
              <SettingsMetricTile
                label={t("settings.diagnosticsSchema", "Schema current / supported")}
                value={`${diagnostics.database.schema_version ?? "—"} / ${diagnostics.database.supported_schema_version}`}
              />
              <SettingsMetricTile
                label={t("settings.diagnosticsDatabaseSize", "Database size")}
                value={formatDiagnosticBytes(diagnostics.database.size_bytes, locale)}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <SettingsSectionControls>
                <div className="section-eyebrow">
                  {t("settings.diagnosticsQuickCheck", "Quick check")}
                </div>
                <span
                  className={`mt-3 inline-flex ${semanticChipClass(diagnosticCheckTone(diagnostics.database.quick_check))}`}
                >
                  {diagnosticCheckLabel(diagnostics.database.quick_check, t)}
                </span>
              </SettingsSectionControls>
              <SettingsSectionControls>
                <div className="section-eyebrow">
                  {t("settings.diagnosticsForeignKeyCheck", "Foreign-key check")}
                </div>
                <span
                  className={`mt-3 inline-flex ${semanticChipClass(diagnosticCheckTone(diagnostics.database.foreign_key_check))}`}
                >
                  {diagnosticCheckLabel(diagnostics.database.foreign_key_check, t)}
                </span>
              </SettingsSectionControls>
              <SettingsSectionControls>
                <div className="section-eyebrow">
                  {t("settings.diagnosticsJournalMode", "Journal mode")}
                </div>
                <div className="mt-3 font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {diagnostics.database.journal_mode?.toUpperCase() ?? "—"}
                </div>
              </SettingsSectionControls>
            </div>

            <details className="group rounded-lg border border-slate-200 bg-white/75 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
                <span className="section-eyebrow">
                  {t("settings.diagnosticsLocalPath", "Local database path")}
                </span>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <span className="group-open:hidden">{t("common.show", "Show")}</span>
                  <span className="hidden group-open:inline">{t("common.hide", "Hide")}</span>
                </span>
              </summary>
              <div className="mt-3 break-all border-t border-slate-200 pt-3 font-mono text-xs leading-5 text-slate-700 dark:border-slate-700 dark:text-slate-300">
                {diagnostics.database.local_db_path}
              </div>
            </details>
          </>
        ) : diagnosticsStatus !== "loading" ? (
          <SettingsNotice tone="neutral">
            {t("settings.diagnosticsUnavailable", "Database unavailable")}
          </SettingsNotice>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className={settingsActionButtonClass()}
            onClick={onRefreshApplicationDiagnostics}
            disabled={!tauri || diagnosticsStatus === "loading"}
          >
            {diagnosticsStatus === "loading"
              ? t("common.loading", "Loading...")
              : t("common.refresh", "Refresh")}
          </button>
          <button
            type="button"
            className={settingsActionButtonClass("accent")}
            onClick={onDownloadSanitizedSupportBundle}
            disabled={!tauri || supportBundleStatus === "loading"}
          >
            {supportBundleStatus === "loading"
              ? t("common.loading", "Loading...")
              : t("settings.diagnosticsDownloadSupport", "Download sanitized support file")}
          </button>
        </div>

        {supportBundleStatus === "success" ? (
          <SettingsNotice tone="success">
            <div role="status">
              {t(
                "settings.diagnosticsSupportDownloaded",
                "Sanitized support file downloaded.",
              )}
            </div>
          </SettingsNotice>
        ) : null}
        {supportBundleError ? (
          <SettingsNotice tone="danger">
            <div role="alert">{supportBundleError}</div>
          </SettingsNotice>
        ) : null}
      </SettingsSectionBody>
    </SettingsSectionPanel>
  );
}
