import { AppModal } from "../components/app_modal";
import { InventorySwatchChip } from "../components/inventory_swatch_chip";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import { formatFilamentDisplayTitle } from "../lib/display_format";
import {
  formatDisplayInteger,
  formatDisplayPercent,
  type NumberDisplayLocale,
} from "../lib/number_display";
import {
  formatActiveSlotLabel,
  ownershipBadgeClass,
  ownershipLabel,
  parseOwnershipFilter,
  type ActiveSlotDisplayRow,
  type MetricModalKind,
  type OwnershipFilter,
  type TranslateFn,
} from "../lib/statistics_model";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { PrinterOverviewRow } from "../lib/tauri_client";
import { formatGrams } from "../lib/weight_display";
import {
  StatisticsEmptyState,
  StatisticsPrinterMetricCard,
  SummaryMetricTile,
} from "./statistics_primitives";
import { statisticsFilterSelectClass } from "./statistics_view_helpers";

export function StatisticsMetricDetailModal({
  activeSlotOwnershipCounts,
  activeSlotRows,
  failedPrinterRows,
  filteredActiveSlotRows,
  locale = "en",
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
  locale?: NumberDisplayLocale;
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
              <StatisticsPrinterMetricCard
                key={row.printer.id}
                printerName={row.printer.name}
                printerModel={row.printer.model}
                resolvedTheme={resolvedTheme}
                metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-4"
              >
                <SummaryMetricTile
                  label={t("printers.jobs", "Jobs")}
                  value={formatDisplayInteger(row.usage.total_jobs, locale)}
                  tone="sky"
                />
                <SummaryMetricTile
                  label={t("printers.success", "Success")}
                  value={formatDisplayInteger(row.usage.successful_jobs, locale)}
                  tone="emerald"
                />
                <SummaryMetricTile
                  label={t("printers.failed", "Failed")}
                  value={formatDisplayInteger(row.usage.failed_jobs, locale)}
                  tone="rose"
                />
                <SummaryMetricTile
                  label={t("printers.used", "Used")}
                  value={formatGrams(row.usage.total_used_g, "zero", locale)}
                  tone="amber"
                  className="col-span-2 min-[960px]:col-span-1"
                />
              </StatisticsPrinterMetricCard>
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
                <StatisticsPrinterMetricCard
                  key={row.printer.id}
                  printerName={row.printer.name}
                  printerModel={row.printer.model}
                  resolvedTheme={resolvedTheme}
                  metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]"
                >
                  <SummaryMetricTile
                    label={t("printers.failed", "Failed")}
                    value={formatDisplayInteger(row.usage.failed_jobs, locale)}
                    tone="rose"
                  />
                  <SummaryMetricTile
                    label={t("statistics.failureRate", "Failure rate")}
                    value={formatDisplayPercent(failureRate, locale)}
                    tone="amber"
                  />
                </StatisticsPrinterMetricCard>
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
                {`${t("inventory.ownedByUs", "Owned")}: ${formatDisplayInteger(activeSlotOwnershipCounts.owned, locale)} · ${t("inventory.borrowedIn", "Borrowed in")}: ${formatDisplayInteger(activeSlotOwnershipCounts.borrowedIn, locale)}`}
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
                        <InventorySwatchChip
                          className="mt-0.5 h-5 w-5 rounded-md"
                          swatchColor={row.slot.spool_hex_color}
                          tone="tiny"
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
                          value={formatGrams(
                            row.slot.spool_remaining_g ?? 0,
                            "zero",
                            locale,
                          )}
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
