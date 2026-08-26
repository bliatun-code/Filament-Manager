import {
  fetchCachedLibrarySyncSpools,
  fetchCachedLibrarySyncLoans,
  fetchCachedLibrarySyncPrinterOverview,
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncStatisticsPeriodReport,
  getLibrarySyncSettings,
  inventoryOverview,
  listLoanUsageByPerson,
  listPrinterOverview,
  listSpoolLoans,
  statisticsPeriodReport,
  type InventoryOverview,
  type LibrarySyncSettings,
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

export type StatisticsSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
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
  loadSyncSettings?: typeof getLibrarySyncSettings;
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
  syncSettings: LibrarySyncSettings,
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

export async function loadStatisticsPageData(
  period: StatisticsPeriod,
  dependencies: StatisticsPageDataDependencies = {},
): Promise<StatisticsPageDataLoadResult> {
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadData = dependencies.loadData ?? loadStatisticsData;
  const syncSettings = await loadSyncSettings();
  const [syncState, data] = await Promise.all([
    Promise.resolve(deriveStatisticsLibrarySyncState(syncSettings)),
    loadData(syncSettings, period),
  ]);

  return {
    ...data,
    syncState,
  };
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
  syncSettings: LibrarySyncSettings,
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
    const [
      snapshotResult,
      printersResult,
      loansResult,
      spoolsResult,
      periodReportResult,
      cachedPrinters,
      cachedLoans,
      cachedSpools,
    ] =
      await Promise.all([
        fetchHostSnapshot(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchHostPrinterOverview(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchHostLoans(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        loadHostSpools({
          clientReadOnly: true,
          clientHostBaseUrl: hostTarget.baseUrl,
          clientLibraryId: hostTarget.libraryId,
          clientTargetGeneration: syncSettings.target_generation ?? null,
        }).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchHostPeriodReport(
          hostTarget.baseUrl,
          hostTarget.libraryId,
          period,
        ).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        cacheTarget
          ? fetchCachedPrinterOverview(
              cacheTarget.baseUrl,
              cacheTarget.libraryId,
              cacheTarget.targetGeneration,
            ).catch(() => null)
          : null,
        cacheTarget
          ? fetchCachedLoans(
              cacheTarget.baseUrl,
              cacheTarget.libraryId,
              cacheTarget.targetGeneration,
            ).catch(() => null)
          : null,
        cacheTarget
          ? fetchCachedSpools(
              cacheTarget.baseUrl,
              cacheTarget.libraryId,
              cacheTarget.targetGeneration,
            ).catch(() => null)
          : null,
      ]);

    if (!snapshotResult.ok) {
      console.error(snapshotResult.error);
    }
    if (!printersResult.ok) {
      console.error(printersResult.error);
    }
    if (!loansResult.ok) {
      console.error(loansResult.error);
    }
    if (!spoolsResult.ok) {
      console.error(spoolsResult.error);
    }
    if (!periodReportResult.ok) {
      console.error(periodReportResult.error);
    }

    const resolvedSnapshot = snapshotResult.ok ? snapshotResult.value : null;
    const resolvedPrinters = printersResult.ok
      ? printersResult.value
      : cachedPrinters?.rows ?? [];
    const resolvedLoanRows = loansResult.ok
      ? loansResult.value
      : cachedLoans?.rows ?? [];
    const resolvedLoans = normalizeLoanDetailsRows(resolvedLoanRows);
    const resolvedSpoolRowsRaw = spoolsResult.ok
      ? spoolsResult.value
      : cachedSpools?.rows ?? [];
    const resolvedSpoolRows = normalizeSpoolWithMasterRows(resolvedSpoolRowsRaw);
    const resolvedPeriodReport = periodReportResult.ok ? periodReportResult.value : null;
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
      snapshotResult.ok ||
      (spoolsResult.ok && derivedOverview != null);

    if (resolvedOverview || resolvedPrinters.length > 0 || resolvedLoans.length > 0) {
      const source =
        hasLiveOverview &&
        printersResult.ok &&
        loansResult.ok &&
        spoolsResult.ok &&
        periodReportResult.ok
          ? "LIVE"
          : "CACHED";
      const liveUpdatedAt = firstDefinedTimestamp(
        resolvedSnapshot?.captured_at,
        cachedPrinters?.captured_at,
        cachedLoans?.captured_at,
        cachedSpools?.captured_at,
      );
      const fallbackUpdatedAt = firstDefinedTimestamp(
        spoolsResult.ok ? null : cachedSpools?.captured_at,
        printersResult.ok ? null : cachedPrinters?.captured_at,
        loansResult.ok ? null : cachedLoans?.captured_at,
        snapshotResult.ok || derivedOverview ? null : resolvedSnapshot?.captured_at,
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
          : periodReportResult.ok
            ? "LEGACY_HOST"
            : "UNAVAILABLE",
        updatedAt: source === "LIVE" ? liveUpdatedAt : fallbackUpdatedAt ?? liveUpdatedAt,
        source,
      };
    }

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

  if (syncState.clientReadOnly) {
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
