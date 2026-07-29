import { neutralChipClass } from "../lib/chip_styles";
import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "../lib/number_display";
import {
  isInboundLoanDirection,
  type LoanUsageListFilter,
  type TranslateFn,
} from "../lib/statistics_model";
import type { LoanUsageByPersonRow } from "../lib/tauri_client";
import { formatGrams } from "../lib/weight_display";
import { StatisticsEmptyState, SummaryMetricTile } from "./statistics_primitives";
import { statisticsInteractiveCardClass } from "./statistics_view_helpers";

function statisticsResultCount(t: TranslateFn, count: number): string {
  return t(
    "statistics.resultCount",
    "{count, plural, one {# result} other {# results}}",
    { count },
  );
}

export function StatisticsOutboundLoanUsagePanel({
  filteredLoanUsage,
  locale = "en",
  loading,
  loanUsageListFilter,
  onOpenBorrower,
  setLoanUsageListFilter,
  t,
}: {
  filteredLoanUsage: LoanUsageByPersonRow[];
  locale?: NumberDisplayLocale;
  loading: boolean;
  loanUsageListFilter: LoanUsageListFilter;
  onOpenBorrower: (borrowerName: string) => void;
  setLoanUsageListFilter: (filter: LoanUsageListFilter) => void;
  t: TranslateFn;
}) {
  return (
    <div id="statistics-outbound-loan-usage" className="mt-8 scroll-mt-28 surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.borrowerUsage", "Loan usage by person")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.borrowerUsageHint",
              "Open a borrower to see which filaments make up their loan usage.",
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap gap-1.5">
            {(["ALL", "ACTIVE", "COMPLETED"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={loanUsageListFilter === mode}
                onClick={() => setLoanUsageListFilter(mode)}
                className={neutralChipClass(loanUsageListFilter === mode, "px-3 py-1.5 text-xs")}
              >
                {mode === "ALL"
                  ? t("common.all", "All")
                  : mode === "ACTIVE"
                    ? t("common.active", "Active")
                    : t("statistics.completed", "Completed")}
              </button>
            ))}
          </div>
          <div
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none"
            aria-live="polite"
            aria-atomic="true"
          >
            {statisticsResultCount(t, filteredLoanUsage.length)}
          </div>
        </div>
      </div>
      {loading ? (
        <div className="mt-4 text-sm text-slate-500">
          {t("statistics.loadingLoan", "Loading loan usage...")}
        </div>
      ) : null}
      {!loading && filteredLoanUsage.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noLoanUsage", "No loan usage recorded yet.")}
        </StatisticsEmptyState>
      ) : null}
      <div className="mt-4 space-y-3">
        {filteredLoanUsage.map((row) => (
          <StatisticsLoanUsageRow
            key={`${row.loan_direction}-${row.borrower_name}`}
            locale={locale}
            onOpen={() => onOpenBorrower(row.borrower_name)}
            row={row}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

export function StatisticsInboundLoanUsagePanel({
  inboundLoanUsage,
  locale = "en",
  loading,
  onOpenOwner,
  t,
}: {
  inboundLoanUsage: LoanUsageByPersonRow[];
  locale?: NumberDisplayLocale;
  loading: boolean;
  onOpenOwner: (ownerName: string) => void;
  t: TranslateFn;
}) {
  return (
    <div className="mt-8 surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.inboundUsage", "Borrowed-in usage by owner")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.inboundUsageHint",
              "Open an owner to see which borrowed-in filaments make up their usage.",
            )}
          </div>
        </div>
        <div
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold tabular-nums text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none"
          aria-live="polite"
          aria-atomic="true"
        >
          {statisticsResultCount(t, inboundLoanUsage.length)}
        </div>
      </div>
      {loading ? (
        <div className="mt-4 text-sm text-slate-500">
          {t("statistics.loadingInboundUsage", "Loading borrowed-in usage...")}
        </div>
      ) : null}
      {!loading && inboundLoanUsage.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noInboundUsage", "No borrowed-in usage recorded yet.")}
        </StatisticsEmptyState>
      ) : null}
      <div className="mt-4 space-y-3">
        {inboundLoanUsage.map((row) => (
          <StatisticsLoanUsageRow
            key={`${row.loan_direction}-${row.borrower_name}`}
            locale={locale}
            onOpen={() => onOpenOwner(row.borrower_name)}
            row={row}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function StatisticsLoanUsageRow({
  locale,
  onOpen,
  row,
  t,
}: {
  locale: NumberDisplayLocale;
  onOpen: () => void;
  row: LoanUsageByPersonRow;
  t: TranslateFn;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={`block w-full rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-left dark:border-slate-700 dark:bg-slate-950/45 ${statisticsInteractiveCardClass}`}
      onClick={onOpen}
    >
      <span className="flex flex-wrap items-start justify-between gap-4">
        <span className="block min-w-0">
          <span className="block font-semibold text-slate-900 dark:text-slate-50">
            {row.borrower_name}
          </span>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            {isInboundLoanDirection(row.loan_direction)
              ? t(
                  "statistics.inboundBreakdownHint",
                  "Borrowed-in totals across active and completed rolls.",
                )
              : t(
                  "statistics.borrowerBreakdownHint",
                  "Loan totals across active and completed rolls.",
                )}
          </span>
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
            {t("statistics.viewDetails", "View details")}
            <span aria-hidden="true">→</span>
          </span>
        </span>
        <span className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem] min-[1080px]:grid-cols-3">
          <SummaryMetricTile
            label={t("printers.used", "Used")}
            value={formatGrams(row.total_consumed_g, "zero", locale)}
            tone="amber"
          />
          <SummaryMetricTile
            label={t("statistics.completed", "Completed")}
            value={formatDisplayInteger(row.completed_loans, locale)}
            tone="sky"
          />
          <SummaryMetricTile
            label={t("common.active", "Active")}
            value={formatDisplayInteger(row.active_loans, locale)}
            tone="emerald"
            className="col-span-2 min-[1080px]:col-span-1"
          />
        </span>
      </span>
    </button>
  );
}
