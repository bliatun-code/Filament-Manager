import {
  fetchLibrarySyncSpools,
  listSpools,
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

export async function loadSpoolRowsPage(
  options: SpoolDataSourceOptions,
  limit = 1200,
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
  limit = 200,
): Promise<NormalizedSpoolWithMasterRow[]> {
  return loadAllSpoolRowsWithPageLoader(options, limit, loadSpoolRowsPage);
}

export async function loadAllSpoolRowsWithPageLoader(
  options: SpoolDataSourceOptions,
  limit = 200,
  loadPage: SpoolRowsPageLoader,
  maxPages = MAX_LOAD_ALL_SPOOL_PAGES,
): Promise<NormalizedSpoolWithMasterRow[]> {
  const allRows: SpoolWithMasterRow[] = [];
  const pageLimit = Math.max(1, Math.floor(limit));
  let offset = 0;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const page = await loadPage(options, pageLimit, offset);
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
