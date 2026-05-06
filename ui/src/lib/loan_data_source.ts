import {
  fetchCachedLibrarySyncLoans,
  fetchLibrarySyncLoans,
  listActiveSpoolLoans,
  listSpoolLoans,
  type ActiveSpoolLoanRow,
  type SpoolLoanDetailsRow,
} from "./tauri_client";
import {
  deriveLibrarySyncPageState,
  type LibrarySyncPageState,
} from "./library_sync_state";

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
