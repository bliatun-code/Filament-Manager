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
import { requireClientHostWriteTarget } from "./host_write_target";

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
  listLocalActiveLoans?: typeof listActiveSpoolLoans;
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

export async function loadActiveLoanRows(
  options: { clientReadOnly: boolean },
  dependencies: ActiveLoanRowsDependencies = {},
): Promise<ActiveSpoolLoanRow[]> {
  if (options.clientReadOnly) {
    return [];
  }

  const listLocalActiveLoans = dependencies.listLocalActiveLoans ?? listActiveSpoolLoans;
  return listLocalActiveLoans();
}

export async function loadLoanRowsPage(
  options: LoanDataSourceOptions,
): Promise<LoanDataLoadResult> {
  const { clientReadOnly, clientHostBaseUrl, clientLibraryId, limit = 2000 } = options;

  if (clientReadOnly && clientHostBaseUrl && clientLibraryId) {
    try {
      const rows = await fetchLibrarySyncLoans(clientHostBaseUrl, clientLibraryId, limit);
      const cached = await fetchCachedLibrarySyncLoans().catch(() => null);
      return {
        rows,
        source: "LIVE",
        updatedAt: cached?.captured_at ?? null,
        usedFallback: false,
      };
    } catch (loadError) {
      try {
        const cached = await fetchCachedLibrarySyncLoans();
        if (cached) {
          return {
            rows: cached.rows,
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
    rows: await listSpoolLoans(limit, true, "ALL"),
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
