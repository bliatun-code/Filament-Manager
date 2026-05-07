import {
  fetchLibrarySyncSpools,
  listSpools,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { resolveClientHostTarget } from "./host_write_target";

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

const MAX_LOAD_ALL_SPOOL_PAGES = 500;

export async function loadSpoolRowsPage(
  options: SpoolDataSourceOptions,
  limit = 1200,
  offset = 0,
): Promise<SpoolWithMasterRow[]> {
  const hostTarget = options.clientReadOnly ? resolveClientHostTarget(options) : null;
  if (hostTarget) {
    return fetchLibrarySyncSpools(hostTarget.baseUrl, hostTarget.libraryId, limit, offset);
  }
  return listSpools(limit, offset);
}

export async function loadAllSpoolRows(
  options: SpoolDataSourceOptions,
  limit = 200,
): Promise<SpoolWithMasterRow[]> {
  return loadAllSpoolRowsWithPageLoader(options, limit, loadSpoolRowsPage);
}

export async function loadAllSpoolRowsWithPageLoader(
  options: SpoolDataSourceOptions,
  limit = 200,
  loadPage: SpoolRowsPageLoader,
  maxPages = MAX_LOAD_ALL_SPOOL_PAGES,
): Promise<SpoolWithMasterRow[]> {
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
  return allRows;
}
