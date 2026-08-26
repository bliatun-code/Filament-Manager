import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { formatDateTime } from "../lib/date_time";
import {
  formatFilamentDisplayTitle,
  formatSpoolReference,
} from "../lib/display_format";
import type { Locale } from "../lib/i18n";
import { formatInventoryStatusLabel } from "../lib/inventory_list_model";
import {
  formatDisplayGrams,
  formatDisplayInteger,
  formatDisplayNumber,
  formatDisplayPercent,
} from "../lib/number_display";
import {
  formatStatisticsMoney,
  groupStatisticsCurrencyAmounts,
  statisticsCoveragePercent,
  statisticsMissingReasonFilamentDefaultsTarget,
  statisticsMissingReasonLabel,
  statisticsMissingReasonOpensFilamentDefaults,
  statisticsOwnershipLabel,
  type StatisticsFilamentDefaultsTarget,
} from "../lib/statistics_value_cost_model";
import type {
  StatisticsInventoryValueTraceRow,
  StatisticsMaterialCostTraceRow,
  StatisticsMonetarySummary,
  StatisticsValueCostReport,
} from "../lib/tauri_client";
import type { TranslateFn } from "../lib/statistics_model";
import { SummaryMetricTile } from "./statistics_primitives";
import { statisticsFilterButtonClass } from "./statistics_view_helpers";

const TRACE_PAGE_SIZE = 40;

type ValueCostMetricKind = "INVENTORY_VALUE" | "MATERIAL_COST";

function interpolateCount(
  t: TranslateFn,
  key: string,
  fallback: string,
  params: Record<string, string | number>,
): string {
  return t(key, fallback, params);
}

function formatOptionalMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
  t: TranslateFn,
): string {
  if (amount == null) {
    return t("statistics.valueCostNotRecorded", "Not recorded");
  }
  const normalizedCurrency = (currency ?? "").trim();
  if (normalizedCurrency) {
    return formatStatisticsMoney(amount, normalizedCurrency, locale);
  }
  return `${formatDisplayNumber(amount, locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} · ${t("statistics.valueCostCurrencyMissingShort", "currency missing")}`;
}

function traceStatusLabel(t: TranslateFn, raw: string): string {
  const token = raw.trim().toUpperCase().replace(/[-\s]+/g, "_");
  if (token === "COMPLETED" || token === "SUCCESS" || token === "SUCCEEDED") {
    return t("statistics.completed", "Completed");
  }
  if (token === "FAILED") {
    return t("statistics.valueCostStatusFailed", "Failed");
  }
  if (token === "UNKNOWN" || !token) {
    return t("common.unknown", "Unknown");
  }
  const words = raw.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").toLowerCase();
  return words.length > 0 ? `${words[0]!.toUpperCase()}${words.slice(1)}` : "—";
}

function reasonHasUnavailableWeight(reason: string): boolean {
  const token = reason.trim().toLowerCase();
  return (
    token === "remaining_weight_missing" ||
    token === "remaining_weight_invalid" ||
    token === "used_weight_missing" ||
    token === "used_weight_invalid"
  );
}

function MissingReasonList({
  reasons,
  t,
}: {
  reasons: string[];
  t: TranslateFn;
}) {
  if (reasons.length === 0) {
    return null;
  }
  return (
    <ul className="mt-3 space-y-1 text-xs text-amber-800 dark:text-amber-200">
      {reasons.map((reason, index) => (
        <li key={`${reason}-${index}`} className="flex gap-2">
          <span aria-hidden="true">•</span>
          <span>{statisticsMissingReasonLabel(t, reason)}</span>
        </li>
      ))}
    </ul>
  );
}

function TraceField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}

export function InventoryValueTraceCard({
  locale,
  row,
  t,
}: {
  locale: Locale;
  row: StatisticsInventoryValueTraceRow;
  t: TranslateFn;
}) {
  const title = formatFilamentDisplayTitle(
    row.material,
    row.filament_name,
    row.color_name,
  );
  const hasAmount = row.amount != null && Boolean(row.purchase_currency?.trim());

  return (
    <li className="rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-950/45">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50" title={title}>
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {row.vendor} ·{" "}
            {row.spool_id?.trim()
              ? formatSpoolReference(row.spool_id)
              : t("statistics.valueCostSpoolUnavailable", "Spool unavailable")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {formatInventoryStatusLabel(t, row.status)}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200">
            {statisticsOwnershipLabel(t, row.ownership_type)}
          </span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TraceField
          label={t("statistics.valueCostRemaining", "Remaining")}
          value={
            row.remaining_g == null
              ? t("statistics.valueCostNotRecorded", "Not recorded")
              : formatDisplayGrams(row.remaining_g, locale)
          }
        />
        <TraceField
          label={t("statistics.valueCostInitialWeight", "Initial weight")}
          value={
            row.initial_weight_g == null
              ? t("statistics.valueCostNotRecorded", "Not recorded")
              : formatDisplayGrams(row.initial_weight_g, locale)
          }
        />
        <TraceField
          label={t("statistics.valueCostPurchasePrice", "Purchase price")}
          value={formatOptionalMoney(row.purchase_price, row.purchase_currency, locale, t)}
        />
        <TraceField
          label={t("statistics.inventoryValue", "Inventory value")}
          value={
            hasAmount
              ? formatStatisticsMoney(row.amount!, row.purchase_currency!, locale)
              : t("statistics.valueCostNotValued", "Not valued")
          }
        />
      </dl>
      <div className="mt-3 break-all text-xs text-slate-500 dark:text-slate-400">
        {t("statistics.valueCostSpoolReference", "Spool reference")}: {row.spool_id}
      </div>
      <MissingReasonList reasons={row.missing_reasons} t={t} />
    </li>
  );
}

export function MaterialCostTraceCard({
  locale,
  row,
  t,
}: {
  locale: Locale;
  row: StatisticsMaterialCostTraceRow;
  t: TranslateFn;
}) {
  const title = formatFilamentDisplayTitle(
    row.material,
    row.filament_name,
    row.color_name,
  );
  const hasAmount = row.amount != null && Boolean(row.purchase_currency?.trim());

  return (
    <li className="rounded-lg border border-slate-200 bg-white/80 p-4 dark:border-slate-700 dark:bg-slate-950/45">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50" title={title}>
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {row.vendor} ·{" "}
            {row.spool_id?.trim()
              ? formatSpoolReference(row.spool_id)
              : t("statistics.valueCostSpoolUnavailable", "Spool unavailable")}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatDateTime(row.used_at, locale)}
            {row.job_name?.trim() ? ` · ${row.job_name.trim()}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {row.source === "LIVE"
              ? t("statistics.valueCostSourceLive", "Live monitoring")
              : t("statistics.valueCostSourceManual", "Manual job")}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {traceStatusLabel(t, row.status)}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-1 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200">
            {row.ownership_type && row.spool_id?.trim()
              ? statisticsOwnershipLabel(t, row.ownership_type)
              : t("statistics.valueCostSpoolUnavailable", "Spool unavailable")}
          </span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <TraceField
          label={t("statistics.valueCostUsed", "Used")}
          value={
            row.used_g == null
              ? t("statistics.valueCostNotRecorded", "Not recorded")
              : formatDisplayGrams(row.used_g, locale)
          }
        />
        <TraceField
          label={t("statistics.valueCostInitialWeight", "Initial weight")}
          value={
            row.initial_weight_g == null
              ? t("statistics.valueCostNotRecorded", "Not recorded")
              : formatDisplayGrams(row.initial_weight_g, locale)
          }
        />
        <TraceField
          label={t("statistics.valueCostPurchasePrice", "Purchase price")}
          value={formatOptionalMoney(row.purchase_price, row.purchase_currency, locale, t)}
        />
        <TraceField
          label={t("statistics.materialCost", "Material cost")}
          value={
            hasAmount
              ? formatStatisticsMoney(row.amount!, row.purchase_currency!, locale)
              : t("statistics.valueCostNotValued", "Not valued")
          }
        />
      </dl>
      {row.printer_id?.trim() ? (
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t("statistics.valueCostPrinterReference", "Printer reference")}: {row.printer_id}
        </div>
      ) : null}
      <div className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">
        {t("statistics.valueCostUsageReference", "Usage reference")}: {row.usage_id}
      </div>
      {row.spool_id?.trim() ? (
        <div className="mt-2 break-all text-xs text-slate-500 dark:text-slate-400">
          {t("statistics.valueCostSpoolReference", "Spool reference")}: {row.spool_id}
        </div>
      ) : null}
      <MissingReasonList reasons={row.missing_reasons} t={t} />
    </li>
  );
}

function CoveragePanel({
  filamentDefaultsManagedOnHost,
  locale,
  onOpenFilamentDefaults,
  summary,
  t,
}: {
  filamentDefaultsManagedOnHost?: boolean;
  locale: Locale;
  onOpenFilamentDefaults?: (target: StatisticsFilamentDefaultsTarget) => void;
  summary: StatisticsMonetarySummary;
  t: TranslateFn;
}) {
  const { coverage } = summary;
  const coveragePercent = statisticsCoveragePercent(summary);
  const totalGrams = coverage.covered_grams + coverage.uncovered_grams;
  const hasUnavailableWeight = coverage.missing_reasons.some((reason) =>
    reasonHasUnavailableWeight(reason.reason),
  );
  const hasFilamentDefaultsGap = coverage.missing_reasons.some((reason) =>
    statisticsMissingReasonOpensFilamentDefaults(reason.reason),
  );

  return (
    <div className="surface-subtle mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            {t("statistics.valueCostCoverage", "Data coverage")}
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
            {coverage.total_rows > 0
              ? interpolateCount(
                  t,
                  "statistics.valueCostCoverageRows",
                  "{valued} of {total} rows valued",
                  {
                    total: formatDisplayInteger(coverage.total_rows, locale),
                    valued: formatDisplayInteger(coverage.valued_rows, locale),
                  },
                )
              : t("statistics.valueCostNoApplicableRows", "No applicable rows")}
          </div>
        </div>
        {coveragePercent == null ? null : (
          <span className="count-pill">
            {formatDisplayPercent(coveragePercent, locale, 1)}
          </span>
        )}
      </div>

      {coveragePercent == null ? null : (
        <div
          aria-label={t("statistics.valueCostCoverage", "Data coverage")}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={coveragePercent}
          className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-sky-500 dark:bg-sky-300"
            style={{ width: `${coveragePercent}%` }}
          />
        </div>
      )}

      {coverage.total_rows > 0 ? (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
          <TraceField
            label={t("statistics.valueCostCoveredWeight", "Known weight valued")}
            value={`${formatDisplayGrams(coverage.covered_grams, locale)} / ${formatDisplayGrams(totalGrams, locale)}`}
          />
          <TraceField
            label={t("statistics.valueCostUnvaluedRows", "Rows without value")}
            value={formatDisplayInteger(coverage.unvalued_rows, locale)}
          />
        </dl>
      ) : null}

      {hasUnavailableWeight ? (
        <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
          {t(
            "statistics.valueCostUnknownWeightHint",
            "Missing or invalid weight is excluded from weight coverage and is not counted as zero.",
          )}
        </p>
      ) : null}

      {coverage.missing_reasons.length > 0 ? (
        <div className="mt-4">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            {t("statistics.valueCostMissingData", "Why data is missing")}
          </div>
          <ul className="mt-2 space-y-2">
            {coverage.missing_reasons.map((reason) => {
              const label = statisticsMissingReasonLabel(t, reason.reason);
              const filamentDefaultsTarget =
                statisticsMissingReasonFilamentDefaultsTarget(reason.reason);
              const count = interpolateCount(
                t,
                "statistics.valueCostMissingReasonCount",
                "{rows} rows · {grams}",
                {
                  grams: reasonHasUnavailableWeight(reason.reason)
                    ? t("statistics.valueCostWeightUnavailable", "weight unavailable")
                    : formatDisplayGrams(reason.grams, locale),
                  rows: formatDisplayInteger(reason.rows, locale),
                },
              );
              const rowContent = (
                <>
                  <span>{label}</span>
                  <span className="flex items-center gap-2 font-semibold">
                    {count}
                    {statisticsMissingReasonOpensFilamentDefaults(reason.reason) &&
                    onOpenFilamentDefaults ? (
                      <span aria-hidden="true">→</span>
                    ) : null}
                  </span>
                </>
              );
              const rowClassName =
                "rounded-lg border border-amber-200/80 bg-amber-50/75 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100";

              return (
                <li key={reason.reason} className={rowClassName}>
                  {statisticsMissingReasonOpensFilamentDefaults(reason.reason) &&
                  onOpenFilamentDefaults ? (
                    <button
                      type="button"
                      aria-label={`${label}. ${t(
                        "statistics.openFilamentDefaults",
                        "Open filament defaults",
                      )}`}
                      className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-amber-100/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 dark:hover:bg-amber-400/10 dark:focus-visible:ring-amber-300 dark:focus-visible:ring-offset-slate-950"
                      onClick={() =>
                        onOpenFilamentDefaults?.(filamentDefaultsTarget!)
                      }
                    >
                      {rowContent}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      {rowContent}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {filamentDefaultsManagedOnHost && hasFilamentDefaultsGap ? (
            <p className="mt-3 text-xs leading-5 text-amber-900 dark:text-amber-100">
              {t(
                "settings.filamentDefaultsHostOwned",
                "Manage library-wide filament defaults on the Host desktop app.",
              )}
            </p>
          ) : null}
        </div>
      ) : coverage.total_rows > 0 ? (
        <div className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          {t("statistics.valueCostCompleteCoverage", "All applicable rows are valued.")}
        </div>
      ) : null}
    </div>
  );
}

function CurrencyTotals({
  locale,
  summary,
  t,
}: {
  locale: Locale;
  summary: StatisticsMonetarySummary;
  t: TranslateFn;
}) {
  const groups = useMemo(() => groupStatisticsCurrencyAmounts(summary), [summary]);

  if (groups.length === 0) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
        {summary.coverage.total_rows === 0
          ? t("statistics.valueCostNoApplicableRows", "No applicable rows")
          : t(
              "statistics.valueCostNoMonetaryTotals",
              "No monetary total can be shown until the missing purchase data is added.",
            )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {groups.map((group) => (
        <div
          key={group.currency}
          className="rounded-lg border border-slate-200 bg-slate-50/85 p-3 dark:border-slate-700 dark:bg-slate-950/45"
          data-currency={group.currency}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              {group.currency}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {t("statistics.valueCostCurrencySeparate", "Kept separate by currency")}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <SummaryMetricTile
              label={t("statistics.valueCostOwned", "Owned")}
              value={
                group.owned
                  ? formatStatisticsMoney(group.owned.amount, group.currency, locale)
                  : t("statistics.valueCostNoValuedRows", "No valued rows")
              }
              tone="sky"
            />
            <SummaryMetricTile
              label={t("statistics.valueCostBorrowedIn", "Borrowed in")}
              value={
                group.borrowedIn
                  ? formatStatisticsMoney(group.borrowedIn.amount, group.currency, locale)
                  : t("statistics.valueCostNoValuedRows", "No valued rows")
              }
              tone="amber"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatisticsValueCostMetric({
  filamentDefaultsManagedOnHost,
  inventoryRows,
  kind,
  locale,
  materialRows,
  onOpenFilamentDefaults,
  periodLabel,
  summary,
  t,
}: {
  filamentDefaultsManagedOnHost?: boolean;
  inventoryRows?: StatisticsInventoryValueTraceRow[];
  kind: ValueCostMetricKind;
  locale: Locale;
  materialRows?: StatisticsMaterialCostTraceRow[];
  onOpenFilamentDefaults?: (target: StatisticsFilamentDefaultsTarget) => void;
  periodLabel: string;
  summary: StatisticsMonetarySummary;
  t: TranslateFn;
}) {
  const [traceOpen, setTraceOpen] = useState(false);
  const [visibleTraceRows, setVisibleTraceRows] = useState(TRACE_PAGE_SIZE);
  const traceId = useId();
  const traceRows = useMemo(
    () =>
      kind === "INVENTORY_VALUE"
        ? (inventoryRows ?? [])
        : (materialRows ?? []),
    [inventoryRows, kind, materialRows],
  );
  const visibleRows = traceRows.slice(0, visibleTraceRows);
  const title =
    kind === "INVENTORY_VALUE"
      ? t("statistics.inventoryValue", "Inventory value")
      : t("statistics.materialCost", "Material cost");
  const subtitle =
    kind === "INVENTORY_VALUE"
      ? t(
          "statistics.inventoryValueHint",
          "Current value of active rolls, based on remaining weight and recorded purchase price.",
        )
      : t(
          "statistics.materialCostHint",
          "Cost of recorded material use within the selected reporting period.",
        );

  useEffect(() => {
    setTraceOpen(false);
    setVisibleTraceRows(TRACE_PAGE_SIZE);
  }, [traceRows]);

  return (
    <article className="surface-card min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">{title}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            {subtitle}
          </p>
        </div>
        <span className="count-pill">
          {kind === "INVENTORY_VALUE"
            ? t("statistics.currentSnapshot", "Current snapshot")
            : periodLabel}
        </span>
      </div>

      <CurrencyTotals locale={locale} summary={summary} t={t} />
      <CoveragePanel
        filamentDefaultsManagedOnHost={filamentDefaultsManagedOnHost}
        locale={locale}
        onOpenFilamentDefaults={onOpenFilamentDefaults}
        summary={summary}
        t={t}
      />

      <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
        <button
          type="button"
          aria-controls={traceId}
          aria-expanded={traceOpen}
          className={`${statisticsFilterButtonClass} flex w-full items-center justify-between gap-3 text-left`}
          onClick={() => setTraceOpen((current) => !current)}
        >
          <span>
            {kind === "INVENTORY_VALUE"
              ? t("statistics.valueCostInventoryTrace", "Trace inventory value")
              : t("statistics.valueCostUsageTrace", "Trace material cost")}
          </span>
          <span aria-hidden="true">{traceOpen ? "−" : "+"}</span>
        </button>

        {traceOpen ? (
          <div id={traceId} className="mt-3">
            <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
              {interpolateCount(
                t,
                "statistics.valueCostTraceCount",
                "Showing {shown} of {returned} available trace rows ({total} total).",
                {
                  returned: formatDisplayInteger(summary.coverage.trace_returned_rows, locale),
                  shown: formatDisplayInteger(visibleRows.length, locale),
                  total: formatDisplayInteger(summary.coverage.trace_total_rows, locale),
                },
              )}
            </p>
            {summary.coverage.trace_truncated ? (
              <div className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50/75 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
                {t(
                  "statistics.valueCostTraceTruncated",
                  "The trace is capped for performance. Totals and coverage still include every applicable row.",
                )}
              </div>
            ) : null}

            {visibleRows.length > 0 ? (
              <ol className="mt-3 space-y-3">
                {kind === "INVENTORY_VALUE"
                  ? (visibleRows as StatisticsInventoryValueTraceRow[]).map((row) => (
                      <InventoryValueTraceCard
                        key={row.spool_id}
                        locale={locale}
                        row={row}
                        t={t}
                      />
                    ))
                  : (visibleRows as StatisticsMaterialCostTraceRow[]).map((row) => (
                      <MaterialCostTraceCard
                        key={`${row.source}-${row.usage_id}`}
                        locale={locale}
                        row={row}
                        t={t}
                      />
                    ))}
              </ol>
            ) : (
              <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {t("statistics.valueCostNoTraceRows", "No trace rows are available.")}
              </div>
            )}

            {visibleRows.length < traceRows.length ? (
              <button
                type="button"
                className={`${statisticsFilterButtonClass} mt-3 w-full sm:w-auto`}
                onClick={() =>
                  setVisibleTraceRows((current) =>
                    Math.min(traceRows.length, current + TRACE_PAGE_SIZE),
                  )
                }
              >
                {t("statistics.valueCostShowMoreTrace", "Show more trace rows")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function StatisticsValueCostPanel({
  filamentDefaultsManagedOnHost = false,
  hostUpgradeRequired,
  loading,
  locale,
  onOpenFilamentDefaults,
  periodLabel,
  report,
  t,
}: {
  filamentDefaultsManagedOnHost?: boolean;
  hostUpgradeRequired: boolean;
  loading: boolean;
  locale: Locale;
  onOpenFilamentDefaults?: (target: StatisticsFilamentDefaultsTarget) => void;
  periodLabel: string;
  report: StatisticsValueCostReport | null;
  t: TranslateFn;
}) {
  const headingId = useId();

  return (
    <section className="content-section" aria-labelledby={headingId}>
      <div className="surface-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="section-eyebrow">{t("statistics.valueCost", "Value & cost")}</div>
            <h2 id={headingId} className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
              {t("statistics.valueCostTitle", "Inventory value and material cost")}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t(
                "statistics.valueCostHint",
                "Authoritative values from recorded purchase data. Currencies and ownership types remain separate, and missing data is never shown as zero.",
              )}
            </p>
          </div>
          <span className="count-pill">{periodLabel}</span>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-slate-600 dark:text-slate-300" role="status">
            {t("statistics.valueCostLoading", "Loading value and cost data...")}
          </div>
        ) : report ? null : (
          <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/75 p-4 text-sm leading-6 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-100">
            {hostUpgradeRequired
              ? t(
                  "statistics.valueCostHostUpgrade",
                  "This Host predates value and cost reporting. Update the Host to see authoritative currency-separated totals and trace details.",
                )
              : t(
                  "statistics.valueCostUnavailable",
                  "Value and cost data is unavailable for this reporting period.",
                )}
          </div>
        )}
      </div>

      {report ? (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <StatisticsValueCostMetric
            filamentDefaultsManagedOnHost={filamentDefaultsManagedOnHost}
            inventoryRows={report.inventory_trace}
            kind="INVENTORY_VALUE"
            locale={locale}
            onOpenFilamentDefaults={
              filamentDefaultsManagedOnHost ? undefined : onOpenFilamentDefaults
            }
            periodLabel={periodLabel}
            summary={report.inventory_value}
            t={t}
          />
          <StatisticsValueCostMetric
            filamentDefaultsManagedOnHost={filamentDefaultsManagedOnHost}
            kind="MATERIAL_COST"
            locale={locale}
            materialRows={report.material_cost_trace}
            onOpenFilamentDefaults={
              filamentDefaultsManagedOnHost ? undefined : onOpenFilamentDefaults
            }
            periodLabel={periodLabel}
            summary={report.material_cost}
            t={t}
          />
        </div>
      ) : null}
    </section>
  );
}
