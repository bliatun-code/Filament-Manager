import { useId } from "react";
import {
  exportDiagnosticCaptureSessionCsv,
  formatIntervalMs,
  type DiagnosticCaptureSession,
  type DiagnosticFilterKey,
  type DiagnosticSortKey,
} from "../lib/diagnostic_capture";
import { downloadTextFile } from "../lib/download_file";
import { useI18n } from "../lib/i18n";
import {
  settingsActionButtonClass,
  settingsCompactSelectClass,
  settingsSectionLabelClass,
  settingsTinyLabelClass,
} from "../lib/settings_ui_classes";
import { formatSettingsDateTime } from "../lib/settings_utils";
import type { SettingsBambuLiveDiagnosticGroup } from "../pages/settings_bambu_live_diagnostics_model";

type SettingsBambuLiveCapturedFieldsPanelProps = {
  diagnosticFilter: DiagnosticFilterKey;
  diagnosticGroups: SettingsBambuLiveDiagnosticGroup[];
  diagnosticSession: DiagnosticCaptureSession | null;
  diagnosticSort: DiagnosticSortKey;
  downloadName: string;
  onDiagnosticFilterChange: (filter: DiagnosticFilterKey) => void;
  onDiagnosticSortChange: (sort: DiagnosticSortKey) => void;
  sortedFieldCount: number;
};

export function SettingsBambuLiveCapturedFieldsPanel({
  diagnosticFilter,
  diagnosticGroups,
  diagnosticSession,
  diagnosticSort,
  downloadName,
  onDiagnosticFilterChange,
  onDiagnosticSortChange,
  sortedFieldCount,
}: SettingsBambuLiveCapturedFieldsPanelProps) {
  const { locale, t } = useI18n();
  const componentId = useId().replaceAll(":", "");
  const diagnosticSortId = `bambu-live-captured-fields-sort-${componentId}`;
  const diagnosticFilterId = `bambu-live-captured-fields-filter-${componentId}`;
  const fieldResultLabel = t(
    "settings.bambuLiveFieldResultCount",
    "{count, plural, one {# field} other {# fields}}",
    { count: sortedFieldCount },
  );

  function handleExportCsv() {
    if (!diagnosticSession) {
      return;
    }
    const csv = exportDiagnosticCaptureSessionCsv(diagnosticSession);
    downloadTextFile(csv, downloadName, "text/csv;charset=utf-8");
  }

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div
          className="scroll-mt-28 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
          data-desktop-visual-qa-target="bambu-live-captured-fields"
        >
          {t("settings.bambuLiveCapturedTable", "Captured live fields")}
        </div>
        <span
          className="count-pill tabular-nums"
          role="status"
          aria-atomic="true"
          aria-live="polite"
        >
          {fieldResultLabel}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={diagnosticSortId} className={`mb-1 block ${settingsTinyLabelClass}`}>
              {t("settings.bambuLiveSortLabel", "Sort captured fields")}
            </label>
            <select
              id={diagnosticSortId}
              value={diagnosticSort}
              onChange={(event) => onDiagnosticSortChange(event.target.value as DiagnosticSortKey)}
              className={settingsCompactSelectClass}
            >
              <option value="path">{t("settings.bambuLiveSortPath", "Sort: Field")}</option>
              <option value="last_seen_desc">
                {t("settings.bambuLiveSortLastSeen", "Sort: Most recently seen")}
              </option>
              <option value="avg_seen_interval">
                {t("settings.bambuLiveSortSeenInterval", "Sort: Fastest seen")}
              </option>
              <option value="change_count">
                {t("settings.bambuLiveSortChangeCount", "Sort: Most changed")}
              </option>
              <option value="avg_change_interval">
                {t("settings.bambuLiveSortChangeInterval", "Sort: Fastest changed")}
              </option>
            </select>
          </div>
          <div>
            <label htmlFor={diagnosticFilterId} className={`mb-1 block ${settingsTinyLabelClass}`}>
              {t("settings.bambuLiveFilterLabel", "Filter captured fields")}
            </label>
            <select
              id={diagnosticFilterId}
              value={diagnosticFilter}
              onChange={(event) => onDiagnosticFilterChange(event.target.value as DiagnosticFilterKey)}
              className={settingsCompactSelectClass}
            >
              <option value="all">{t("settings.bambuLiveFilterAll", "Filter: All")}</option>
              <option value="changed">
                {t("settings.bambuLiveFilterChanged", "Filter: Changed fields")}
              </option>
              <option value="recent">
                {t("settings.bambuLiveFilterRecent", "Filter: Seen in last minute")}
              </option>
              <option value="high_frequency">
                {t("settings.bambuLiveFilterFrequent", "Filter: High frequency")}
              </option>
            </select>
          </div>
        </div>
        <button
          type="button"
          className={settingsActionButtonClass("neutral", "compact")}
          onClick={handleExportCsv}
          disabled={!diagnosticSession || diagnosticSession.fields.length === 0}
        >
          {t("settings.bambuLiveExportCsv", "Export CSV")}
        </button>
      </div>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <div
          className="max-h-80 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-300 dark:focus-visible:ring-sky-400/60"
          role="region"
          aria-label={t("settings.bambuLiveCapturedTable", "Captured live fields")}
          tabIndex={0}
        >
          {sortedFieldCount > 0 ? (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {diagnosticGroups.map((group) => (
                <div key={group.key}>
                  <div className={`bg-slate-50 px-3 py-2 dark:bg-slate-900/80 ${settingsSectionLabelClass}`}>
                    {group.label}
                  </div>
                  <table className="w-full min-w-[960px] divide-y divide-slate-200 text-left text-[11px] dark:divide-slate-700">
                    <caption className="sr-only">
                      {t("settings.bambuLiveCapturedGroupCaption", "Captured live fields")}: {group.label}
                    </caption>
                    <thead className="bg-slate-50/80 dark:bg-slate-900/40">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldPath", "Field")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldValue", "Value")}
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldUpdated", "Last seen")}
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldCadence", "Avg seen interval")}
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldChanges", "Changes")}
                        </th>
                        <th scope="col" className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldChangeCadence", "Avg change interval")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                          {t("settings.bambuLiveFieldRecentValues", "Recent values")}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-950/40">
                      {group.fields.map((field) => (
                        <tr key={`${group.key}-${field.path}`}>
                          <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-200">
                            {field.path}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 dark:text-slate-300">
                            {field.valueText}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                            {formatSettingsDateTime(field.lastSeenAt, locale)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                            {formatIntervalMs(field.avgReceiveIntervalMs)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                            {field.changeCount}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-slate-500 dark:text-slate-400">
                            {formatIntervalMs(field.avgChangeIntervalMs)}
                          </td>
                          <td className="px-3 py-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                            <div className="flex min-w-[220px] flex-wrap gap-1">
                              {field.recentValues.length > 0 ? (
                                field.recentValues.map((sample, index) => (
                                  <span
                                    key={`${field.path}-sample-${index}`}
                                    className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 ${
                                      sample.changed
                                        ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200"
                                        : "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
                                    }`}
                                    title={formatSettingsDateTime(sample.seenAt, locale)}
                                  >
                                    <span className="font-mono">{sample.valueText}</span>
                                    <span aria-hidden="true">{sample.changed ? "•" : "·"}</span>
                                  </span>
                                ))
                              ) : (
                                <span>—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white px-3 py-3 text-[11px] text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
              {t(
                "settings.bambuLiveCaptureWaiting",
                "Waiting for live field updates. Start a print or let the printer report more data while this panel is open.",
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
