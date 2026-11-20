import {
  fetchCachedLibrarySyncSpools,
  fetchCachedLibrarySyncLoans,
  fetchCachedLibrarySyncPrinterOverview,
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncStatisticsPeriodReport,
  getLibrarySyncPageStatus,
  inventoryOverview,
  listLoanUsageByPerson,
  listPrinterOverview,
  listSpoolLoans,
  statisticsPeriodReport,
  type InventoryOverview,
  type LibrarySyncPageStatus,
  type LoanUsageByPersonRow,
  type PrinterOverviewRow,
  type FilamentConsumptionRow,
  type StatisticsPeriod,
  type StatisticsPeriodReport,
  type SpoolLoanDetailsRow,
} from "./tauri_client";
import { loadAllSpoolRows } from "./spool_data_source";
import { isLoanCurrentlyActive, isLoanReturned } from "./loan_state";
import { deriveInventoryOverviewFromRows } from "./statistics_model";
import { isLoanDirection, type LoanDirection } from "./inventory_domain";
import {
  normalizeLoanDetailsRow,
  type NormalizedLoanDetailsRow,
} from "./loan_row_normalization";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import {
  resolveClientHostCacheTarget,
  resolveClientHostTarget,
} from "./host_write_target";
import { firstDefinedTimestamp } from "./source_timestamps";

export type StatisticsSnapshotSource = "LIVE" | "CACHED" | "PARTIAL" | "OFFLINE";
export type StatisticsPeriodDataStatus = "AVAILABLE" | "LEGACY_HOST" | "UNAVAILABLE";
export type StatisticsLibrarySyncState = LibrarySyncPageState;
export type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
export type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";

export type StatisticsDataLoadResult = {
  overview: InventoryOverview | null;
  printers: PrinterOverviewRow[];
  spoolRows: NormalizedSpoolWithMasterRow[];
  consumptionRows: FilamentConsumptionRow[];
  loanDetails: NormalizedLoanDetailsRow[];
  loanUsage: LoanUsageByPersonRow[];
  inboundLoanUsage: LoanUsageByPersonRow[];
  periodReport: StatisticsPeriodReport | null;
  periodStatus: StatisticsPeriodDataStatus;
  updatedAt: string | null;
  source: StatisticsSnapshotSource;
};

export type StatisticsPageDataLoadResult = StatisticsDataLoadResult & {
  syncState: StatisticsLibrarySyncState;
};

export type LoanBreakdownRowsOptions = {
  clientReadOnly: boolean;
  cachedLoanDetails: NormalizedLoanDetailsRow[];
  direction?: string | null;
  limit?: number;
};

type LoanBreakdownRowsDependencies = {
  listLocalLoans?: typeof listSpoolLoans;
};

type StatisticsPageDataDependencies = {
  loadSyncStatus?: typeof getLibrarySyncPageStatus;
  loadData?: typeof loadStatisticsData;
};

type StatisticsDataDependencies = {
  fetchHostSnapshot?: typeof fetchLibrarySyncSnapshot;
  fetchHostPrinterOverview?: typeof fetchLibrarySyncPrinterOverview;
  fetchHostLoans?: typeof fetchLibrarySyncLoans;
  fetchHostPeriodReport?: typeof fetchLibrarySyncStatisticsPeriodReport;
  fetchCachedPrinterOverview?: typeof fetchCachedLibrarySyncPrinterOverview;
  fetchCachedLoans?: typeof fetchCachedLibrarySyncLoans;
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
  loadHostSpools?: typeof loadAllSpoolRows;
  loadLocalSpools?: typeof loadAllSpoolRows;
  loadLocalOverview?: typeof inventoryOverview;
  listLocalLoanUsageByPerson?: typeof listLoanUsageByPerson;
  listLocalPrinterOverview?: typeof listPrinterOverview;
  loadLocalPeriodReport?: typeof statisticsPeriodReport;
};

function normalizeLoanDetailsRows(rows: SpoolLoanDetailsRow[]): NormalizedLoanDetailsRow[] {
  return rows.map(normalizeLoanDetailsRow);
}

export function deriveStatisticsLibrarySyncState(
  syncSettings: LibrarySyncPageStatus,
): StatisticsLibrarySyncState {
  return deriveLibrarySyncPageState(syncSettings);
}

export function groupLoanUsageByPerson(
  rows: NormalizedLoanDetailsRow[],
  direction: LoanDirection,
): LoanUsageByPersonRow[] {
  const grouped = new Map<string, LoanUsageByPersonRow>();
  for (const row of rows) {
    if (!isLoanDirection(row.loan.loan_direction, direction)) {
      continue;
    }
    const partyName =
      ((row.loan.counterparty_name ?? "").trim() || row.loan.borrower_name).trim();
    if (!partyName) {
      continue;
    }
    const current = grouped.get(partyName) ?? {
      loan_direction: direction,
      borrower_name: partyName,
      total_consumed_g: 0,
      completed_loans: 0,
      active_loans: 0,
    };
    grouped.set(partyName, {
      ...current,
      total_consumed_g: current.total_consumed_g + Math.max(0, row.loan.consumed_grams ?? 0),
      completed_loans: current.completed_loans + (isLoanReturned(row) ? 1 : 0),
      active_loans: current.active_loans + (isLoanCurrentlyActive(row) ? 1 : 0),
    });
  }
  return Array.from(grouped.values()).sort((left, right) => {
    if (right.active_loans !== left.active_loans) {
      return right.active_loans - left.active_loans;
    }
    if (right.total_consumed_g !== left.total_consumed_g) {
      return right.total_consumed_g - left.total_consumed_g;
    }
    return left.borrower_name.localeCompare(right.borrower_name);
  });
}

function emptyStatisticsData(): StatisticsDataLoadResult {
  return {
    overview: null,
    printers: [],
    spoolRows: [],
    consumptionRows: [],
    loanDetails: [],
    loanUsage: [],
    inboundLoanUsage: [],
    periodReport: null,
    periodStatus: "UNAVAILABLE",
    updatedAt: null,
    source: "OFFLINE",
  };
}

export async function loadStatisticsPageData(
  period: StatisticsPeriod,
  dependencies: StatisticsPageDataDependencies = {},
): Promise<StatisticsPageDataLoadResult> {
  const loadSyncStatus = dependencies.loadSyncStatus ?? getLibrarySyncPageStatus;
  const loadData = dependencies.loadData ?? loadStatisticsData;
  let status = await loadSyncStatus();
  // A Host switch invalidates successful replies as well as cached fallbacks.
  // Retry once for the replacement target, even when the URL cycles back to A.
  for (let attempt = 0; attempt < 2; attempt++) {
    const data = await loadData(status, period);
    const current = await loadSyncStatus();
    if (
      current.mode === status.mode &&
      current.host_base_url === status.host_base_url &&
      current.library_id === status.library_id &&
      current.target_generation === status.target_generation
    ) {
      return { ...data, syncState: deriveStatisticsLibrarySyncState(current) };
    }
    status = current;
  }
  return { ...emptyStatisticsData(), syncState: deriveStatisticsLibrarySyncState(status) };
}

export async function loadLoanBreakdownRows(
  options: LoanBreakdownRowsOptions,
  dependencies: LoanBreakdownRowsDependencies = {},
): Promise<NormalizedLoanDetailsRow[]> {
  if (options.clientReadOnly) {
    return normalizeLoanDetailsRows(options.cachedLoanDetails);
  }

  const listLocalLoans = dependencies.listLocalLoans ?? listSpoolLoans;
  return normalizeLoanDetailsRows(
    await listLocalLoans(options.limit ?? 2000, true, options.direction ?? null),
  );
}

export async function loadStatisticsData(
  syncSettings: LibrarySyncPageStatus,
  period: StatisticsPeriod,
  dependencies: StatisticsDataDependencies = {},
): Promise<StatisticsDataLoadResult> {
  const syncState = deriveStatisticsLibrarySyncState(syncSettings);
  const hostTarget = syncState.clientReadOnly ? resolveClientHostTarget(syncState) : null;
  const cacheTarget = syncState.clientReadOnly
    ? resolveClientHostCacheTarget(syncState)
    : null;

  if (hostTarget) {
    const fetchHostSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
    const fetchHostPrinterOverview =
      dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
    const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
    const fetchHostPeriodReport =
      dependencies.fetchHostPeriodReport ?? fetchLibrarySyncStatisticsPeriodReport;
    const fetchCachedPrinterOverview =
      dependencies.fetchCachedPrinterOverview ?? fetchCachedLibrarySyncPrinterOverview;
    const fetchCachedLoans = dependencies.fetchCachedLoans ?? fetchCachedLibrarySyncLoans;
    const fetchCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;
    const loadHostSpools = dependencies.loadHostSpools ?? loadAllSpoolRows;
    const { baseUrl, libraryId } = hostTarget;
    const [snapshotResult, printersResult, loansResult, spoolsResult, periodReportResult] =
      await Promise.allSettled([
        fetchHostSnapshot(baseUrl, libraryId),
        fetchHostPrinterOverview(baseUrl, libraryId),
        fetchHostLoans(baseUrl, libraryId),
        loadHostSpools({
          clientReadOnly: true,
          clientHostBaseUrl: baseUrl,
          clientLibraryId: libraryId,
          clientTargetGeneration: syncSettings.target_generation ?? null,
        }),
        fetchHostPeriodReport(baseUrl, libraryId, period),
      ]);

    // Each fallback is scoped to the target captured before the Host requests.
    const [cachedPrinters, cachedLoans, cachedSpools] = await Promise.all([
      printersResult.status === "rejected" && cacheTarget
        ? fetchCachedPrinterOverview(
            cacheTarget.baseUrl, cacheTarget.libraryId, cacheTarget.targetGeneration,
          ).catch(() => null)
        : null,
      loansResult.status === "rejected" && cacheTarget
        ? fetchCachedLoans(
            cacheTarget.baseUrl, cacheTarget.libraryId, cacheTarget.targetGeneration,
          ).catch(() => null)
        : null,
      spoolsResult.status === "rejected" && cacheTarget
        ? fetchCachedSpools(
            cacheTarget.baseUrl, cacheTarget.libraryId, cacheTarget.targetGeneration,
          ).catch(() => null)
        : null,
    ]);

    for (const result of [snapshotResult, printersResult, loansResult, spoolsResult, periodReportResult]) {
      if (result.status === "rejected") console.error(result.reason);
    }

    const resolvedSnapshot = snapshotResult.status === "fulfilled" ? snapshotResult.value : null;
    const resolvedPrinters = printersResult.status === "fulfilled"
      ? printersResult.value
      : cachedPrinters?.rows ?? [];
    const resolvedLoanRows = loansResult.status === "fulfilled"
      ? loansResult.value
      : cachedLoans?.rows ?? [];
    const resolvedLoans = normalizeLoanDetailsRows(resolvedLoanRows);
    const resolvedSpoolRowsRaw = spoolsResult.status === "fulfilled"
      ? spoolsResult.value
      : cachedSpools?.rows ?? [];
    const resolvedSpoolRows = normalizeSpoolWithMasterRows(resolvedSpoolRowsRaw);
    const resolvedPeriodReport = periodReportResult.status === "fulfilled" ? periodReportResult.value : null;
    const resolvedConsumptionRows = resolvedPeriodReport?.filament_consumption ?? [];
    const derivedOverview =
      resolvedSpoolRows.length > 0
        ? deriveInventoryOverviewFromRows(resolvedSpoolRows, [])
        : null;
    const resolvedOverview = derivedOverview
      ? {
          ...(resolvedSnapshot?.inventory ?? derivedOverview),
          ...derivedOverview,
          total_consumption_30d:
            resolvedSnapshot?.inventory.total_consumption_30d ?? 0,
          owned_consumption_30d:
            resolvedSnapshot?.inventory.owned_consumption_30d ?? 0,
          borrowed_in_consumption_30d:
            resolvedSnapshot?.inventory.borrowed_in_consumption_30d ?? 0,
        }
      : resolvedSnapshot?.inventory ?? null;
    const hasLiveOverview =
      snapshotResult.status === "fulfilled" ||
      (spoolsResult.status === "fulfilled" && derivedOverview != null);
    const allHostSlicesLoaded =
      hasLiveOverview &&
      printersResult.status === "fulfilled" &&
      loansResult.status === "fulfilled" &&
      spoolsResult.status === "fulfilled" &&
      periodReportResult.status === "fulfilled";
    const anyHostSliceLoaded =
      snapshotResult.status === "fulfilled" ||
      printersResult.status === "fulfilled" ||
      loansResult.status === "fulfilled" ||
      spoolsResult.status === "fulfilled" ||
      periodReportResult.status === "fulfilled";
    const anyCachedSliceAvailable = Boolean(
      cachedPrinters || cachedLoans || cachedSpools,
    );

    // Empty arrays and a period-only report are still successful snapshots.
    // Availability must be based on the request outcome, not row counts, or a
    // valid empty library is indistinguishable from an unreachable Host.
    if (anyHostSliceLoaded || anyCachedSliceAvailable) {
      // Keep CACHED for a wholly unavailable Host. A mixed response is PARTIAL,
      // even when one failed slice was recovered from cache, so the UI never
      // describes live/degraded data as a complete cached snapshot.
      const source: StatisticsSnapshotSource = allHostSlicesLoaded
        ? "LIVE"
        : anyHostSliceLoaded
          ? "PARTIAL"
          : "CACHED";
      // Only failed reads have a fallback. Prefer its timestamp for partial data.
      const updatedAt = firstDefinedTimestamp(
        cachedSpools?.captured_at,
        cachedPrinters?.captured_at,
        cachedLoans?.captured_at,
        resolvedSnapshot?.captured_at,
      );
      return {
        overview: resolvedOverview,
        printers: resolvedPrinters,
        spoolRows: resolvedSpoolRows,
        consumptionRows: resolvedConsumptionRows,
        loanDetails: resolvedLoans,
        loanUsage: groupLoanUsageByPerson(resolvedLoans, "OUTBOUND"),
        inboundLoanUsage: groupLoanUsageByPerson(resolvedLoans, "INBOUND"),
        periodReport: resolvedPeriodReport,
        periodStatus: resolvedPeriodReport
          ? "AVAILABLE"
          : periodReportResult.status === "fulfilled"
            ? "LEGACY_HOST"
            : "UNAVAILABLE",
        updatedAt,
        source,
      };
    }

    return emptyStatisticsData();
  }

  if (syncState.clientReadOnly) {
    return emptyStatisticsData();
  }

  const loadLocalSpools = dependencies.loadLocalSpools ?? loadAllSpoolRows;
  const loadLocalOverview = dependencies.loadLocalOverview ?? inventoryOverview;
  const loadLocalPeriodReport = dependencies.loadLocalPeriodReport ?? statisticsPeriodReport;
  const listLocalPrinterOverview = dependencies.listLocalPrinterOverview ?? listPrinterOverview;
  const listLocalLoanUsageByPerson =
    dependencies.listLocalLoanUsageByPerson ?? listLoanUsageByPerson;
  const [
    spoolRowsRaw,
    localOverview,
    localPeriodReport,
    printerRows,
    loanRows,
    inboundLoanRows,
  ] = await Promise.all([
    loadLocalSpools({
      clientReadOnly: false,
      clientHostBaseUrl: null,
      clientLibraryId: null,
    }),
    loadLocalOverview(),
    loadLocalPeriodReport(period),
    listLocalPrinterOverview(),
    listLocalLoanUsageByPerson(30, "OUTBOUND"),
    listLocalLoanUsageByPerson(30, "INBOUND"),
  ]);
  const spoolRows = normalizeSpoolWithMasterRows(spoolRowsRaw);

  return {
    overview: localOverview,
    printers: printerRows,
    spoolRows,
    consumptionRows: localPeriodReport.filament_consumption,
    loanDetails: [],
    loanUsage: loanRows,
    inboundLoanUsage: inboundLoanRows,
    periodReport: localPeriodReport,
    periodStatus: "AVAILABLE",
    updatedAt: null,
    source: "LIVE",
  };
}
