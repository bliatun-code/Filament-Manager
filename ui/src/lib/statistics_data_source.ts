import {
  fetchCachedLibrarySyncSpools,
  fetchCachedLibrarySyncLoans,
  fetchCachedLibrarySyncPrinterOverview,
  fetchLibrarySyncFilamentConsumption,
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  getLibrarySyncSettings,
  listLoanUsageByPerson,
  listFilamentConsumption,
  listPrinterOverview,
  listSpoolLoans,
  type InventoryOverview,
  type LibrarySyncSettings,
  type LoanUsageByPersonRow,
  type PrinterOverviewRow,
  type FilamentConsumptionRow,
  type SpoolWithMasterRow,
  type SpoolLoanDetailsRow,
} from "./tauri_client";
import { loadAllSpoolRows } from "./spool_data_source";
import { isLoanCurrentlyActive } from "./loan_state";
import { deriveInventoryOverviewFromRows } from "./statistics_model";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import { resolveClientHostTarget } from "./host_write_target";
import { firstDefinedTimestamp } from "./source_timestamps";

export type StatisticsSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
export type StatisticsLibrarySyncState = LibrarySyncPageState;

export type StatisticsDataLoadResult = {
  overview: InventoryOverview | null;
  printers: PrinterOverviewRow[];
  spoolRows: SpoolWithMasterRow[];
  consumptionRows: FilamentConsumptionRow[];
  loanDetails: SpoolLoanDetailsRow[];
  loanUsage: LoanUsageByPersonRow[];
  inboundLoanUsage: LoanUsageByPersonRow[];
  updatedAt: string | null;
  source: StatisticsSnapshotSource;
};

export type StatisticsPageDataLoadResult = StatisticsDataLoadResult & {
  syncState: StatisticsLibrarySyncState;
};

export type FilamentConsumptionBreakdownOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  printerId?: string | null;
  limit?: number;
};

export type LoanBreakdownRowsOptions = {
  clientReadOnly: boolean;
  cachedLoanDetails: SpoolLoanDetailsRow[];
  direction?: string | null;
  limit?: number;
};

type FilamentConsumptionBreakdownDependencies = {
  fetchHostConsumption?: typeof fetchLibrarySyncFilamentConsumption;
  listLocalConsumption?: typeof listFilamentConsumption;
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
  fetchHostConsumption?: typeof fetchLibrarySyncFilamentConsumption;
  fetchCachedPrinterOverview?: typeof fetchCachedLibrarySyncPrinterOverview;
  fetchCachedLoans?: typeof fetchCachedLibrarySyncLoans;
  fetchCachedSpools?: typeof fetchCachedLibrarySyncSpools;
  loadHostSpools?: typeof loadAllSpoolRows;
  loadLocalSpools?: typeof loadAllSpoolRows;
  listLocalConsumption?: typeof listFilamentConsumption;
  listLocalLoanUsageByPerson?: typeof listLoanUsageByPerson;
  listLocalPrinterOverview?: typeof listPrinterOverview;
};

export function deriveStatisticsLibrarySyncState(
  syncSettings: LibrarySyncSettings,
): StatisticsLibrarySyncState {
  return deriveLibrarySyncPageState(syncSettings);
}

export function groupLoanUsageByPerson(
  rows: SpoolLoanDetailsRow[],
  direction: "OUTBOUND" | "INBOUND",
): LoanUsageByPersonRow[] {
  const grouped = new Map<string, LoanUsageByPersonRow>();
  for (const row of rows) {
    const normalizedDirection =
      (row.loan.loan_direction ?? "").trim().toUpperCase() === "INBOUND" ? "INBOUND" : "OUTBOUND";
    if (normalizedDirection !== direction) {
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
      completed_loans: current.completed_loans + (row.loan.returned_at ? 1 : 0),
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
  dependencies: StatisticsPageDataDependencies = {},
): Promise<StatisticsPageDataLoadResult> {
  const loadSyncSettings = dependencies.loadSyncSettings ?? getLibrarySyncSettings;
  const loadData = dependencies.loadData ?? loadStatisticsData;
  const syncSettings = await loadSyncSettings();
  const [syncState, data] = await Promise.all([
    Promise.resolve(deriveStatisticsLibrarySyncState(syncSettings)),
    loadData(syncSettings),
  ]);

  return {
    ...data,
    syncState,
  };
}

export async function loadFilamentConsumptionBreakdown(
  options: FilamentConsumptionBreakdownOptions,
  dependencies: FilamentConsumptionBreakdownDependencies = {},
): Promise<FilamentConsumptionRow[]> {
  const fetchHostConsumption =
    dependencies.fetchHostConsumption ?? fetchLibrarySyncFilamentConsumption;
  const listLocalConsumption = dependencies.listLocalConsumption ?? listFilamentConsumption;
  const { clientReadOnly, printerId = null, limit = 500 } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      return [];
    }
    return fetchHostConsumption(hostTarget.baseUrl, hostTarget.libraryId, limit, printerId);
  }

  return listLocalConsumption(limit, printerId);
}

export async function loadLoanBreakdownRows(
  options: LoanBreakdownRowsOptions,
  dependencies: LoanBreakdownRowsDependencies = {},
): Promise<SpoolLoanDetailsRow[]> {
  if (options.clientReadOnly) {
    return options.cachedLoanDetails;
  }

  const listLocalLoans = dependencies.listLocalLoans ?? listSpoolLoans;
  return listLocalLoans(options.limit ?? 2000, true, options.direction ?? null);
}

export async function loadStatisticsData(
  syncSettings: LibrarySyncSettings,
  dependencies: StatisticsDataDependencies = {},
): Promise<StatisticsDataLoadResult> {
  const syncState = deriveStatisticsLibrarySyncState(syncSettings);
  const hostTarget = syncState.clientReadOnly ? resolveClientHostTarget(syncState) : null;

  if (hostTarget) {
    const fetchHostSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSnapshot;
    const fetchHostPrinterOverview =
      dependencies.fetchHostPrinterOverview ?? fetchLibrarySyncPrinterOverview;
    const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
    const fetchHostConsumption =
      dependencies.fetchHostConsumption ?? fetchLibrarySyncFilamentConsumption;
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
      consumptionResult,
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
        }).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchHostConsumption(
          hostTarget.baseUrl,
          hostTarget.libraryId,
          500,
          null,
        ).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchCachedPrinterOverview().catch(() => null),
        fetchCachedLoans().catch(() => null),
        fetchCachedSpools().catch(() => null),
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
    if (!consumptionResult.ok) {
      console.error(consumptionResult.error);
    }

    const resolvedSnapshot = snapshotResult.ok
      ? snapshotResult.value
      : syncSettings.cached_snapshot ?? null;
    const resolvedPrinters = printersResult.ok
      ? printersResult.value
      : cachedPrinters?.rows ?? syncSettings.cached_printers?.rows ?? [];
    const resolvedLoans = loansResult.ok
      ? loansResult.value
      : cachedLoans?.rows ?? syncSettings.cached_loans?.rows ?? [];
    const resolvedSpoolRows = spoolsResult.ok
      ? spoolsResult.value
      : cachedSpools?.rows ?? syncSettings.cached_spools?.rows ?? [];
    const resolvedConsumptionRows = consumptionResult.ok ? consumptionResult.value : [];
    const derivedOverview =
      resolvedSpoolRows.length > 0 || resolvedConsumptionRows.length > 0
        ? deriveInventoryOverviewFromRows(resolvedSpoolRows, resolvedConsumptionRows)
        : null;
    const resolvedOverview = derivedOverview ?? resolvedSnapshot?.inventory ?? null;
    const hasLiveOverview =
      snapshotResult.ok ||
      (spoolsResult.ok && consumptionResult.ok && derivedOverview != null);

    if (resolvedOverview || resolvedPrinters.length > 0 || resolvedLoans.length > 0) {
      const source =
        hasLiveOverview &&
        printersResult.ok &&
        loansResult.ok &&
        spoolsResult.ok &&
        consumptionResult.ok
          ? "LIVE"
          : "CACHED";
      const liveUpdatedAt = firstDefinedTimestamp(
        resolvedSnapshot?.captured_at,
        cachedPrinters?.captured_at,
        syncSettings.cached_printers?.captured_at,
        cachedLoans?.captured_at,
        syncSettings.cached_loans?.captured_at,
        cachedSpools?.captured_at,
        syncSettings.cached_spools?.captured_at,
      );
      const fallbackUpdatedAt = firstDefinedTimestamp(
        spoolsResult.ok ? null : cachedSpools?.captured_at,
        spoolsResult.ok ? null : syncSettings.cached_spools?.captured_at,
        printersResult.ok ? null : cachedPrinters?.captured_at,
        printersResult.ok ? null : syncSettings.cached_printers?.captured_at,
        loansResult.ok ? null : cachedLoans?.captured_at,
        loansResult.ok ? null : syncSettings.cached_loans?.captured_at,
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
      updatedAt: null,
      source: "OFFLINE",
    };
  }

  if (syncState.clientReadOnly) {
    const spoolRows = syncSettings.cached_spools?.rows ?? [];
    const loanRows = syncSettings.cached_loans?.rows ?? [];
    const spoolRowsOverview =
      spoolRows.length > 0 ? deriveInventoryOverviewFromRows(spoolRows, []) : null;
    const overview = spoolRowsOverview ?? syncSettings.cached_snapshot?.inventory ?? null;
    const spoolRowsUpdatedAt =
      spoolRowsOverview ? syncSettings.cached_spools?.captured_at ?? null : null;
    if (
      overview ||
      spoolRows.length > 0 ||
      (syncSettings.cached_printers?.rows.length ?? 0) > 0 ||
      loanRows.length > 0
    ) {
      return {
        overview,
        printers: syncSettings.cached_printers?.rows ?? [],
        spoolRows,
        consumptionRows: [],
        loanDetails: loanRows,
        loanUsage: groupLoanUsageByPerson(loanRows, "OUTBOUND"),
        inboundLoanUsage: groupLoanUsageByPerson(loanRows, "INBOUND"),
        updatedAt:
          spoolRowsUpdatedAt ??
          syncSettings.cached_snapshot?.captured_at ??
          syncSettings.cached_printers?.captured_at ??
          syncSettings.cached_loans?.captured_at ??
          syncSettings.cached_spools?.captured_at ??
          null,
        source: "CACHED",
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
      updatedAt: null,
      source: "OFFLINE",
    };
  }

  const loadLocalSpools = dependencies.loadLocalSpools ?? loadAllSpoolRows;
  const listLocalConsumption = dependencies.listLocalConsumption ?? listFilamentConsumption;
  const listLocalPrinterOverview = dependencies.listLocalPrinterOverview ?? listPrinterOverview;
  const listLocalLoanUsageByPerson =
    dependencies.listLocalLoanUsageByPerson ?? listLoanUsageByPerson;
  const [spoolRows, consumptionRows, printerRows, loanRows, inboundLoanRows] = await Promise.all([
    loadLocalSpools({
      clientReadOnly: false,
      clientHostBaseUrl: null,
      clientLibraryId: null,
    }),
    listLocalConsumption(500, null),
    listLocalPrinterOverview(),
    listLocalLoanUsageByPerson(30, "OUTBOUND"),
    listLocalLoanUsageByPerson(30, "INBOUND"),
  ]);

  return {
    overview: deriveInventoryOverviewFromRows(spoolRows, consumptionRows),
    printers: printerRows,
    spoolRows,
    consumptionRows,
    loanDetails: [],
    loanUsage: loanRows,
    inboundLoanUsage: inboundLoanRows,
    updatedAt: null,
    source: "LIVE",
  };
}
