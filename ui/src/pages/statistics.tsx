import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { StatCard } from "../components/dashboard_widgets";
import { FeedbackBanner } from "../components/feedback_banner";
import { PageDataFallbackBanner } from "../components/page_data_fallback_banner";
import { PageLoadErrorBanner } from "../components/page_load_error_banner";
import { formatDateTime } from "../lib/date_time";
import {
  DESKTOP_VISUAL_QA_BORROWER_NAME,
  resolveDesktopVisualQaScenario,
} from "../lib/desktop_visual_qa_scenario";
import { useI18n } from "../lib/i18n";
import { formatDisplayInteger, formatDisplayPercent } from "../lib/number_display";
import { buildConsumptionForecast } from "../lib/statistics_forecast_model";
import {
  buildActiveSlotRows,
  countActiveSlotOwnerships,
  filterActiveSlotRows,
  filterBorrowerRows,
  filterConsumptionRows,
  filterLoanUsageRows,
  gramsToKgText,
  groupedLoanUsage,
  isInboundLoanDirection,
  isLoanDirection,
  listConsumptionMaterialOptions,
  listConsumptionVendorOptions,
  readBorrowerPopupPrefs,
  readConsumptionPopupPrefs,
  sortFailedPrinterRows,
  sortLoggedPrinterRows,
  applyStatisticsPeriodReportToOverview,
  applyStatisticsPeriodReportToPrinters,
  deriveInventoryOverviewFromRows,
  type BorrowerFilamentUsageRow,
  type BorrowerPopupPrefs,
  type ConsumptionPopupPrefs,
  type LoanDirection,
  type LoanUsageListFilter,
  type MetricModalKind,
  type OwnershipFilter,
  BORROWER_PREFS_STORAGE_KEY,
  CONSUMPTION_PREFS_STORAGE_KEY,
  deriveStatisticsTotals,
} from "../lib/statistics_model";
import {
  loadLoanBreakdownRows,
  type NormalizedLoanDetailsRow,
} from "../lib/statistics_data_source";
import {
  applyCustomStatisticsPeriod,
  createStatisticsPeriodPickerState,
  formatStatisticsPeriodRange,
  openCustomStatisticsPeriod,
  selectStatisticsPeriodPreset,
  updateCustomStatisticsPeriod,
} from "../lib/statistics_period_model";
import { useResolvedTheme } from "../lib/theme_mode";
import {
  isTauri,
  type FilamentConsumptionRow,
  type PrinterOverviewRow,
} from "../lib/tauri_client";
import {
  StatisticsInboundLoanUsagePanel,
  StatisticsMetricDetailModal,
  StatisticsOwnershipSnapshotPanel,
  StatisticsOutboundLoanUsagePanel,
  StatisticsPerPrinterUsagePanel,
} from "./statistics_ui";
import {
  StatisticsBorrowerUsageModal,
  StatisticsConsumptionModal,
} from "./statistics_usage_modals";
import { StatisticsForecastPanel } from "./statistics_forecast_panel";
import { StatisticsPeriodPicker } from "./statistics_period_picker";
import { StatisticsValueCostPanel } from "./statistics_value_cost_panel";
import type { StatisticsFilamentDefaultsTarget } from "../lib/statistics_value_cost_model";
import { useStatisticsPageData } from "./use_statistics_page_data";
import { shouldShowClientSnapshotWarning } from "../lib/page_refresh_state";

function loanPartyName(row: NormalizedLoanDetailsRow): string {
  return (row.loan.counterparty_name ?? "").trim() || row.loan.borrower_name;
}

type StatisticsPageProps = {
  onOpenFilamentDefaults: (target: StatisticsFilamentDefaultsTarget) => void;
};

export default function StatisticsPage({ onOpenFilamentDefaults }: StatisticsPageProps) {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [periodPickerState, setPeriodPickerState] = useState(() =>
    createStatisticsPeriodPickerState(),
  );
  const {
    clientHostDeviceName,
    clientReadOnly,
    clientStatisticsUpdatedAt,
    clientStatsSource,
    error,
    inboundLoanUsage,
    loading,
    loanDetails,
    loanUsage,
    overview,
    periodReport,
    periodStatus,
    printers,
    refreshing,
    reloadData,
    spoolRows,
  } = useStatisticsPageData({ period: periodPickerState.period, tauri, t });
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);
  const [consumptionModalTitle, setConsumptionModalTitle] = useState("");
  const [consumptionRows, setConsumptionRows] = useState<FilamentConsumptionRow[]>([]);
  const [consumptionLoading, setConsumptionLoading] = useState(false);
  const [consumptionError, setConsumptionError] = useState<string | null>(null);
  const [consumptionPrefs, setConsumptionPrefs] = useState<ConsumptionPopupPrefs>(() =>
    readConsumptionPopupPrefs(),
  );
  const [showBorrowerModal, setShowBorrowerModal] = useState(false);
  const [borrowerModalTitle, setBorrowerModalTitle] = useState("");
  const [borrowerRows, setBorrowerRows] = useState<BorrowerFilamentUsageRow[]>([]);
  const [borrowerLoading, setBorrowerLoading] = useState(false);
  const [borrowerError, setBorrowerError] = useState<string | null>(null);
  const [borrowerPrefs, setBorrowerPrefs] = useState<BorrowerPopupPrefs>(() =>
    readBorrowerPopupPrefs(),
  );
  const [borrowerModalDirection, setBorrowerModalDirection] =
    useState<LoanDirection>("OUTBOUND");
  const clientHostWarningVisible = shouldShowClientSnapshotWarning({
    clientReadOnly,
    initialLoadSettled: !loading,
    source: clientStatsSource === "PARTIAL" ? "CACHED" : clientStatsSource,
  });
  const [metricModalKind, setMetricModalKind] = useState<MetricModalKind | null>(null);
  const [slotOwnershipFilter, setSlotOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [loanUsageListFilter, setLoanUsageListFilter] =
    useState<LoanUsageListFilter>("ACTIVE");
  const desktopVisualQaScenarioRef = useRef(resolveDesktopVisualQaScenario());
  const desktopVisualQaActionStartedRef = useRef(false);
  const deferredConsumptionSearch = useDeferredValue(consumptionPrefs.search);
  const deferredBorrowerSearch = useDeferredValue(borrowerPrefs.search);
  const deferredConsumptionPrefs = useMemo<ConsumptionPopupPrefs>(
    () => ({
      search: deferredConsumptionSearch,
      vendorFilter: consumptionPrefs.vendorFilter,
      materialFilter: consumptionPrefs.materialFilter,
      ownershipFilter: consumptionPrefs.ownershipFilter,
      sort: consumptionPrefs.sort,
    }),
    [
      consumptionPrefs.materialFilter,
      consumptionPrefs.ownershipFilter,
      consumptionPrefs.sort,
      consumptionPrefs.vendorFilter,
      deferredConsumptionSearch,
    ],
  );
  const deferredBorrowerPrefs = useMemo<BorrowerPopupPrefs>(
    () => ({
      search: deferredBorrowerSearch,
    }),
    [deferredBorrowerSearch],
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(
        CONSUMPTION_PREFS_STORAGE_KEY,
        JSON.stringify(consumptionPrefs),
      );
    } catch {
      // Ignore persistence errors.
    }
  }, [consumptionPrefs]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(BORROWER_PREFS_STORAGE_KEY, JSON.stringify(borrowerPrefs));
    } catch {
      // Ignore persistence errors.
    }
  }, [borrowerPrefs]);

  const periodRangeLabel = useMemo(
    () => formatStatisticsPeriodRange(periodPickerState, locale),
    [locale, periodPickerState],
  );
  const currentTotals = useMemo(() => deriveStatisticsTotals(printers), [printers]);
  const periodPrinters = useMemo(
    () =>
      periodReport ? applyStatisticsPeriodReportToPrinters(printers, periodReport) : [],
    [periodReport, printers],
  );
  const totals = useMemo(
    () =>
      periodReport
        ? {
            totalUsed: periodReport.total_used_g,
            totalJobs: periodReport.total_jobs,
            failedJobs: periodReport.failed_jobs,
          }
        : null,
    [periodReport],
  );
  const ownershipOverview = useMemo(() => {
    const currentOverview =
      spoolRows.length > 0 ? deriveInventoryOverviewFromRows(spoolRows, []) : overview;
    if (!currentOverview) {
      return null;
    }
    return periodReport
      ? applyStatisticsPeriodReportToOverview(currentOverview, periodReport)
      : currentOverview;
  }, [overview, periodReport, spoolRows]);
  const consumptionForecast = useMemo(
    () =>
      buildConsumptionForecast({
        asOfDate:
          clientStatisticsUpdatedAt?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ??
          new Date().toISOString().slice(0, 10),
        ownedConsumption30d:
          overview?.owned_consumption_30d ?? 0,
        spools: spoolRows,
      }),
    [clientStatisticsUpdatedAt, overview, spoolRows],
  );
  const openConsumptionModal = useCallback(
    (printer?: PrinterOverviewRow) => {
      if (!tauri) {
        return;
      }
      const titleBase = printer
        ? `${t("statistics.consumptionByFilament", "Consumption by filament")} · ${printer.printer.name}`
        : t("statistics.consumptionByFilament", "Consumption by filament");
      setConsumptionModalTitle(`${titleBase} · ${periodRangeLabel}`);
      setShowConsumptionModal(true);
      setConsumptionLoading(false);
      if (!periodReport) {
        setConsumptionRows([]);
        setConsumptionError(
          t(
            "statistics.periodDetailsUnavailable",
            "Selected-period totals and filament or printer details are unavailable from this host snapshot. Update or reconnect the host.",
          ),
        );
        return;
      }
      const printerId = printer?.printer.id ?? null;
      setConsumptionRows(
        printerId
          ? periodReport.filament_consumption.filter(
              (row) => row.printer_id === printerId,
            )
          : periodReport.filament_consumption,
      );
      setConsumptionError(null);
    },
    [periodRangeLabel, periodReport, t, tauri],
  );

  const consumptionVendorOptions = useMemo(
    () => listConsumptionVendorOptions(consumptionRows),
    [consumptionRows],
  );

  useEffect(() => {
    if (loading || error) {
      return;
    }

    if (desktopVisualQaScenarioRef.current === "statistics-consumption") {
      if (desktopVisualQaActionStartedRef.current) {
        return;
      }
      desktopVisualQaActionStartedRef.current = true;
      openConsumptionModal();
      return;
    }

    if (desktopVisualQaScenarioRef.current !== "statistics-loans") {
      return;
    }
    const target = document.getElementById("statistics-outbound-loan-usage");
    if (!target) {
      return;
    }
    let scheduledFrameId: number | null = null;
    const revealLoanUsage = () => {
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
      scheduledFrameId = window.requestAnimationFrame(() => {
        scheduledFrameId = null;
        target.scrollIntoView({ behavior: "auto", block: "start" });
      });
    };

    revealLoanUsage();
    const timerIds = [150, 450, 900].map((delay) =>
      window.setTimeout(revealLoanUsage, delay),
    );
    window.addEventListener("resize", revealLoanUsage);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(revealLoanUsage);
    resizeObserver?.observe(target);

    return () => {
      timerIds.forEach((timerId) => window.clearTimeout(timerId));
      window.removeEventListener("resize", revealLoanUsage);
      resizeObserver?.disconnect();
      if (scheduledFrameId !== null) {
        window.cancelAnimationFrame(scheduledFrameId);
      }
    };
  }, [error, loading, openConsumptionModal]);

  const consumptionMaterialOptions = useMemo(
    () => listConsumptionMaterialOptions(consumptionRows),
    [consumptionRows],
  );

  const filteredConsumptionRows = useMemo(
    () => filterConsumptionRows(consumptionRows, deferredConsumptionPrefs),
    [consumptionRows, deferredConsumptionPrefs],
  );

  const filteredBorrowerRows = useMemo(
    () => filterBorrowerRows(borrowerRows, deferredBorrowerPrefs),
    [borrowerRows, deferredBorrowerPrefs],
  );

  const openBorrowerModal = useCallback(
    async (borrowerName: string, direction: LoanDirection) => {
      if (!tauri) {
        return;
      }
      setBorrowerModalDirection(direction);
      const inboundDirection = isInboundLoanDirection(direction);
      setBorrowerModalTitle(
        `${
          inboundDirection
            ? t("statistics.inboundUsageByFilament", "Borrowed-in usage by filament")
            : t("statistics.borrowerUsageByFilament", "Loan usage by filament")
        } · ${borrowerName}`,
      );
      setShowBorrowerModal(true);
      setBorrowerLoading(true);
      setBorrowerError(null);
      setBorrowerRows([]);
      try {
        const loanRows = await loadLoanBreakdownRows({
          clientReadOnly,
          cachedLoanDetails: loanDetails,
          direction,
        });
        const borrowerLoanRows = loanRows.filter(
          (row) =>
            isLoanDirection(row.loan.loan_direction, direction) &&
            loanPartyName(row) === borrowerName,
        );
        setBorrowerRows(groupedLoanUsage(borrowerLoanRows));
      } catch (loadError) {
        console.error(loadError);
        setBorrowerError(
          inboundDirection
            ? t("statistics.error.loadInboundBreakdown", "Failed to load owner breakdown.")
            : t("statistics.error.loadBorrowerBreakdown", "Failed to load borrower breakdown."),
        );
      } finally {
        setBorrowerLoading(false);
      }
    },
    [clientReadOnly, loanDetails, t, tauri],
  );

  useEffect(() => {
    if (
      loading ||
      error ||
      desktopVisualQaActionStartedRef.current ||
      desktopVisualQaScenarioRef.current !== "statistics-borrower"
    ) {
      return;
    }
    const borrower =
      loanUsage.find((row) => row.borrower_name === DESKTOP_VISUAL_QA_BORROWER_NAME)
        ?.borrower_name ??
      loanUsage.find((row) => row.total_consumed_g > 0)?.borrower_name ??
      loanUsage[0]?.borrower_name;
    if (!borrower) {
      return;
    }
    desktopVisualQaActionStartedRef.current = true;
    void openBorrowerModal(borrower, "OUTBOUND");
  }, [error, loading, loanUsage, openBorrowerModal]);

  const activeSlotRows = useMemo(() => buildActiveSlotRows(printers), [printers]);

  const filteredActiveSlotRows = useMemo(
    () => filterActiveSlotRows(activeSlotRows, slotOwnershipFilter),
    [activeSlotRows, slotOwnershipFilter],
  );

  const activeSlotOwnershipCounts = useMemo(
    () => countActiveSlotOwnerships(activeSlotRows),
    [activeSlotRows],
  );

  const failedPrinterRows = useMemo(
    () => sortFailedPrinterRows(periodPrinters),
    [periodPrinters],
  );

  const loggedPrinterRows = useMemo(
    () => sortLoggedPrinterRows(periodPrinters),
    [periodPrinters],
  );

  const filteredLoanUsage = useMemo(
    () => filterLoanUsageRows(loanUsage, loanUsageListFilter),
    [loanUsage, loanUsageListFilter],
  );

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.statistics", "Statistics")}</h1>
          <p className="page-subtitle">
            {t(
              "statistics.subtitle",
              "Track printer activity, filament usage and loan consumption in one place.",
            )}
          </p>
        </div>
      </div>

      <StatisticsPeriodPicker
        locale={locale}
        onApplyCustom={() => {
          setShowConsumptionModal(false);
          setMetricModalKind(null);
          setPeriodPickerState((current) => applyCustomStatisticsPeriod(current));
        }}
        onCustomDateChange={(field, value) =>
          setPeriodPickerState((current) =>
            updateCustomStatisticsPeriod(current, field, value),
          )
        }
        onOpenCustom={() =>
          setPeriodPickerState((current) => openCustomStatisticsPeriod(current))
        }
        onSelectPreset={(preset) => {
          setShowConsumptionModal(false);
          setMetricModalKind(null);
          setPeriodPickerState((current) =>
            selectStatisticsPeriodPreset(current, preset),
          );
        }}
        state={periodPickerState}
        t={t}
      />

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("statistics.desktopOnly", "Statistics are available in the desktop app build.")}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <PageLoadErrorBanner
          message={error}
          onRetry={() => void reloadData()}
          retryDisabled={!tauri || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}
      {clientHostWarningVisible && !error ? (
        <PageDataFallbackBanner
          message={[
            clientHostDeviceName ? `${clientHostDeviceName}. ` : "",
            clientStatsSource === "CACHED"
              ? t(
                  "statistics.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached statistics snapshot.",
                )
              : clientStatsSource === "PARTIAL"
                ? t(
                    "errors.requestFailed",
                    "The request could not be completed.",
                  )
              : t(
                  "statistics.clientReadOnlyOffline",
                  "Host unavailable and no cached statistics snapshot is available yet.",
                ),
            clientStatisticsUpdatedAt
              ? ` ${t("statistics.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientStatisticsUpdatedAt, locale)}.`
              : "",
            (clientStatsSource === "CACHED" || clientStatsSource === "PARTIAL") &&
            periodStatus !== "AVAILABLE"
              ? ` ${t(
                  "statistics.periodDetailsUnavailable",
                  "Selected-period totals and filament or printer details are unavailable from this host snapshot. Update or reconnect the host.",
                )}`
              : "",
          ].join("")}
          onRetry={() => void reloadData()}
          retryDisabled={!tauri || loading}
          retryLabel={t("common.refresh", "Refresh")}
          retrying={refreshing}
        />
      ) : null}
      {!loading && tauri && clientStatsSource === "LIVE" && periodStatus !== "AVAILABLE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t(
            "statistics.periodDetailsUnavailable",
            "Selected-period totals and filament or printer details are unavailable from this host snapshot. Update or reconnect the host.",
          )}
        </FeedbackBanner>
      ) : null}

      <div className="content-section grid grid-cols-1 gap-3 min-[720px]:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("statistics.totalConsumption", "Total Consumption")}
          value={totals ? gramsToKgText(totals.totalUsed, locale) : "—"}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={periodRangeLabel}
          accent="amber"
          actionLabel={t("statistics.viewDetails", "View details")}
          opensDialog
          onClick={() => {
            openConsumptionModal();
          }}
        />
        <StatCard
          title={t("statistics.loggedJobs", "Logged Jobs")}
          value={totals ? formatDisplayInteger(totals.totalJobs, locale) : "—"}
          subtitle={t("statistics.linkedActivity", "Printer-linked activity")}
          accent="sky"
          trend={periodRangeLabel}
          actionLabel={periodReport ? t("statistics.viewDetails", "View details") : undefined}
          opensDialog={periodReport != null}
          onClick={periodReport ? () => setMetricModalKind("LOGGED_JOBS") : undefined}
        />
        <StatCard
          title={t("statistics.activeAms", "Active loaded slots")}
          value={formatDisplayInteger(currentTotals.activeSlots, locale)}
          subtitle={t("statistics.assignedSlots", "Slots with assigned rolls")}
          trend={t("statistics.currentSnapshot", "Current snapshot")}
          accent="emerald"
          actionLabel={t("statistics.viewDetails", "View details")}
          opensDialog
          onClick={() => setMetricModalKind("ACTIVE_SLOTS")}
        />
        <StatCard
          title={t("statistics.failedJobs", "Failed Jobs")}
          value={totals ? formatDisplayInteger(totals.failedJobs, locale) : "—"}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={
            totals
              ? formatDisplayPercent(
                  totals.totalJobs > 0
                    ? (totals.failedJobs / totals.totalJobs) * 100
                    : 0,
                  locale,
                )
              : periodRangeLabel
          }
          accent="rose"
          actionLabel={periodReport ? t("statistics.viewDetails", "View details") : undefined}
          opensDialog={periodReport != null}
          onClick={periodReport ? () => setMetricModalKind("FAILED_JOBS") : undefined}
        />
      </div>

      <StatisticsOwnershipSnapshotPanel
        locale={locale}
        ownershipOverview={ownershipOverview}
        periodDataAvailable={periodReport != null}
        periodLabel={periodRangeLabel}
        t={t}
      />

      <StatisticsValueCostPanel
        filamentDefaultsManagedOnHost={clientReadOnly}
        hostUpgradeRequired={
          clientReadOnly &&
          (periodStatus === "LEGACY_HOST" ||
            (periodReport != null && periodReport.value_cost == null))
        }
        loading={loading}
        locale={locale}
        onOpenFilamentDefaults={onOpenFilamentDefaults}
        periodLabel={periodRangeLabel}
        report={periodReport?.value_cost ?? null}
        t={t}
      />

      <StatisticsForecastPanel
        forecast={consumptionForecast}
        locale={locale}
        t={t}
      />

      <StatisticsPerPrinterUsagePanel
        loading={loading}
        locale={locale}
        onOpenConsumption={(row) => {
          openConsumptionModal(row);
        }}
        periodLabel={periodRangeLabel}
        periodUnavailableMessage={
          periodReport
            ? null
            : t(
                "statistics.periodDetailsUnavailable",
                "Selected-period totals and filament or printer details are unavailable from this host snapshot. Update or reconnect the host.",
              )
        }
        printerCount={printers.length}
        printers={periodPrinters}
        resolvedTheme={resolvedTheme}
        t={t}
      />

      {showConsumptionModal ? (
        <StatisticsConsumptionModal
          consumptionError={consumptionError}
          consumptionLoading={consumptionLoading}
          consumptionMaterialOptions={consumptionMaterialOptions}
          consumptionModalTitle={consumptionModalTitle}
          consumptionPrefs={consumptionPrefs}
          consumptionRows={consumptionRows}
          consumptionVendorOptions={consumptionVendorOptions}
          filteredConsumptionRows={filteredConsumptionRows}
          locale={locale}
          onClose={() => setShowConsumptionModal(false)}
          setConsumptionPrefs={setConsumptionPrefs}
          t={t}
        />
      ) : null}

      <StatisticsOutboundLoanUsagePanel
        filteredLoanUsage={filteredLoanUsage}
        locale={locale}
        loading={loading}
        loanUsageListFilter={loanUsageListFilter}
        onOpenBorrower={(borrowerName) => {
          void openBorrowerModal(borrowerName, "OUTBOUND");
        }}
        setLoanUsageListFilter={setLoanUsageListFilter}
        t={t}
      />

      <StatisticsInboundLoanUsagePanel
        inboundLoanUsage={inboundLoanUsage}
        locale={locale}
        loading={loading}
        onOpenOwner={(ownerName) => {
          void openBorrowerModal(ownerName, "INBOUND");
        }}
        t={t}
      />

      {showBorrowerModal ? (
        <StatisticsBorrowerUsageModal
          borrowerError={borrowerError}
          borrowerLoading={borrowerLoading}
          borrowerModalDirection={borrowerModalDirection}
          borrowerModalTitle={borrowerModalTitle}
          borrowerPrefs={borrowerPrefs}
          borrowerRows={borrowerRows}
          filteredBorrowerRows={filteredBorrowerRows}
          locale={locale}
          onClose={() => setShowBorrowerModal(false)}
          setBorrowerPrefs={setBorrowerPrefs}
          t={t}
        />
      ) : null}

      {metricModalKind ? (
        <StatisticsMetricDetailModal
          activeSlotOwnershipCounts={activeSlotOwnershipCounts}
          activeSlotRows={activeSlotRows}
          failedPrinterRows={failedPrinterRows}
          filteredActiveSlotRows={filteredActiveSlotRows}
          locale={locale}
          loggedPrinterRows={loggedPrinterRows}
          metricModalKind={metricModalKind}
          onClose={() => setMetricModalKind(null)}
          resolvedTheme={resolvedTheme}
          periodLabel={periodRangeLabel}
          setSlotOwnershipFilter={setSlotOwnershipFilter}
          slotOwnershipFilter={slotOwnershipFilter}
          t={t}
        />
      ) : null}
    </div>
  );
}
