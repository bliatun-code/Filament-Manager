import {
  fetchCachedLibrarySyncActiveLoans,
  fetchCachedLibrarySyncLoans,
  fetchLibrarySyncActiveLoans,
  fetchLibrarySyncLoans,
  lendLibrarySyncHostSpool,
  lendSpool,
  listActiveSpoolLoans,
  listSpoolLoans,
  returnInboundSpoolLoan,
  returnLibrarySyncHostLoan,
  returnSpoolLoan,
  type LendSpoolInput,
  type ReturnSpoolLoanInput,
  type SpoolLoanDetailsRow,
} from "./tauri_client";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import { isActiveOutboundLoan, isLoanCurrentlyActive } from "./loan_state";
import {
  normalizeActiveLoanRow,
  normalizeLoanDetailsRow,
  type NormalizedActiveLoanRow,
  type NormalizedLoanDetailsRow,
} from "./loan_row_normalization";
import {
  requireClientHostWriteTarget,
  resolveClientHostCacheTarget,
  resolveClientHostTarget,
} from "./host_write_target";

export type LoanSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
export type LoanLibrarySyncState = LibrarySyncPageState;

export type LoanDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
  limit?: number;
};

export type LoanDataLoadResult = {
  rows: NormalizedLoanDetailsRow[];
  source: LoanSnapshotSource;
  updatedAt: string | null;
  usedFallback: boolean;
};

export type ActiveLoanRowsLoadResult = {
  rows: NormalizedActiveLoanRow[];
  source: LoanSnapshotSource;
};

type ActiveLoanRowsDependencies = {
  fetchHostActiveLoans?: typeof fetchLibrarySyncActiveLoans;
  fetchCachedActiveLoans?: typeof fetchCachedLibrarySyncActiveLoans;
  listLocalActiveLoans?: typeof listActiveSpoolLoans;
};

type LoanRowsPageDependencies = {
  fetchHostLoans?: typeof fetchLibrarySyncLoans;
  fetchCachedLoans?: typeof fetchCachedLibrarySyncLoans;
  listLocalLoans?: typeof listSpoolLoans;
};

type LoanWriteTarget = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};

type LoanWriteDependencies = {
  lendHostSpool?: typeof lendLibrarySyncHostSpool;
  lendLocalSpool?: typeof lendSpool;
  returnHostLoan?: typeof returnLibrarySyncHostLoan;
  returnLocalLoan?: typeof returnSpoolLoan;
  returnLocalInboundLoan?: typeof returnInboundSpoolLoan;
};

export const deriveLoanLibrarySyncState = deriveLibrarySyncPageState;
export {
  normalizeActiveLoanRow,
  normalizeLoanDetailsRow,
  type NormalizedActiveLoanRow,
  type NormalizedLoanDetailsRow,
} from "./loan_row_normalization";

function mapLoanDetailsToActiveRow(row: SpoolLoanDetailsRow): NormalizedActiveLoanRow {
  const normalized = normalizeLoanDetailsRow(row);
  return {
    loan: normalized.loan,
    spool_status: normalized.spool_status ?? "",
    spool_remaining_g: normalized.spool_remaining_g ?? null,
    material: normalized.material ?? "",
    filament_name: normalized.filament_name ?? "",
    color_name: normalized.color_name ?? "",
    vendor: normalized.vendor ?? "",
    hex_color: normalized.hex_color ?? null,
  };
}

function mapLoanDetailsToActiveRows(rows: SpoolLoanDetailsRow[]): NormalizedActiveLoanRow[] {
  return rows
    .map(normalizeLoanDetailsRow)
    .filter(isActiveOutboundLoan)
    .map(mapLoanDetailsToActiveRow);
}

export async function loadActiveLoanRowsSnapshot(
  options: LoanDataSourceOptions,
  dependencies: ActiveLoanRowsDependencies = {},
): Promise<ActiveLoanRowsLoadResult> {
  if (options.clientReadOnly) {
    const fetchHostLoans = dependencies.fetchHostActiveLoans ?? fetchLibrarySyncActiveLoans;
    const fetchCachedLoans = dependencies.fetchCachedActiveLoans ?? fetchCachedLibrarySyncActiveLoans;
    const hostTarget = resolveClientHostTarget(options);
    const cacheTarget = resolveClientHostCacheTarget(options);
    if (hostTarget) {
      try {
        const rows = await fetchHostLoans(hostTarget.baseUrl, hostTarget.libraryId);
        return {
          rows: mapLoanDetailsToActiveRows(rows),
          source: "LIVE",
        };
      } catch (error) {
        console.error(error);
      }
    }

    const cached = cacheTarget
      ? await fetchCachedLoans(
          cacheTarget.baseUrl,
          cacheTarget.libraryId,
          cacheTarget.targetGeneration,
        ).catch(() => null)
      : null;
    return {
      rows: mapLoanDetailsToActiveRows(cached?.rows ?? []),
      source: cached ? "CACHED" : "OFFLINE",
    };
  }

  const listLocalActiveLoans = dependencies.listLocalActiveLoans ?? listActiveSpoolLoans;
  return {
    rows: (await listLocalActiveLoans()).map(normalizeActiveLoanRow),
    source: "LIVE",
  };
}

export function activeLoanRowsForDisplay(
  activeSnapshot: LoanDataLoadResult | null,
  historySnapshot: LoanDataLoadResult | null,
): NormalizedLoanDetailsRow[] {
  if (activeSnapshot?.source === "OFFLINE") {
    return historySnapshot?.rows.filter(isLoanCurrentlyActive) ?? [];
  }
  const activeRows = activeSnapshot?.rows ?? [];
  if (activeSnapshot?.source !== "CACHED" || historySnapshot?.source !== "LIVE") {
    return activeRows;
  }
  const closedIds = new Set(historySnapshot.rows
    .filter((row) => !isLoanCurrentlyActive(row))
    .map((row) => row.loan.id));
  return activeRows.filter((row) => !closedIds.has(row.loan.id));
}

export function mergeLoanHistoryAndActiveRows(
  historyRows: NormalizedLoanDetailsRow[],
  activeRows: NormalizedLoanDetailsRow[],
): NormalizedLoanDetailsRow[] {
  const activeIds = new Set(activeRows.map((row) => row.loan.id));
  return [
    ...activeRows,
    ...historyRows.filter((row) => !activeIds.has(row.loan.id) && !isLoanCurrentlyActive(row)),
  ].sort((left, right) => right.loan.lent_at.localeCompare(left.loan.lent_at));
}

export async function loadLoanRowsPage(
  options: LoanDataSourceOptions & { activeOnly?: boolean },
  dependencies: LoanRowsPageDependencies = {},
): Promise<LoanDataLoadResult> {
  const { activeOnly = false, clientReadOnly, limit = 2000 } = options;
  const fetchHostLoans = dependencies.fetchHostLoans ??
    (activeOnly ? fetchLibrarySyncActiveLoans : fetchLibrarySyncLoans);
  const fetchCachedLoans = dependencies.fetchCachedLoans ??
    (activeOnly ? fetchCachedLibrarySyncActiveLoans : fetchCachedLibrarySyncLoans);
  const listLocalLoans = dependencies.listLocalLoans ?? listSpoolLoans;
  const normalizeRows = (rows: SpoolLoanDetailsRow[]) => {
    const normalized = rows.map(normalizeLoanDetailsRow);
    return activeOnly ? normalized.filter(isLoanCurrentlyActive) : normalized;
  };
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;
  const cacheTarget = clientReadOnly ? resolveClientHostCacheTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      const cached = cacheTarget
        ? await fetchCachedLoans(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      if (cached) {
        return {
          rows: normalizeRows(cached.rows),
          source: "CACHED",
          updatedAt: cached.captured_at ?? null,
          usedFallback: true,
        };
      }

      return {
        rows: [],
        source: "OFFLINE",
        updatedAt: null,
        usedFallback: true,
      };
    }
    try {
      const rows = await fetchHostLoans(hostTarget.baseUrl, hostTarget.libraryId, limit);
      const cached = cacheTarget
        ? await fetchCachedLoans(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      return {
        rows: normalizeRows(rows),
        source: "LIVE",
        updatedAt: cached?.captured_at ?? null,
        usedFallback: false,
      };
    } catch (loadError) {
      try {
        const cached = cacheTarget
          ? await fetchCachedLoans(
              cacheTarget.baseUrl,
              cacheTarget.libraryId,
              cacheTarget.targetGeneration,
            )
          : null;
        if (cached) {
          return {
            rows: normalizeRows(cached.rows),
            source: "CACHED",
            updatedAt: cached.captured_at ?? null,
            usedFallback: true,
          };
        }
      } catch (cacheError) {
        console.error(cacheError);
      }
      console.error(loadError);
      return {
        rows: [],
        source: "OFFLINE",
        updatedAt: null,
        usedFallback: true,
      };
    }
  }

  return {
    rows: normalizeRows(await listLocalLoans(limit, !activeOnly, "ALL")),
    source: "LIVE",
    updatedAt: null,
    usedFallback: false,
  };
}

export async function lendInventorySpool(
  input: LendSpoolInput,
  target: LoanWriteTarget = {},
  dependencies: LoanWriteDependencies = {},
): Promise<void> {
  const lendHostSpool = dependencies.lendHostSpool ?? lendLibrarySyncHostSpool;
  const lendLocalSpool = dependencies.lendLocalSpool ?? lendSpool;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this loan action.",
    );
    await lendHostSpool(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await lendLocalSpool(input);
}

export async function returnInventoryLoan(
  input: ReturnSpoolLoanInput & { inbound?: boolean },
  target: LoanWriteTarget = {},
  dependencies: LoanWriteDependencies = {},
): Promise<void> {
  const returnHostLoan = dependencies.returnHostLoan ?? returnLibrarySyncHostLoan;
  const returnLocalLoan = dependencies.returnLocalLoan ?? returnSpoolLoan;
  const returnLocalInboundLoan =
    dependencies.returnLocalInboundLoan ?? returnInboundSpoolLoan;

  if (target.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      target,
      "Host connection details are missing for this loan action.",
    );
    await returnHostLoan(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  const action = input.inbound ? returnLocalInboundLoan : returnLocalLoan;
  await action({
    loan_id: input.loan_id,
    returned_grams: input.returned_grams,
    note: input.note ?? null,
  });
}
