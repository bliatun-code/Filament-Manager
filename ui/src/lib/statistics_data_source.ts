import {
  fetchCachedLibrarySyncSpools,
  fetchCachedLibrarySyncLoans,
  fetchCachedLibrarySyncPrinterOverview,
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncStatisticsPeriodReport,
  getLibrarySyncPageStatus,
  getLibrarySyncSettings,
  inventoryOverview,
  listLoanUsageByPerson,
  listPrinterOverview,
  listSpoolLoans,
  statisticsPeriodReport,
  type InventoryOverview,
  type LibraryDomainRevisions,
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
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import {
  resolveClientHostCacheTarget,
  resolveClientHostTarget,
  type ClientHostWriteTarget,
  type ClientHostCacheTarget,
} from "./host_write_target";
import { fetchLibraryDomainRevisionsForSource, resolveLibraryRevisionSource, type LibraryRevisionSource } from "./library_domain_revisions";
import { localCalendarDate } from "./loan_due_state";
import { firstDefinedTimestamp } from "./source_timestamps";

export type StatisticsSnapshotSource = "LIVE" | "CACHED" | "PARTIAL" | "OFFLINE";
export type StatisticsPeriodDataStatus = "AVAILABLE" | "LEGACY_HOST" | "UNAVAILABLE";
export type StatisticsLibrarySyncState = LibrarySyncPageState;
export type { NormalizedLoanDetailsRow } from "./loan_row_normalization";

export type StatisticsDataLoadResult = {
  overview: InventoryOverview | null;
  printers: PrinterOverviewRow[];
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
  baseline: { target: LibrarySyncPageStatus; revisions: LibraryDomainRevisions; day: string } | null;
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
  previous?: StatisticsPageDataLoadResult | null;
  readRevisions?: typeof fetchLibraryDomainRevisionsForSource;
  loadLocalPeriodReport?: typeof statisticsPeriodReport;
  fetchHostPeriodReport?: typeof fetchLibrarySyncStatisticsPeriodReport;
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
  loadCacheSettings?: typeof getLibrarySyncSettings;
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

const statisticsDomains = ["inventory", "catalog", "jobs", "printers", "loans"] as const;

function sameStatisticsTarget(a: LibrarySyncPageStatus, b: LibrarySyncPageStatus) {
  return a.mode === b.mode &&
    a.library_id === b.library_id &&
    a.host_base_url === b.host_base_url &&
    a.target_generation === b.target_generation &&
    a.client_auth_paired === b.client_auth_paired;
}

function sameStatisticsRevisions(a: LibraryDomainRevisions, b: LibraryDomainRevisions | null) {
  return b !== null && statisticsDomains.every(domain => a[domain] === b[domain]);
}

function statisticsRevisionSource(status: LibrarySyncPageStatus) {
  if (!Number.isSafeInteger(status.target_generation) || (status.target_generation ?? -1) < 0 ||
      !status.library_id?.trim() || (status.mode === "CLIENT" && !status.client_auth_paired)) {
    return null;
  }
  return resolveLibraryRevisionSource(deriveStatisticsLibrarySyncState(status));
}

async function statisticsRevisions(source: LibraryRevisionSource | null, read = fetchLibraryDomainRevisionsForSource) {
  if (!source) return null;
  const revisions = await read(source).catch(() => null);
  return revisions && statisticsDomains.every(domain => Number.isSafeInteger(revisions[domain]) && revisions[domain] >= 0)
    ? revisions : null;
}

async function statisticsForTarget(
  target: LibrarySyncPageStatus,
  period: StatisticsPeriod,
  options: StatisticsPageDataDependencies,
): Promise<StatisticsDataLoadResult & Pick<StatisticsPageDataLoadResult, "baseline">> {
  const previous = options.previous;
  const base = previous?.baseline;
  const day = localCalendarDate();
  // Sample before the full read. A write during that read invalidates reuse on the next switch.
  const source = statisticsRevisionSource(target);
  let revisions = await statisticsRevisions(source, options.readRevisions);
  if (source && base && base.day === day && sameStatisticsTarget(base.target, target) &&
      sameStatisticsRevisions(base.revisions, revisions)) {
    const report = source.kind === "host"
      ? await (options.fetchHostPeriodReport ?? fetchLibrarySyncStatisticsPeriodReport)(
          source.baseUrl, source.libraryId, period,
        ).catch((error) => {
          console.error(error);
          return undefined;
        })
      : await (options.loadLocalPeriodReport ?? statisticsPeriodReport)(period);
    // The report can overlap a stock change or a disconnect. Recover through the ordinary full read.
    revisions = await statisticsRevisions(source, options.readRevisions);
    if (sameStatisticsRevisions(base.revisions, revisions) && localCalendarDate() === day) {
      return {
        ...previous,
        periodReport: report ?? null,
        periodStatus: report === undefined ? "UNAVAILABLE" : report ? "AVAILABLE" : "LEGACY_HOST",
        consumptionRows: report?.filament_consumption ?? [],
        source: report === undefined ? "PARTIAL" : "LIVE",
        baseline: report ? base : null,
      };
    }
  }

  const data = await (options.loadData ?? loadStatisticsData)(target, period);
  const complete = data.source === "LIVE" && data.periodReport !== null &&
    (target.mode !== "CLIENT" || data.updatedAt !== null);
  return { ...data, baseline: complete && revisions ? { target, revisions, day } : null };
}

export async function loadStatisticsPageData(
  period: StatisticsPeriod,
  options: StatisticsPageDataDependencies = {},
): Promise<StatisticsPageDataLoadResult> {
  const loadStatus = options.loadSyncStatus ?? getLibrarySyncPageStatus;
  let target = await loadStatus();
  for (let attempt = 0; attempt < 2; attempt++) {
    let data;
    try {
      data = await statisticsForTarget(target, period, options);
    } catch (error) {
      const current = await loadStatus();
      if (sameStatisticsTarget(target, current)) throw error;
      target = current;
      continue;
    }
    const current = await loadStatus();
    if (sameStatisticsTarget(target, current)) {
      return { ...data, syncState: deriveStatisticsLibrarySyncState(current) };
    }
    target = current;
  }
  return { ...emptyStatisticsData(), syncState: deriveStatisticsLibrarySyncState(target), baseline: null };
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

async function loadStatisticsHostStock(
  status: LibrarySyncPageStatus,
  { baseUrl, libraryId }: ClientHostWriteTarget,
  cacheTarget: ClientHostCacheTarget | null,
  dependencies: StatisticsDataDependencies,
): Promise<{ overview: InventoryOverview | null; source: StatisticsSnapshotSource; liveAt?: string; cachedAt?: string }> {
  const fetchSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
  const live = await fetchSnapshot(baseUrl, libraryId, {
    dashboard: false,
    expectedGeneration: status.target_generation,
  }).catch(error => { console.error(error); return null; });
  let snapshot = live;
  if (!live && cacheTarget) {
    const readCache = dependencies.loadCacheSettings ?? getLibrarySyncSettings;
    const cache = await readCache(["snapshot"], cacheTarget.targetGeneration).catch(() => null);
    if (cache && sameStatisticsTarget(status, cache) && cache.cached_snapshot?.library_id === libraryId) {
      snapshot = cache.cached_snapshot;
    }
  }
  if (snapshot?.inventory.owned_on_hand_grams != null) {
    return live
      ? { overview: live.inventory, liveAt: live.captured_at, source: "LIVE" }
      : { overview: snapshot.inventory, cachedAt: snapshot.captured_at, source: "CACHED" };
  }

  // Older Hosts and offline copies lack the weight. Keep the row-based calculation for them.
  const loadSpools = dependencies.loadHostSpools ?? loadAllSpoolRows;
  const rows = await loadSpools({
    clientReadOnly: true,
    clientHostBaseUrl: baseUrl,
    clientLibraryId: libraryId,
    clientTargetGeneration: status.target_generation ?? null,
  }).catch(error => { console.error(error); return null; });
  const readCachedSpools = dependencies.fetchCachedSpools ?? fetchCachedLibrarySyncSpools;
  const cached = rows === null && cacheTarget
    ? await readCachedSpools(baseUrl, libraryId, cacheTarget.targetGeneration).catch(() => null)
    : null;
  const availableRows = rows ?? cached?.rows;
  let overview = snapshot?.inventory ?? null;
  if (availableRows?.length) {
    const stock = deriveInventoryOverviewFromRows(normalizeSpoolWithMasterRows(availableRows), []);
    overview = {
      ...overview, ...stock,
      total_consumption_30d: overview?.total_consumption_30d ?? 0,
      owned_consumption_30d: overview?.owned_consumption_30d ?? 0,
      borrowed_in_consumption_30d: overview?.borrowed_in_consumption_30d ?? 0,
    };
  }
  const cachedAt = cached?.captured_at ?? (live ? undefined : snapshot?.captured_at);
  if (live || rows) {
    return { overview, liveAt: live?.captured_at, cachedAt, source: live && rows ? "LIVE" : "PARTIAL" };
  }
  return { overview, cachedAt, source: snapshot || cached ? "CACHED" : "OFFLINE" };
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
    const fetchHostPrinterOverview =
      dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
    const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
    const fetchHostPeriodReport =
      dependencies.fetchHostPeriodReport ?? fetchLibrarySyncStatisticsPeriodReport;
    const fetchCachedPrinterOverview =
      dependencies.fetchCachedPrinterOverview ?? fetchCachedLibrarySyncPrinterOverview;
    const fetchCachedLoans = dependencies.fetchCachedLoans ?? fetchCachedLibrarySyncLoans;
    const { baseUrl, libraryId } = hostTarget;
    const [stock, [printersResult, loansResult, periodReportResult]] = await Promise.all([
      loadStatisticsHostStock(syncSettings, hostTarget, cacheTarget, dependencies),
      Promise.allSettled([
        fetchHostPrinterOverview(baseUrl, libraryId),
        fetchHostLoans(baseUrl, libraryId),
        fetchHostPeriodReport(baseUrl, libraryId, period),
      ]),
    ]);

    // Each fallback is scoped to the target captured before the Host requests.
    const [cachedPrinters, cachedLoans] = await Promise.all([
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
    ]);

    for (const result of [printersResult, loansResult, periodReportResult]) {
      if (result.status === "rejected") console.error(result.reason);
    }

    const resolvedPrinters = printersResult.status === "fulfilled"
      ? printersResult.value
      : cachedPrinters?.rows ?? [];
    const resolvedLoanRows = loansResult.status === "fulfilled"
      ? loansResult.value
      : cachedLoans?.rows ?? [];
    const resolvedLoans = normalizeLoanDetailsRows(resolvedLoanRows);
    const resolvedPeriodReport = periodReportResult.status === "fulfilled" ? periodReportResult.value : null;
    const resolvedConsumptionRows = resolvedPeriodReport?.filament_consumption ?? [];
    const allHostSlicesLoaded =
      stock.source === "LIVE" &&
      printersResult.status === "fulfilled" &&
      loansResult.status === "fulfilled" &&
      periodReportResult.status === "fulfilled";
    const anyHostSliceLoaded =
      stock.source === "LIVE" || stock.source === "PARTIAL" ||
      printersResult.status === "fulfilled" || loansResult.status === "fulfilled" ||
      periodReportResult.status === "fulfilled";
    const anyCachedSliceAvailable = stock.source === "CACHED" || cachedPrinters || cachedLoans;

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
        stock.cachedAt,
        cachedPrinters?.captured_at,
        cachedLoans?.captured_at,
        stock.liveAt,
      );
      return {
        overview: stock.overview,
        printers: resolvedPrinters,
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

  const loadLocalOverview = dependencies.loadLocalOverview ?? inventoryOverview;
  const loadLocalPeriodReport = dependencies.loadLocalPeriodReport ?? statisticsPeriodReport;
  const listLocalPrinterOverview = dependencies.listLocalPrinterOverview ?? listPrinterOverview;
  const listLocalLoanUsageByPerson =
    dependencies.listLocalLoanUsageByPerson ?? listLoanUsageByPerson;
  const [
    localOverview,
    localPeriodReport,
    printerRows,
    loanRows,
    inboundLoanRows,
  ] = await Promise.all([
    loadLocalOverview(),
    loadLocalPeriodReport(period),
    listLocalPrinterOverview(),
    listLocalLoanUsageByPerson(30, "OUTBOUND"),
    listLocalLoanUsageByPerson(30, "INBOUND"),
  ]);

  return {
    overview: localOverview,
    printers: printerRows,
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
