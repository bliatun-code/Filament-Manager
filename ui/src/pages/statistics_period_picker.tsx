import { useId } from "react";
import type { I18nContextValue } from "../lib/i18n";
import { formatDisplayInteger, type NumberDisplayLocale } from "../lib/number_display";
import {
  formatStatisticsPeriodRange,
  type StatisticsCustomPeriodValidationError,
  type StatisticsPeriodPickerState,
  type StatisticsPeriodPreset,
} from "../lib/statistics_period_model";
import {
  statisticsFilterButtonClass,
  statisticsFilterButtonChromeClass,
  statisticsFilterInputClass,
} from "./statistics_view_helpers";

type Translate = I18nContextValue["t"];

function validationMessage(
  error: StatisticsCustomPeriodValidationError,
  t: Translate,
): string {
  if (error === "MISSING_DATE") {
    return t("statistics.periodDateRequired", "Choose both a start and end date.");
  }
  if (error === "INVALID_DATE") {
    return t("statistics.periodDateInvalid", "Enter valid calendar dates.");
  }
  return t(
    "statistics.periodOrderInvalid",
    "End date must be on or after start date.",
  );
}

export function StatisticsPeriodPicker({
  locale = "en",
  onApplyCustom,
  onCustomDateChange,
  onOpenCustom,
  onSelectPreset,
  state,
  t,
}: {
  locale?: NumberDisplayLocale;
  onApplyCustom: () => void;
  onCustomDateChange: (field: "start" | "end", value: string) => void;
  onOpenCustom: () => void;
  onSelectPreset: (preset: Exclude<StatisticsPeriodPreset, "CUSTOM">) => void;
  state: StatisticsPeriodPickerState;
  t: Translate;
}) {
  const titleId = useId();
  const editorId = useId();
  const validationId = useId();
  const dateRange = formatStatisticsPeriodRange(state, locale);
  const presetButtonClass = (selected: boolean) =>
    `${selected ? "app-selected-control" : "app-soft-control"} ${statisticsFilterButtonChromeClass}`;

  return (
    <section className="surface-subtle mt-4 p-3.5" aria-labelledby={titleId}>
      <div className="flex flex-col gap-3 min-[900px]:flex-row min-[900px]:items-center min-[900px]:justify-between">
        <div>
          <div
            id={titleId}
            className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400"
          >
            {t("statistics.periodTitle", "Reporting period")}
          </div>
          <div
            className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100"
            aria-live="polite"
          >
            {`${t("common.selected", "Selected")}: ${dateRange}`}
          </div>
        </div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          role="group"
          aria-label={t("statistics.periodTitle", "Reporting period")}
        >
          <button
            type="button"
            aria-pressed={state.appliedPreset === "30_DAYS"}
            className={presetButtonClass(state.appliedPreset === "30_DAYS")}
            onClick={() => onSelectPreset("30_DAYS")}
          >
            {t("dashboard.last30", "Last 30 days")}
          </button>
          <button
            type="button"
            aria-pressed={state.appliedPreset === "90_DAYS"}
            className={presetButtonClass(state.appliedPreset === "90_DAYS")}
            onClick={() => onSelectPreset("90_DAYS")}
          >
            {`${formatDisplayInteger(90, locale)} ${t("common.daysShort", "d")}`}
          </button>
          <button
            type="button"
            aria-pressed={state.appliedPreset === "12_MONTHS"}
            className={presetButtonClass(state.appliedPreset === "12_MONTHS")}
            onClick={() => onSelectPreset("12_MONTHS")}
          >
            {t("dashboard.last12Months", "Last 12 months")}
          </button>
          <button
            type="button"
            aria-expanded={state.customEditorOpen}
            aria-controls={editorId}
            aria-pressed={state.appliedPreset === "CUSTOM"}
            className={presetButtonClass(state.appliedPreset === "CUSTOM")}
            onClick={onOpenCustom}
          >
            {t("statistics.periodCustom", "Custom range")}
          </button>
        </div>
      </div>

      {state.customEditorOpen ? (
        <form
          id={editorId}
          className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-200/80 pt-3 dark:border-slate-700 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            onApplyCustom();
          }}
        >
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{t("statistics.periodStart", "Start date")}</span>
            <input
              type="date"
              required
              value={state.customStartDate}
              max={state.customEndDate || undefined}
              aria-invalid={state.validationError != null}
              aria-describedby={state.validationError ? validationId : undefined}
              className={statisticsFilterInputClass}
              onChange={(event) => onCustomDateChange("start", event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span>{t("statistics.periodEnd", "End date")}</span>
            <input
              type="date"
              required
              value={state.customEndDate}
              min={state.customStartDate || undefined}
              aria-invalid={state.validationError != null}
              aria-describedby={state.validationError ? validationId : undefined}
              className={statisticsFilterInputClass}
              onChange={(event) => onCustomDateChange("end", event.target.value)}
            />
          </label>
          <button type="submit" className={statisticsFilterButtonClass}>
            {t("statistics.periodApply", "Apply range")}
          </button>
          {state.validationError ? (
            <div
              id={validationId}
              className="text-xs font-medium text-rose-700 dark:text-rose-300 sm:col-span-3"
              role="alert"
            >
              {validationMessage(state.validationError, t)}
            </div>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
