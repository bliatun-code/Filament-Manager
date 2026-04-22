import {
  fetchCachedLibrarySyncLoans,
  fetchLibrarySyncLoans,
  listSpoolLoans,
  type LibrarySyncSettings,
  type SpoolLoanDetailsRow,
} from "./tauri_client";

export type LoanSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";

export type LoanLibrarySyncState = {
  clientReadOnly: boolean;
  clientHostWritePaired: boolean;
  clientHostDeviceName: string | null;
  clientHostBaseUrl: string | null;
  clientLibraryId: string | null;
};

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

export function deriveLoanLibrarySyncState(
  syncSettings: LibrarySyncSettings,
): LoanLibrarySyncState {
  return {
    clientReadOnly: syncSettings.mode === "CLIENT",
    clientHostWritePaired: syncSettings.client_auth_paired ?? false,
    clientHostDeviceName: syncSettings.host_device_name ?? null,
    clientHostBaseUrl: syncSettings.host_base_url ?? null,
    clientLibraryId: syncSettings.library_id ?? null,
  };
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
