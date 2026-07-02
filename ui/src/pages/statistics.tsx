import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { StatCard } from "../components/dashboard_widgets";
import { FeedbackBanner } from "../components/feedback_banner";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
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
  loadFilamentConsumptionBreakdown,
  loadLoanBreakdownRows,
} from "../lib/statistics_data_source";
import { resolveClientHostTarget } from "../lib/host_write_target";
import { useResolvedTheme } from "../lib/theme_mode";
import {
  isTauri,
  type FilamentConsumptionRow,
  type PrinterOverviewRow,
  type SpoolLoanDetailsRow,
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
import { useStatisticsPageData } from "./use_statistics_page_data";

function loanPartyName(row: SpoolLoanDetailsRow): string {
  return (row.loan.counterparty_name ?? "").trim() || row.loan.borrower_name;
}

export default function StatisticsPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const {
    clientHostBaseUrl,
    clientHostDeviceName,
    clientLibraryId,
    clientReadOnly,
    clientStatisticsUpdatedAt,
    clientStatsSource,
    error,
    inboundLoanUsage,
    loading,
    loanDetails,
    loanUsage,
    overview,
    overviewConsumptionRows,
    printers,
    spoolRows,
  } = useStatisticsPageData({ tauri, t });
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
  const [metricModalKind, setMetricModalKind] = useState<MetricModalKind | null>(null);
  const [slotOwnershipFilter, setSlotOwnershipFilter] = useState<OwnershipFilter>("ALL");
  const [loanUsageListFilter, setLoanUsageListFilter] =
    useState<LoanUsageListFilter>("ACTIVE");
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

  const totals = useMemo(() => deriveStatisticsTotals(printers), [printers]);
  const ownershipOverview = useMemo(() => {
    if (spoolRows.length > 0 || overviewConsumptionRows.length > 0) {
      return deriveInventoryOverviewFromRows(spoolRows, overviewConsumptionRows);
    }
    return overview;
  }, [overview, overviewConsumptionRows, spoolRows]);
  const openConsumptionModal = useCallback(
    async (printer?: PrinterOverviewRow) => {
      if (!tauri) {
        return;
      }
      const title = printer
        ? `${t("statistics.consumptionByFilament", "Consumption by filament")} · ${printer.printer.name}`
        : t("statistics.consumptionByFilament", "Consumption by filament");
      const hostTarget = clientReadOnly
        ? resolveClientHostTarget({ clientHostBaseUrl, clientLibraryId })
        : null;
      if (clientReadOnly) {
        if (!hostTarget) {
          setConsumptionModalTitle(title);
          setShowConsumptionModal(true);
          setConsumptionLoading(false);
          setConsumptionRows([]);
          setConsumptionError(
            t(
              "statistics.clientHostBreakdownOnly",
              "Detailed filament breakdown is currently available on the host device.",
            ),
          );
          return;
        }
      }
      const printerId = printer?.printer.id ?? null;
      setConsumptionModalTitle(title);
      setShowConsumptionModal(true);
      setConsumptionLoading(true);
      setConsumptionError(null);
      try {
        const rows = await loadFilamentConsumptionBreakdown({
          clientReadOnly,
          clientHostBaseUrl: hostTarget?.baseUrl ?? clientHostBaseUrl,
          clientLibraryId: hostTarget?.libraryId ?? clientLibraryId,
          printerId,
        });
        setConsumptionRows(rows);
      } catch (loadError) {
        console.error(loadError);
        setConsumptionRows([]);
        setConsumptionError(
          t("statistics.error.loadFilamentBreakdown", "Failed to load filament breakdown."),
        );
      } finally {
        setConsumptionLoading(false);
      }
    },
    [clientHostBaseUrl, clientLibraryId, clientReadOnly, t, tauri],
  );

  const consumptionVendorOptions = useMemo(
    () => listConsumptionVendorOptions(consumptionRows),
    [consumptionRows],
  );

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

  const activeSlotRows = useMemo(() => buildActiveSlotRows(printers), [printers]);

  const filteredActiveSlotRows = useMemo(
    () => filterActiveSlotRows(activeSlotRows, slotOwnershipFilter),
    [activeSlotRows, slotOwnershipFilter],
  );

  const activeSlotOwnershipCounts = useMemo(
    () => countActiveSlotOwnerships(activeSlotRows),
    [activeSlotRows],
  );

  const failedPrinterRows = useMemo(() => sortFailedPrinterRows(printers), [printers]);

  const loggedPrinterRows = useMemo(() => sortLoggedPrinterRows(printers), [printers]);

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

      {!tauri ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {t("statistics.desktopOnly", "Statistics are available in the desktop app build.")}
        </FeedbackBanner>
      ) : null}
      {error ? (
        <FeedbackBanner tone="danger" className="mt-4">
          {error}
        </FeedbackBanner>
      ) : null}
      {clientReadOnly && clientStatsSource !== "LIVE" ? (
        <FeedbackBanner tone="warning" className="mt-4">
          {[
            clientHostDeviceName
              ? `${clientHostDeviceName}. `
              : "",
            clientStatsSource === "CACHED"
              ? t(
                  "statistics.clientReadOnlyCached",
                  "Host unavailable. Showing the last cached statistics snapshot.",
                )
              : t(
                  "statistics.clientReadOnlyOffline",
                  "Host unavailable and no cached statistics snapshot is available yet.",
                ),
            clientStatisticsUpdatedAt
              ? ` ${t("statistics.clientReadOnlyUpdated", "Updated")}: ${formatDateTime(clientStatisticsUpdatedAt, locale)}.`
              : "",
          ].join("")}
        </FeedbackBanner>
      ) : null}

      <div className="content-section grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("statistics.totalConsumption", "Total Consumption")}
          value={gramsToKgText(totals.totalUsed)}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={`${totals.totalUsed} g`}
          accent="amber"
          onClick={() => {
            void openConsumptionModal();
          }}
        />
        <StatCard
          title={t("statistics.loggedJobs", "Logged Jobs")}
          value={totals.totalJobs.toString()}
          subtitle={t("statistics.linkedActivity", "Printer-linked activity")}
          trend={`${printers.length} ${t("nav.printers", "printers")}`}
          accent="sky"
          onClick={() => setMetricModalKind("LOGGED_JOBS")}
        />
        <StatCard
          title={t("statistics.activeAms", "Active loaded slots")}
          value={totals.activeSlots.toString()}
          subtitle={t("statistics.assignedSlots", "Slots with assigned rolls")}
          trend={t("statistics.currentSnapshot", "Current snapshot")}
          accent="emerald"
          onClick={() => setMetricModalKind("ACTIVE_SLOTS")}
        />
        <StatCard
          title={t("statistics.failedJobs", "Failed Jobs")}
          value={totals.failedJobs.toString()}
          subtitle={t("statistics.acrossPrinters", "Across all printers")}
          trend={totals.totalJobs > 0 ? `${Math.round((totals.failedJobs / totals.totalJobs) * 100)}%` : "0%"}
          accent="rose"
          onClick={() => setMetricModalKind("FAILED_JOBS")}
        />
      </div>

      <StatisticsOwnershipSnapshotPanel ownershipOverview={ownershipOverview} t={t} />

      <StatisticsPerPrinterUsagePanel
        loading={loading}
        onOpenConsumption={(row) => {
          void openConsumptionModal(row);
        }}
        printers={printers}
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
          onClose={() => setShowConsumptionModal(false)}
          setConsumptionPrefs={setConsumptionPrefs}
          t={t}
        />
      ) : null}

      <StatisticsOutboundLoanUsagePanel
        filteredLoanUsage={filteredLoanUsage}
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
          loggedPrinterRows={loggedPrinterRows}
          metricModalKind={metricModalKind}
          onClose={() => setMetricModalKind(null)}
          resolvedTheme={resolvedTheme}
          setSlotOwnershipFilter={setSlotOwnershipFilter}
          slotOwnershipFilter={slotOwnershipFilter}
          t={t}
        />
      ) : null}
    </div>
  );
}
