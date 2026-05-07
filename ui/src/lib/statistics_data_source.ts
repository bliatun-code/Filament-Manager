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

export function deriveStatisticsLibrarySyncState(
  syncSettings: LibrarySyncSettings,
): StatisticsLibrarySyncState {
  return deriveLibrarySyncPageState(syncSettings, { requireHostForClientReadOnly: true });
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

  if (hostTarget) {
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
): Promise<StatisticsDataLoadResult> {
  const syncState = deriveStatisticsLibrarySyncState(syncSettings);
  const hostTarget = syncState.clientReadOnly ? resolveClientHostTarget(syncState) : null;

  if (hostTarget) {
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
        fetchLibrarySyncSnapshot(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchLibrarySyncPrinterOverview(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchLibrarySyncLoans(hostTarget.baseUrl, hostTarget.libraryId).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        loadAllSpoolRows({
          clientReadOnly: true,
          clientHostBaseUrl: hostTarget.baseUrl,
          clientLibraryId: hostTarget.libraryId,
        }).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchLibrarySyncFilamentConsumption(
          hostTarget.baseUrl,
          hostTarget.libraryId,
          500,
          null,
        ).then(
          (value) => ({ ok: true as const, value }),
          (error) => ({ ok: false as const, error }),
        ),
        fetchCachedLibrarySyncPrinterOverview().catch(() => null),
        fetchCachedLibrarySyncLoans().catch(() => null),
        fetchCachedLibrarySyncSpools().catch(() => null),
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
    const resolvedSpoolRows = spoolsResult.ok ? spoolsResult.value : cachedSpools?.rows ?? [];
    const resolvedConsumptionRows = consumptionResult.ok ? consumptionResult.value : [];
    const derivedOverview =
      resolvedSpoolRows.length > 0 || resolvedConsumptionRows.length > 0
        ? deriveInventoryOverviewFromRows(resolvedSpoolRows, resolvedConsumptionRows)
        : null;
    const resolvedOverview = derivedOverview ?? resolvedSnapshot?.inventory ?? null;
    const hasLiveOverview = snapshotResult.ok || derivedOverview != null;

    if (resolvedOverview || resolvedPrinters.length > 0 || resolvedLoans.length > 0) {
      return {
        overview: resolvedOverview,
        printers: resolvedPrinters,
        spoolRows: resolvedSpoolRows,
        consumptionRows: resolvedConsumptionRows,
        loanDetails: resolvedLoans,
        loanUsage: groupLoanUsageByPerson(resolvedLoans, "OUTBOUND"),
        inboundLoanUsage: groupLoanUsageByPerson(resolvedLoans, "INBOUND"),
        updatedAt:
          resolvedSnapshot?.captured_at ??
          cachedPrinters?.captured_at ??
          syncSettings.cached_printers?.captured_at ??
          cachedLoans?.captured_at ??
          syncSettings.cached_loans?.captured_at ??
          cachedSpools?.captured_at ??
          syncSettings.cached_spools?.captured_at ??
          null,
        source:
          hasLiveOverview && printersResult.ok && loansResult.ok ? "LIVE" : "CACHED",
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

  const [spoolRows, consumptionRows, printerRows, loanRows, inboundLoanRows] = await Promise.all([
    loadAllSpoolRows({
      clientReadOnly: false,
      clientHostBaseUrl: null,
      clientLibraryId: null,
    }),
    listFilamentConsumption(500, null),
    listPrinterOverview(),
    listLoanUsageByPerson(30, "OUTBOUND"),
    listLoanUsageByPerson(30, "INBOUND"),
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
    source: "OFFLINE",
  };
}
