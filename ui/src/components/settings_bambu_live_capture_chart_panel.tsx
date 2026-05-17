import { DiagnosticCaptureChart } from "./diagnostic_capture_chart";
import { useI18n } from "../lib/i18n";
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

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            {t("settings.bambuLiveChartTitle", "Capture chart")}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            {t(
              "settings.bambuLiveChartHint",
              "Choose a numeric field to plot only the values captured in this session.",
            )}
          </div>
        </div>
        <select
          value={selectedFieldPath ?? ""}
          onChange={(event) => onSelectedFieldChange(event.target.value)}
          disabled={chartFields.length === 0}
          className="min-w-[260px] rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        >
          {chartFields.length === 0 ? (
            <option value="">
              {t("settings.bambuLiveChartNoFields", "No chart-ready numeric fields yet")}
            </option>
          ) : null}
          {chartFields.map((field) => (
            <option key={field.path} value={field.path}>
              {field.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3">
        {selectedFieldPath ? (
          <DiagnosticCaptureChart fieldPath={selectedFieldPath} points={chartPoints} />
        ) : (
          <div className="surface-subtle border-dashed px-3 py-3 text-[11px] text-slate-600 dark:text-slate-300">
            {t("settings.bambuLiveChartNoFields", "No chart-ready numeric fields yet")}
          </div>
        )}
      </div>
    </div>
  );
}
