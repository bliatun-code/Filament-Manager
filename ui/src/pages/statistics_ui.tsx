import type { ReactNode } from "react";
import { neutralChipClass } from "../lib/chip_styles";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import type { LoanUsageListFilter, TranslateFn } from "../lib/statistics_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type {
  InventoryOverview,
  LoanUsageByPersonRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";

type MetricTone = "slate" | "sky" | "emerald" | "amber" | "rose";

function metricTileClass(tone: MetricTone): string {
  switch (tone) {
    case "sky":
      return "border-sky-200/80 bg-white/75 dark:border-sky-400/25 dark:bg-sky-500/10";
    case "emerald":
      return "border-emerald-200/80 bg-white/75 dark:border-emerald-400/25 dark:bg-emerald-500/10";
    case "amber":
      return "border-amber-200/80 bg-white/75 dark:border-amber-400/25 dark:bg-amber-500/10";
    case "rose":
      return "border-rose-200/80 bg-white/75 dark:border-rose-400/25 dark:bg-rose-500/10";
    case "slate":
    default:
      return "border-slate-200/85 bg-white/80 dark:border-slate-700 dark:bg-slate-950/45";
  }
}

export function SummaryMetricTile({
  label,
  value,
  tone = "slate",
  className = "",
}: {
  label: string;
  value: string;
  tone?: MetricTone;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${metricTileClass(tone)} ${className}`.trim()}>
      <div className="text-[11px] uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div key={value} className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-50">
        {value}
      </div>
    </div>
  );
}

export function StatisticsEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
      {children}
    </div>
  );
}

export function StatisticsOwnershipSnapshotPanel({
  ownershipOverview,
  t,
}: {
  ownershipOverview: InventoryOverview | null;
  t: TranslateFn;
}) {
  return (
    <div className="content-section surface-card">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.ownershipSnapshot", "Ownership snapshot")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.ownershipSnapshotHint",
              "Additive ownership split for on-hand stock and recent print usage. The headline cards above still show the combined totals.",
            )}
          </div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricTile
          key={`owned-on-hand-${ownershipOverview?.total_owned_spools ?? 0}`}
          label={t("statistics.ownedOnHand", "Owned on hand")}
          value={(ownershipOverview?.total_owned_spools ?? 0).toString()}
          tone="sky"
        />
        <SummaryMetricTile
          key={`borrowed-on-hand-${ownershipOverview?.total_borrowed_in_spools ?? 0}`}
          label={t("statistics.borrowedInOnHand", "Borrowed in on hand")}
          value={(ownershipOverview?.total_borrowed_in_spools ?? 0).toString()}
          tone="amber"
        />
        <SummaryMetricTile
          key={`owned-consumption-${ownershipOverview?.owned_consumption_30d ?? 0}`}
          label={t("statistics.ownedPrintUsage30d", "Owned print use (30d)")}
          value={`${ownershipOverview?.owned_consumption_30d ?? 0} g`}
          tone="emerald"
        />
        <SummaryMetricTile
          key={`borrowed-consumption-${ownershipOverview?.borrowed_in_consumption_30d ?? 0}`}
          label={t("statistics.borrowedInPrintUsage30d", "Borrowed-in print use (30d)")}
          value={`${ownershipOverview?.borrowed_in_consumption_30d ?? 0} g`}
          tone="amber"
        />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetricTile
          label={t("statistics.ownedInUse", "Owned assigned")}
          value={(ownershipOverview?.owned_in_use ?? 0).toString()}
          tone="sky"
        />
        <SummaryMetricTile
          label={t("statistics.borrowedInInUse", "Borrowed assigned")}
          value={(ownershipOverview?.borrowed_in_in_use ?? 0).toString()}
          tone="amber"
        />
        <SummaryMetricTile
          label={t("statistics.ownedLowStock", "Owned low stock")}
          value={(ownershipOverview?.owned_low_stock ?? 0).toString()}
          tone="rose"
        />
        <SummaryMetricTile
          label={t("statistics.borrowedInLowStock", "Borrowed-in low stock")}
          value={(ownershipOverview?.borrowed_in_low_stock ?? 0).toString()}
          tone="rose"
        />
      </div>
    </div>
  );
}

export function StatisticsPerPrinterUsagePanel({
  loading,
  onOpenConsumption,
  printers,
  resolvedTheme,
  t,
}: {
  loading: boolean;
  onOpenConsumption: (printer: PrinterOverviewRow) => void;
  printers: PrinterOverviewRow[];
  resolvedTheme: ResolvedTheme;
  t: TranslateFn;
}) {
  return (
    <div className="content-section surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow">
            {t("statistics.perPrinter", "Per-printer usage")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {t(
              "statistics.perPrinterHint",
              "Open a printer to see filament consumption grouped by material.",
            )}
          </div>
        </div>
        <div className="count-pill">{printers.length}</div>
      </div>
      {loading ? (
        <div className="mt-4 text-sm text-slate-500">
          {t("statistics.loadingPrinter", "Loading printer usage...")}
        </div>
      ) : null}
      {!loading && printers.length === 0 ? (
        <StatisticsEmptyState>
          {t("statistics.noPrinterActivity", "No printer activity available yet.")}
        </StatisticsEmptyState>
      ) : null}
      <div className="mt-4 space-y-3">
        {printers.map((row) => (
          <div
            key={row.printer.id}
            className="cursor-pointer rounded-lg border p-3.5 text-sm transition hover:-translate-y-0.5"
            role="button"
            tabIndex={0}
            onClick={() => onOpenConsumption(row)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpenConsumption(row);
              }
            }}
            style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900 dark:text-slate-50">
                  {row.printer.name}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {row.printer.model}
                </div>
              </div>
              <div className="grid w-full grid-cols-3 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem]">
                <SummaryMetricTile
                  label={t("printers.jobs", "Jobs")}
                  value={row.usage.total_jobs.toString()}
                  tone="sky"
                />
                <SummaryMetricTile
                  label={t("printers.used", "Used")}
                  value={`${row.usage.total_used_g} g`}
                  tone="amber"
                />
                <SummaryMetricTile
                  label={t("printers.failed", "Failed")}
                  value={row.usage.failed_jobs.toString()}
                  tone="rose"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatisticsOutboundLoanUsagePanel({
  filteredLoanUsage,
  loading,
  loanUsageListFilter,
  onOpenBorrower,
  setLoanUsageListFilter,
  t,
}: {
  filteredLoanUsage: LoanUsageByPersonRow[];
  loading: boolean;
  loanUsageListFilter: LoanUsageListFilter;
  onOpenBorrower: (borrowerName: string) => void;
  setLoanUsageListFilter: (filter: LoanUsageListFilter) => void;
  t: TranslateFn;
}) {
  return (
    <div className="mt-8 surface-card">
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
          <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none">
            {filteredLoanUsage.length}
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
  loading,
  onOpenOwner,
  t,
}: {
  inboundLoanUsage: LoanUsageByPersonRow[];
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
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200 dark:shadow-none">
          {inboundLoanUsage.length}
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
  onOpen,
  row,
  t,
}: {
  onOpen: () => void;
  row: LoanUsageByPersonRow;
  t: TranslateFn;
}) {
  return (
    <div
      className="cursor-pointer rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm transition hover:-translate-y-0.5 dark:border-slate-700 dark:bg-slate-950/45"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 dark:text-slate-50">
            {row.borrower_name}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {row.loan_direction === "INBOUND"
              ? t(
                  "statistics.inboundBreakdownHint",
                  "Borrowed-in totals across active and completed rolls.",
                )
              : t(
                  "statistics.borrowerBreakdownHint",
                  "Loan totals across active and completed rolls.",
                )}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 min-[1080px]:w-auto min-[1080px]:min-w-[18rem] min-[1080px]:grid-cols-3">
          <SummaryMetricTile
            label={t("printers.used", "Used")}
            value={`${row.total_consumed_g} g`}
            tone="amber"
          />
          <SummaryMetricTile
            label={t("statistics.completed", "Completed")}
            value={row.completed_loans.toString()}
            tone="sky"
          />
          <SummaryMetricTile
            label={t("common.active", "Active")}
            value={row.active_loans.toString()}
            tone="emerald"
            className="col-span-2 min-[1080px]:col-span-1"
          />
        </div>
      </div>
    </div>
  );
}
