import { useMemo } from "react";
import { swatchCssBackground } from "../lib/color_utils";
import {
  formatDisplayInteger,
  formatDisplayPercent,
  type NumberDisplayLocale,
} from "../lib/number_display";
import { gramsToKgText, type MetricModalKind, type TranslateFn } from "../lib/statistics_model";
import type { StatisticsPeriodReport } from "../lib/tauri_client";
import { formatGrams } from "../lib/weight_display";
import { buildStatisticsMaterialBreakdown } from "./statistics_analysis_model";
import { statisticsFilterButtonClass } from "./statistics_view_helpers";

function CompactMetric({
  annotation,
  disabled,
  label,
  onClick,
  value,
}: {
  annotation?: string;
  disabled: boolean;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      disabled={disabled}
      onClick={onClick}
      className="app-control-focus flex w-full items-center justify-between gap-4 rounded-lg px-3 py-3 text-left outline-none transition enabled:hover:bg-slate-100 dark:enabled:hover:bg-slate-800/60 disabled:cursor-default"
    >
      <span className="block min-w-0">
        <span className="block text-sm text-slate-600 dark:text-slate-300">{label}</span>
        {annotation ? (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{annotation}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="text-lg font-semibold tabular-nums text-slate-950 dark:text-slate-50">{value}</span>
        {!disabled ? <span aria-hidden="true" className="text-slate-400">→</span> : null}
      </span>
    </button>
  );
}

export function StatisticsConsumptionPanel({
  activeSlots,
  loading,
  locale,
  onOpenConsumption,
  onOpenMetric,
  periodLabel,
  report,
  t,
  tauri,
  unavailableMessage,
}: {
  activeSlots: number;
  loading: boolean;
  locale: NumberDisplayLocale;
  onOpenConsumption: () => void;
  onOpenMetric: (kind: MetricModalKind) => void;
  periodLabel: string;
  report: StatisticsPeriodReport | null;
  t: TranslateFn;
  tauri: boolean;
  unavailableMessage: string;
}) {
  const materials = useMemo(
    () => buildStatisticsMaterialBreakdown(report?.filament_consumption ?? []),
    [report],
  );
  const maxMaterialGrams = materials[0]?.usedGrams ?? 0;
  const periodAvailable = report != null && !loading;
  return (
    <section className="content-section surface-card" aria-labelledby="statistics-recorded-use-title" aria-busy={loading}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)] lg:gap-8">
        <div className="min-w-0">
          <h2 id="statistics-recorded-use-title" className="section-eyebrow">
            {t("statistics.recordedMaterialConsumption", "Recorded material use")}
          </h2>
          <div className="mt-3 text-4xl font-semibold tracking-tight text-slate-950 tabular-nums dark:text-slate-50 sm:text-5xl">
            {periodAvailable ? gramsToKgText(report.total_used_g, locale) : "—"}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{periodLabel}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("statistics.linkedActivity", "Printer-linked activity")}
          </p>
          <button
            type="button"
            aria-haspopup="dialog"
            disabled={!periodAvailable || !tauri}
            className={`${statisticsFilterButtonClass} mt-5 disabled:opacity-50`}
            onClick={onOpenConsumption}
          >
            {t("statistics.consumptionByFilament", "Consumption by filament")}
            <span aria-hidden="true" className="ml-2">→</span>
          </button>
        </div>
        <div className="divide-y divide-slate-200/80 border-t border-slate-200/80 pt-2 dark:divide-slate-700 dark:border-slate-700 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
          <CompactMetric
            disabled={!periodAvailable || !tauri}
            label={t("statistics.loggedJobs", "Logged Jobs")}
            onClick={() => onOpenMetric("LOGGED_JOBS")}
            value={periodAvailable ? formatDisplayInteger(report.total_jobs, locale) : "—"}
          />
          <CompactMetric
            annotation={periodAvailable ? formatDisplayPercent(report.total_jobs > 0 ? (report.failed_jobs / report.total_jobs) * 100 : 0, locale) : undefined}
            disabled={!periodAvailable || !tauri}
            label={t("statistics.failedJobs", "Failed Jobs")}
            onClick={() => onOpenMetric("FAILED_JOBS")}
            value={periodAvailable ? formatDisplayInteger(report.failed_jobs, locale) : "—"}
          />
          <CompactMetric
            annotation={t("statistics.currentSnapshot", "Current snapshot")}
            disabled={loading || !tauri}
            label={t("statistics.activeAms", "Active loaded slots")}
            onClick={() => onOpenMetric("ACTIVE_SLOTS")}
            value={loading || !tauri ? "—" : formatDisplayInteger(activeSlots, locale)}
          />
        </div>
      </div>
      <div className="mt-6 border-t border-slate-200/80 pt-5 dark:border-slate-700">
        <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">
          {t("statistics.materialsUsed", "Materials used")}
        </h3>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
          {t("statistics.materialBreakdownHint", "Recorded use by material in the selected period. Bar segments keep the recorded filament colors.")}
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" role="status">{t("common.loading", "Loading...")}</p>
        ) : !report ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" role="status">{unavailableMessage}</p>
        ) : materials.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">{t("statistics.noPeriodConsumption", "No material use recorded in this period.")}</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {materials.map((row) => (
              <li key={row.material}>
                <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                  <span className="min-w-0 break-words font-medium text-slate-900 dark:text-slate-100">{row.material || t("common.unknown", "Unknown")}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatGrams(row.usedGrams, "zero", locale)}</span>
                </div>
                <div aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="flex h-full overflow-hidden rounded-full" style={{ width: `${(row.usedGrams / maxMaterialGrams) * 100}%` }}>
                    {row.colors.map((segment) => (
                      <span key={segment.color ?? "unknown"} className="h-full shadow-[inset_0_0_0_1px_rgba(148,163,184,0.35)]" style={{ width: `${(segment.usedGrams / row.usedGrams) * 100}%`, background: swatchCssBackground(segment.color) }} />
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="mt-5 border-t border-slate-200/80 pt-4 dark:border-slate-700">
        <summary className="app-control-focus cursor-pointer rounded text-sm font-medium text-slate-600 outline-none dark:text-slate-300">
          {t("statistics.consumptionDataDetails", "Data and limitations")}
        </summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          {t("statistics.consumptionDataHint", "Includes recorded printer-linked jobs and Bambu Live sessions. Stock adjustments and unrecorded prints are excluded. Ownership remains separate in the details.")}
        </p>
      </details>
    </section>
  );
}
