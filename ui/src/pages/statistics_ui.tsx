import type { ReactNode } from "react";
import { AppModal } from "../components/app_modal";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import { neutralChipClass } from "../lib/chip_styles";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import { printerBrandSurfaceStyle } from "../lib/printer_branding";
import {
  formatActiveSlotLabel,
  ownershipBadgeClass,
  ownershipLabel,
  parseOwnershipFilter,
  toSwatchColor,
  type ActiveSlotDisplayRow,
  type LoanUsageListFilter,
  type MetricModalKind,
  type OwnershipFilter,
  type TranslateFn,
} from "../lib/statistics_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type {
  InventoryOverview,
  LoanUsageByPersonRow,
  PrinterOverviewRow,
} from "../lib/tauri_client";
import { statisticsFilterSelectClass } from "./statistics_view_helpers";

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

export function StatisticsMetricDetailModal({
  activeSlotOwnershipCounts,
  activeSlotRows,
  failedPrinterRows,
  filteredActiveSlotRows,
  loggedPrinterRows,
  metricModalKind,
  onClose,
  resolvedTheme,
  setSlotOwnershipFilter,
  slotOwnershipFilter,
  t,
}: {
  activeSlotOwnershipCounts: { owned: number; borrowedIn: number };
  activeSlotRows: ActiveSlotDisplayRow[];
  failedPrinterRows: PrinterOverviewRow[];
  filteredActiveSlotRows: ActiveSlotDisplayRow[];
  loggedPrinterRows: PrinterOverviewRow[];
  metricModalKind: MetricModalKind;
  onClose: () => void;
  resolvedTheme: ResolvedTheme;
  setSlotOwnershipFilter: (filter: OwnershipFilter) => void;
  slotOwnershipFilter: OwnershipFilter;
  t: TranslateFn;
}) {
  return (
    <AppModal closeOnBackdrop onBackdropClose={onClose} panelClassName={modalPanelClassName("xl")}>
      <ModalHeader
        eyebrow={t("nav.statistics", "Statistics")}
        title={
          metricModalKind === "LOGGED_JOBS"
            ? t("statistics.loggedJobsDetailTitle", "Logged jobs by printer")
            : metricModalKind === "FAILED_JOBS"
              ? t("statistics.failedJobsDetailTitle", "Failed jobs by printer")
              : t("statistics.activeSlotsDetailTitle", "Active loaded slots")
        }
        onClose={onClose}
        closeLabel={t("common.close", "Close")}
        className="-mx-5 -mt-5"
      />

      {metricModalKind === "LOGGED_JOBS" ? (
        loggedPrinterRows.length === 0 ? (
          <StatisticsEmptyState>
            {t("statistics.noLoggedJobsBreakdown", "No logged jobs yet.")}
          </StatisticsEmptyState>
        ) : (
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
            {loggedPrinterRows.map((row) => (
              <div
                key={row.printer.id}
                className="rounded-2xl border p-4"
                style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {row.printer.name}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {row.printer.model}
                    </div>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-4">
                    <SummaryMetricTile
                      label={t("printers.jobs", "Jobs")}
                      value={row.usage.total_jobs.toString()}
                      tone="sky"
                    />
                    <SummaryMetricTile
                      label={t("printers.success", "Success")}
                      value={row.usage.successful_jobs.toString()}
                      tone="emerald"
                    />
                    <SummaryMetricTile
                      label={t("printers.failed", "Failed")}
                      value={row.usage.failed_jobs.toString()}
                      tone="rose"
                    />
                    <SummaryMetricTile
                      label={t("printers.used", "Used")}
                      value={`${row.usage.total_used_g} g`}
                      tone="amber"
                      className="col-span-2 min-[960px]:col-span-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {metricModalKind === "FAILED_JOBS" ? (
        failedPrinterRows.length === 0 ? (
          <StatisticsEmptyState>
            {t("statistics.noFailedJobsBreakdown", "No failed jobs recorded.")}
          </StatisticsEmptyState>
        ) : (
          <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
            {failedPrinterRows.map((row) => {
              const failureRate =
                row.usage.total_jobs > 0
                  ? Math.round((row.usage.failed_jobs / row.usage.total_jobs) * 100)
                  : 0;
              return (
                <div
                  key={row.printer.id}
                  className="rounded-2xl border p-4"
                  style={printerBrandSurfaceStyle(row.printer.model, "compact", resolvedTheme)}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                        {row.printer.name}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {row.printer.model}
                      </div>
                    </div>
                    <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]">
                      <SummaryMetricTile
                        label={t("printers.failed", "Failed")}
                        value={row.usage.failed_jobs.toString()}
                        tone="rose"
                      />
                      <SummaryMetricTile
                        label={t("statistics.failureRate", "Failure rate")}
                        value={`${failureRate}%`}
                        tone="amber"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {metricModalKind === "ACTIVE_SLOTS" ? (
        activeSlotRows.length === 0 ? (
          <StatisticsEmptyState>
            {t("statistics.noActiveSlotsBreakdown", "No loaded slots right now.")}
          </StatisticsEmptyState>
        ) : (
          <>
            <div className="surface-subtle mt-4 flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <select
                value={slotOwnershipFilter}
                onChange={(event) =>
                  setSlotOwnershipFilter(parseOwnershipFilter(event.target.value))
                }
                className={statisticsFilterSelectClass}
              >
                <option value="ALL">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("common.all", "All")}`}
                </option>
                <option value="OWNED">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.ownedByUs", "Owned")}`}
                </option>
                <option value="BORROWED_IN">
                  {`${t("inventory.ownershipGroup", "Ownership")}: ${t("inventory.borrowedIn", "Borrowed in")}`}
                </option>
              </select>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {`${t("inventory.ownedByUs", "Owned")}: ${activeSlotOwnershipCounts.owned} · ${t("inventory.borrowedIn", "Borrowed in")}: ${activeSlotOwnershipCounts.borrowedIn}`}
              </div>
            </div>
            {filteredActiveSlotRows.length === 0 ? (
              <StatisticsEmptyState>
                {t(
                  "statistics.noActiveSlotFilterMatch",
                  "No loaded slots match the current ownership filter.",
                )}
              </StatisticsEmptyState>
            ) : (
              <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
                {filteredActiveSlotRows.map((row) => (
                  <div
                    key={`${row.printerId}-${row.slot.slot_id}`}
                    className="rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          className="mt-0.5 h-5 w-5 flex-none rounded-md border border-slate-300/80 dark:border-slate-600"
                          style={{ backgroundColor: toSwatchColor(row.slot.spool_hex_color) }}
                        />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-50">
                            {row.printerName} ·{" "}
                            {formatActiveSlotLabel(t, row.printerModel, row.slot)}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {formatFilamentDisplayTitle(
                              row.slot.spool_material ?? t("common.unknown", "Unknown"),
                              row.slot.spool_filament_name ?? t("common.unknown", "Unknown"),
                              row.slot.spool_color_name ?? t("common.unknown", "Unknown"),
                            )}
                          </div>
                          <div className="mt-2">
                            <span
                              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ownershipBadgeClass(row.slot.spool_ownership_type)}`}
                            >
                              {ownershipLabel(
                                t,
                                row.slot.spool_ownership_type,
                                row.slot.spool_owner_name,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]">
                        <SummaryMetricTile
                          label={t("inventory.remaining", "Remaining")}
                          value={`${row.slot.spool_remaining_g ?? 0} g`}
                          tone="emerald"
                        />
                        <SummaryMetricTile
                          label={t("inventory.statusAssigned", "Assigned")}
                          value={t("statistics.currentSnapshot", "Current snapshot")}
                          tone="sky"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )
      ) : null}
    </AppModal>
  );
}
