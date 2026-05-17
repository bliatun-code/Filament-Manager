import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AppModal } from "../components/app_modal";
import { StatCard } from "../components/dashboard_widgets";
import { FeedbackBanner } from "../components/feedback_banner";
import { ModalHeader } from "../components/modal_chrome";
import { modalPanelClassName } from "../components/modal_panel_class";
import { formatDateTime } from "../lib/date_time";
import { useI18n } from "../lib/i18n";
import {
  buildActiveSlotRows,
  countActiveSlotOwnerships,
  DEFAULT_BORROWER_PREFS,
  DEFAULT_CONSUMPTION_PREFS,
  filterActiveSlotRows,
  filterBorrowerRows,
  filterConsumptionRows,
  filterLoanUsageRows,
  gramsToKgText,
  groupedLoanUsage,
  listConsumptionMaterialOptions,
  listConsumptionVendorOptions,
  normalizeLoanDirection,
  ownershipBadgeClass,
  ownershipLabel,
  parseConsumptionSort,
  parseOwnershipFilter,
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
  loadStatisticsPageData,
} from "../lib/statistics_data_source";
import { useResolvedTheme } from "../lib/theme_mode";
import {
  isTauri,
  type FilamentConsumptionRow,
  type InventoryOverview,
  type LoanUsageByPersonRow,
  type PrinterOverviewRow,
  type SpoolWithMasterRow,
  type SpoolLoanDetailsRow,
} from "../lib/tauri_client";
import {
  statisticsFilterButtonClass,
  statisticsFilterInputClass,
  statisticsFilterSelectClass,
} from "./statistics_view_helpers";
import {
  StatisticsEmptyState,
  StatisticsFilamentUsageRowCard,
  StatisticsInboundLoanUsagePanel,
  StatisticsMetricDetailModal,
  StatisticsOwnershipSnapshotPanel,
  StatisticsOutboundLoanUsagePanel,
  StatisticsPerPrinterUsagePanel,
  SummaryMetricTile,
} from "./statistics_ui";

function loanPartyName(row: SpoolLoanDetailsRow): string {
  return (row.loan.counterparty_name ?? "").trim() || row.loan.borrower_name;
}

export default function StatisticsPage() {
  const { t, locale } = useI18n();
  const resolvedTheme = useResolvedTheme();
  const tauri = isTauri();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [printers, setPrinters] = useState<PrinterOverviewRow[]>([]);
  const [spoolRows, setSpoolRows] = useState<SpoolWithMasterRow[]>([]);
  const [overviewConsumptionRows, setOverviewConsumptionRows] = useState<FilamentConsumptionRow[]>(
    [],
  );
  const [loanUsage, setLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [inboundLoanUsage, setInboundLoanUsage] = useState<LoanUsageByPersonRow[]>([]);
  const [loanDetails, setLoanDetails] = useState<SpoolLoanDetailsRow[]>([]);
  const [loading, setLoading] = useState(tauri);
  const [error, setError] = useState<string | null>(null);
  const [clientReadOnly, setClientReadOnly] = useState(false);
  const [clientHostDeviceName, setClientHostDeviceName] = useState<string | null>(null);
  const [clientHostBaseUrl, setClientHostBaseUrl] = useState<string | null>(null);
  const [clientLibraryId, setClientLibraryId] = useState<string | null>(null);
  const [clientStatsSource, setClientStatsSource] = useState<"LIVE" | "CACHED" | "OFFLINE">(
    "OFFLINE",
  );
  const [clientStatisticsUpdatedAt, setClientStatisticsUpdatedAt] = useState<string | null>(null);
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

  const loadStatistics = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!tauri) {
        return;
      }
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await loadStatisticsPageData();
        const { syncState } = result;

        setClientReadOnly(syncState.clientReadOnly);
        setClientHostDeviceName(syncState.clientHostDeviceName);
        setClientHostBaseUrl(syncState.clientHostBaseUrl);
        setClientLibraryId(syncState.clientLibraryId);

        setOverview(result.overview ? { ...result.overview } : null);
        setPrinters(result.printers);
        setSpoolRows([...result.spoolRows]);
        setOverviewConsumptionRows([...result.consumptionRows]);
        setLoanDetails(result.loanDetails);
        setLoanUsage(result.loanUsage);
        setInboundLoanUsage(result.inboundLoanUsage);
        setClientStatisticsUpdatedAt(result.updatedAt);
        setClientStatsSource(result.source);
      } catch (loadError) {
        console.error(loadError);
        setError(t("statistics.error.load", "Failed to load statistics."));
      } finally {
        if (!options?.silent) {
          setLoading(false);
        }
      }
    },
    [t, tauri],
  );

  useEffect(() => {
    void loadStatistics();
  }, [loadStatistics]);

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
      if (clientReadOnly) {
        if (!clientHostBaseUrl || !clientLibraryId) {
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
          clientHostBaseUrl,
          clientLibraryId,
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
      setBorrowerModalTitle(
        `${
          direction === "INBOUND"
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
            normalizeLoanDirection(row.loan.loan_direction) === direction &&
            loanPartyName(row) === borrowerName,
        );
        setBorrowerRows(groupedLoanUsage(borrowerLoanRows));
      } catch (loadError) {
        console.error(loadError);
        setBorrowerError(
          direction === "INBOUND"
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
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => setShowConsumptionModal(false)}
          panelClassName={modalPanelClassName("xl")}
        >
          <ModalHeader
            eyebrow={t("nav.statistics", "Statistics")}
            title={consumptionModalTitle}
            onClose={() => setShowConsumptionModal(false)}
            closeLabel={t("common.close", "Close")}
            className="-mx-5 -mt-5"
          />

          {consumptionLoading ? (
            <div className="mt-4 text-sm text-slate-500">
              {t("statistics.loadingFilamentBreakdown", "Loading filament breakdown...")}
            </div>
          ) : null}
          {consumptionError ? (
            <FeedbackBanner tone="danger" className="mt-4">
              {consumptionError}
            </FeedbackBanner>
          ) : null}
          {!consumptionLoading && !consumptionError && consumptionRows.length > 0 ? (
            <div className="surface-subtle mt-4 grid grid-cols-1 gap-2 p-3 md:grid-cols-2 xl:grid-cols-6">
              <input
                type="search"
                value={consumptionPrefs.search}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder={t(
                  "statistics.searchFilamentPlaceholder",
                  "Search filament, color, vendor or owner",
                )}
                className={`${statisticsFilterInputClass} xl:col-span-2`}
              />
              <select
                value={consumptionPrefs.vendorFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    vendorFilter: event.target.value,
                  }))
                }
                className={statisticsFilterSelectClass}
              >
                {consumptionVendorOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL"
                      ? `${t("statistics.filterVendor", "Vendor")}: ${t("common.all", "All")}`
                      : option}
                  </option>
                ))}
              </select>
              <select
                value={consumptionPrefs.materialFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    materialFilter: event.target.value,
                  }))
                }
                className={statisticsFilterSelectClass}
              >
                {consumptionMaterialOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "ALL"
                      ? `${t("statistics.filterMaterial", "Material")}: ${t("common.all", "All")}`
                      : option}
                  </option>
                ))}
              </select>
              <select
                value={consumptionPrefs.ownershipFilter}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    ownershipFilter: parseOwnershipFilter(event.target.value),
                  }))
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
              <select
                value={consumptionPrefs.sort}
                onChange={(event) =>
                  setConsumptionPrefs((current) => ({
                    ...current,
                    sort: parseConsumptionSort(event.target.value),
                  }))
                }
                className={statisticsFilterSelectClass}
              >
                <option value="USED_DESC">{t("statistics.sortUsedDesc", "Most used")}</option>
                <option value="USED_ASC">{t("statistics.sortUsedAsc", "Least used")}</option>
                <option value="JOBS_DESC">{t("statistics.sortJobsDesc", "Most jobs")}</option>
                <option value="NAME_ASC">{t("statistics.sortNameAsc", "Name (A-Z)")}</option>
              </select>
              <button
                type="button"
                onClick={() =>
                  setConsumptionPrefs({
                    ...DEFAULT_CONSUMPTION_PREFS,
                  })
                }
                className={`${statisticsFilterButtonClass} md:col-span-2 xl:col-span-2`}
              >
                {t("statistics.resetFilters", "Reset filters")}
              </button>
            </div>
          ) : null}
          {!consumptionLoading && !consumptionError && consumptionRows.length === 0 ? (
            <StatisticsEmptyState>
              {t(
                "statistics.noFilamentBreakdown",
                "No filament consumption has been logged yet.",
              )}
            </StatisticsEmptyState>
          ) : null}
          {!consumptionLoading &&
          !consumptionError &&
          consumptionRows.length > 0 &&
          filteredConsumptionRows.length === 0 ? (
            <StatisticsEmptyState>
              {t("statistics.noFilamentFilterMatch", "No rows match current filters.")}
            </StatisticsEmptyState>
          ) : null}
          {!consumptionLoading && !consumptionError && filteredConsumptionRows.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {filteredConsumptionRows.map((row, index) => (
                <StatisticsFilamentUsageRowCard
                  key={`${row.printer_id ?? "all"}-${row.material}-${row.filament_name}-${row.color_name}-${row.vendor}-${row.ownership_type}-${row.owner_name ?? ""}-${index}`}
                  colorName={row.color_name}
                  filamentName={row.filament_name}
                  material={row.material}
                  metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[12rem]"
                  meta={
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${ownershipBadgeClass(row.ownership_type)}`}
                    >
                      {ownershipLabel(t, row.ownership_type, row.owner_name)}
                    </span>
                  }
                  swatchColor={row.hex_color}
                  vendor={row.vendor}
                >
                  <SummaryMetricTile
                    label={t("printers.jobs", "Jobs")}
                    value={row.jobs.toString()}
                    tone="sky"
                  />
                  <SummaryMetricTile
                    label={t("printers.used", "Used")}
                    value={`${row.used_grams} g`}
                    tone="amber"
                  />
                </StatisticsFilamentUsageRowCard>
              ))}
            </div>
          ) : null}
        </AppModal>
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
        <AppModal
          closeOnBackdrop
          onBackdropClose={() => setShowBorrowerModal(false)}
          panelClassName={modalPanelClassName("xl")}
        >
          <ModalHeader
            eyebrow={
              borrowerModalDirection === "INBOUND"
                ? t("statistics.inboundUsage", "Borrowed-in usage by owner")
                : t("statistics.borrowerUsage", "Loan usage by person")
            }
            title={borrowerModalTitle}
            onClose={() => setShowBorrowerModal(false)}
            closeLabel={t("common.close", "Close")}
            className="-mx-5 -mt-5"
          />

          {borrowerLoading ? (
            <div className="mt-4 text-sm text-slate-500">
              {borrowerModalDirection === "INBOUND"
                ? t("statistics.loadingInboundBreakdown", "Loading owner breakdown...")
                : t("statistics.loadingBorrowerBreakdown", "Loading borrower breakdown...")}
            </div>
          ) : null}
          {borrowerError ? (
            <FeedbackBanner tone="danger" className="mt-4">
              {borrowerError}
            </FeedbackBanner>
          ) : null}
          {!borrowerLoading && !borrowerError && borrowerRows.length > 0 ? (
            <div className="surface-subtle mt-4 flex flex-col gap-2 p-3 sm:flex-row">
              <input
                type="search"
                value={borrowerPrefs.search}
                onChange={(event) =>
                  setBorrowerPrefs((current) => ({
                    ...current,
                    search: event.target.value,
                  }))
                }
                placeholder={t(
                  "statistics.searchBorrowerFilamentPlaceholder",
                  "Search filament, color or vendor",
                )}
                className={`w-full ${statisticsFilterInputClass}`}
              />
              <button
                type="button"
                onClick={() =>
                  setBorrowerPrefs({
                    ...DEFAULT_BORROWER_PREFS,
                  })
                }
                className={`${statisticsFilterButtonClass} sm:w-auto`}
              >
                {t("statistics.resetFilters", "Reset filters")}
              </button>
            </div>
          ) : null}
          {!borrowerLoading && !borrowerError && borrowerRows.length === 0 ? (
            <StatisticsEmptyState>
              {borrowerModalDirection === "INBOUND"
                ? t("statistics.noInboundBreakdown", "No borrowed-in owner usage recorded yet.")
                : t("statistics.noBorrowerBreakdown", "No borrower usage recorded yet.")}
            </StatisticsEmptyState>
          ) : null}
          {!borrowerLoading &&
          !borrowerError &&
          borrowerRows.length > 0 &&
          filteredBorrowerRows.length === 0 ? (
            <StatisticsEmptyState>
              {t("statistics.noBorrowerFilterMatch", "No rows match current filters.")}
            </StatisticsEmptyState>
          ) : null}
          {!borrowerLoading && !borrowerError && filteredBorrowerRows.length > 0 ? (
            <div className="mt-4 max-h-[420px] space-y-3 overflow-auto pr-1">
              {filteredBorrowerRows.map((row, index) => (
                <StatisticsFilamentUsageRowCard
                  key={`${row.material}-${row.filamentName}-${row.colorName}-${row.vendor}-${index}`}
                  colorName={row.colorName}
                  filamentName={row.filamentName}
                  material={row.material}
                  metricsClassName="grid w-full grid-cols-2 gap-2 min-[960px]:w-auto min-[960px]:min-w-[18rem] min-[960px]:grid-cols-3"
                  swatchColor={row.hexColor}
                  vendor={row.vendor}
                >
                  <SummaryMetricTile
                    label={t("printers.used", "Used")}
                    value={`${row.consumedGrams} g`}
                    tone="amber"
                  />
                  <SummaryMetricTile
                    label={
                      borrowerModalDirection === "INBOUND"
                        ? t("statistics.borrowedInShort", "In")
                        : t("statistics.lentOutShort", "Out")
                    }
                    value={`${row.lentOutGrams} g`}
                    tone="sky"
                  />
                  <SummaryMetricTile
                    label={t("statistics.loansShort", "Loans")}
                    value={`${row.loans} · ${row.activeLoans} ${t("common.active", "Active")}`}
                    tone="slate"
                    className="col-span-2 min-[960px]:col-span-1"
                  />
                </StatisticsFilamentUsageRowCard>
              ))}
            </div>
          ) : null}
        </AppModal>
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
