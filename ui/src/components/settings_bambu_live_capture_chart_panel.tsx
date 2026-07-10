import { useId } from "react";
import { DiagnosticCaptureChart } from "./diagnostic_capture_chart";
import { useI18n } from "../lib/i18n";
import {
  settingsCompactSelectClass,
  settingsSectionLabelClass,
  settingsTinyLabelClass,
} from "../lib/settings_ui_classes";
import type { DiagnosticChartFieldOption } from "../lib/diagnostic_capture";

type DiagnosticCaptureChartPoint = {
  observedAt: string;
  value: number;
  valueText: string;
};

type SettingsBambuLiveCaptureChartPanelProps = {
  chartFields: DiagnosticChartFieldOption[];
  chartPoints: DiagnosticCaptureChartPoint[];
  onSelectedFieldChange: (fieldPath: string) => void;
  selectedFieldPath: string | null;
};

export function SettingsBambuLiveCaptureChartPanel({
  chartFields,
  chartPoints,
  onSelectedFieldChange,
  selectedFieldPath,
}: SettingsBambuLiveCaptureChartPanelProps) {
  const { t } = useI18n();
  const componentId = useId().replaceAll(":", "");
  const chartFieldSelectId = `bambu-live-chart-field-${componentId}`;

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className={settingsSectionLabelClass}>
            {t("settings.bambuLiveChartTitle", "Capture chart")}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t(
              "settings.bambuLiveChartHint",
              "Choose a numeric field to plot only the values captured in this session.",
            )}
          </div>
        </div>
        {chartFields.length > 0 ? (
          <div className="w-full sm:w-auto">
            <label htmlFor={chartFieldSelectId} className={`mb-1 block ${settingsTinyLabelClass}`}>
              {t("settings.bambuLiveChartFieldLabel", "Chart field")}
            </label>
            <select
              id={chartFieldSelectId}
              value={selectedFieldPath ?? ""}
              onChange={(event) => onSelectedFieldChange(event.target.value)}
              className={`w-full min-w-0 sm:min-w-[260px] ${settingsCompactSelectClass}`}
            >
              {chartFields.map((field) => (
                <option key={field.path} value={field.path}>
                  {field.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        {chartFields.length === 0 ? (
          <div className="surface-subtle border-dashed px-3 py-2 text-[11px] text-slate-600 dark:text-slate-300">
            {t("settings.bambuLiveChartNoFields", "No chart-ready numeric fields yet")}
          </div>
        ) : selectedFieldPath ? (
          <DiagnosticCaptureChart fieldPath={selectedFieldPath} points={chartPoints} />
        ) : null}
      </div>
    </div>
  );
}
