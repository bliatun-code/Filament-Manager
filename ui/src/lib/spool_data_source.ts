import {
  fetchLibrarySyncSpools,
  listSpools,
  saveLibrarySyncSpoolCache,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { resolveClientHostTarget } from "./host_write_target";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";

type SpoolDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
};
type SpoolRowsPageLoader = (
  options: SpoolDataSourceOptions,
  limit: number,
  offset: number,
) => Promise<SpoolWithMasterRow[]>;
type SpoolDataSourceDependencies = {
  fetchHostSpools?: typeof fetchLibrarySyncSpools;
  listLocalSpools?: typeof listSpools;
};

const MAX_LOAD_ALL_SPOOL_PAGES = 500;
export const DEFAULT_SPOOL_PAGE_SIZE = 1000;

type LoadAllSpoolRowsDependencies = {
  loadPage?: SpoolRowsPageLoader;
  saveClientCache?: typeof saveLibrarySyncSpoolCache;
  onCacheError?: (error: unknown) => void;
};

export async function loadSpoolRowsPage(
  options: SpoolDataSourceOptions,
  limit = DEFAULT_SPOOL_PAGE_SIZE,
  offset = 0,
  dependencies: SpoolDataSourceDependencies = {},
): Promise<SpoolWithMasterRow[]> {
  const fetchHostSpools = dependencies.fetchHostSpools ?? fetchLibrarySyncSpools;
  const listLocalSpools = dependencies.listLocalSpools ?? listSpools;
  const hostTarget = options.clientReadOnly ? resolveClientHostTarget(options) : null;
  if (options.clientReadOnly) {
    if (!hostTarget) {
      throw new Error("Host connection details are missing for client inventory loading.");
    }
    return fetchHostSpools(hostTarget.baseUrl, hostTarget.libraryId, limit, offset);
  }
  return listLocalSpools(limit, offset);
}

export async function loadAllSpoolRows(
  options: SpoolDataSourceOptions,
  limit = DEFAULT_SPOOL_PAGE_SIZE,
  dependencies: LoadAllSpoolRowsDependencies = {},
): Promise<NormalizedSpoolWithMasterRow[]> {
  const loadPage = dependencies.loadPage ?? loadSpoolRowsPage;
  const rows = await loadAllSpoolRowsWithPageLoader(options, limit, loadPage);
  if (options.clientReadOnly) {
    const saveClientCache = dependencies.saveClientCache ?? saveLibrarySyncSpoolCache;
    await saveClientCache(rows).catch(dependencies.onCacheError ?? console.warn);
  }
  return rows;
}

export async function loadAllSpoolRowsWithPageLoader(
  options: SpoolDataSourceOptions,
  limit = 200,
  loadPage: SpoolRowsPageLoader,
  maxPages = MAX_LOAD_ALL_SPOOL_PAGES,
): Promise<NormalizedSpoolWithMasterRow[]> {
  const allRows: SpoolWithMasterRow[] = [];
  const seenSpoolIds = new Set<string>();
  const pageLimit = Math.max(1, Math.floor(limit));
  let offset = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await loadPage(options, pageLimit, offset);
    for (const row of page) {
      if (seenSpoolIds.has(row.spool.id)) {
        throw new Error(`Stopped loading spools because pagination repeated id ${row.spool.id}.`);
      }
      seenSpoolIds.add(row.spool.id);
    }
    allRows.push(...page);
    if (page.length < pageLimit) {
      break;
    }
    offset += page.length;
  }
  if (allRows.length >= pageLimit * maxPages) {
    throw new Error("Stopped loading spools because pagination did not finish.");
  }
  return normalizeSpoolWithMasterRows(allRows);
}
