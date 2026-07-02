import {
  fetchCachedLibrarySyncLoans,
  fetchLibrarySyncLoans,
  lendLibrarySyncHostSpool,
  lendSpool,
  listActiveSpoolLoans,
  listSpoolLoans,
  returnInboundSpoolLoan,
  returnLibrarySyncHostLoan,
  returnSpoolLoan,
  type ActiveSpoolLoanRow,
  type LendSpoolInput,
  type ReturnSpoolLoanInput,
  type SpoolLoanDetailsRow,
} from "./tauri_client";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";
import { isActiveOutboundLoan } from "./loan_state";
import {
  normalizeActiveLoanRow,
  normalizeLoanDetailsRow,
} from "./loan_row_normalization";
import {
  requireClientHostWriteTarget,
  resolveClientHostTarget,
} from "./host_write_target";

export type LoanSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";
export type LoanLibrarySyncState = LibrarySyncPageState;

export type LoanDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  limit?: number;
};

export type LoanDataLoadResult = {
  rows: SpoolLoanDetailsRow[];
  source: LoanSnapshotSource;
  updatedAt: string | null;
  usedFallback: boolean;
};

type ActiveLoanRowsDependencies = {
  fetchHostLoans?: typeof fetchLibrarySyncLoans;
  fetchCachedLoans?: typeof fetchCachedLibrarySyncLoans;
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
export { normalizeActiveLoanRow, normalizeLoanDetailsRow } from "./loan_row_normalization";

function mapLoanDetailsToActiveRow(row: SpoolLoanDetailsRow): ActiveSpoolLoanRow {
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

export async function loadActiveLoanRows(
  options: {
    clientReadOnly: boolean;
    clientHostBaseUrl?: string | null;
    clientLibraryId?: string | null;
    limit?: number;
  },
  dependencies: ActiveLoanRowsDependencies = {},
): Promise<ActiveSpoolLoanRow[]> {
  if (options.clientReadOnly) {
    const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
    const fetchCachedLoans = dependencies.fetchCachedLoans ?? fetchCachedLibrarySyncLoans;
    const hostTarget = resolveClientHostTarget(options);
    if (hostTarget) {
      try {
        const rows = await fetchHostLoans(
          hostTarget.baseUrl,
          hostTarget.libraryId,
          options.limit ?? 2000,
        );
        return rows
          .map(normalizeLoanDetailsRow)
          .filter(isActiveOutboundLoan)
          .map(mapLoanDetailsToActiveRow);
      } catch (loadError) {
        console.error(loadError);
      }
    }
    const cached = await fetchCachedLoans().catch(() => null);
    return (cached?.rows ?? [])
      .map(normalizeLoanDetailsRow)
      .filter(isActiveOutboundLoan)
      .map(mapLoanDetailsToActiveRow);
  }

  const listLocalActiveLoans = dependencies.listLocalActiveLoans ?? listActiveSpoolLoans;
  return (await listLocalActiveLoans()).map(normalizeActiveLoanRow);
}

export async function loadLoanRowsPage(
  options: LoanDataSourceOptions,
  dependencies: LoanRowsPageDependencies = {},
): Promise<LoanDataLoadResult> {
  const fetchHostLoans = dependencies.fetchHostLoans ?? fetchLibrarySyncLoans;
  const fetchCachedLoans = dependencies.fetchCachedLoans ?? fetchCachedLibrarySyncLoans;
  const listLocalLoans = dependencies.listLocalLoans ?? listSpoolLoans;
  const { clientReadOnly, limit = 2000 } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      const cached = await fetchCachedLoans().catch(() => null);
      if (cached) {
        return {
          rows: cached.rows.map(normalizeLoanDetailsRow),
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
      const cached = await fetchCachedLoans().catch(() => null);
      return {
        rows: rows.map(normalizeLoanDetailsRow),
        source: "LIVE",
        updatedAt: cached?.captured_at ?? null,
        usedFallback: false,
      };
    } catch (loadError) {
      try {
        const cached = await fetchCachedLoans();
        if (cached) {
          return {
            rows: cached.rows.map(normalizeLoanDetailsRow),
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
    rows: (await listLocalLoans(limit, true, "ALL")).map(normalizeLoanDetailsRow),
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
