import {
  fetchLibrarySyncDomainRevisions,
  fetchLibrarySyncSpools,
  fetchLibrarySyncSpoolSnapshot,
  getLibraryDomainRevisions,
  type LibraryDomainRevisions,
  listSpools,
  type SpoolWithMasterRow,
} from "./tauri_client";
import { resolveClientHostCacheTarget, resolveClientHostTarget } from "./host_write_target";
import {
  normalizeSpoolWithMasterRows,
  type NormalizedSpoolWithMasterRow,
} from "./spool_row_normalization";

export type SpoolDataSourceOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
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
const MAX_HOST_SPOOL_PAGE_SIZE = 2500;
export const DEFAULT_SPOOL_PAGE_SIZE = 1000;

type SpoolRevision = Pick<LibraryDomainRevisions, "inventory" | "catalog">;

type LoadAllSpoolRowsDependencies = {
  readRevision?: (options: SpoolDataSourceOptions) => Promise<SpoolRevision>;
  loadPage?: SpoolRowsPageLoader;
  fetchHostSnapshot?: typeof fetchLibrarySyncSpoolSnapshot;
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
  return (await loadSpoolSnapshot(options, limit, dependencies)).rows;
}

export async function loadSpoolSnapshot(
  options: SpoolDataSourceOptions,
  limit = DEFAULT_SPOOL_PAGE_SIZE,
  dependencies: LoadAllSpoolRowsDependencies = {},
) {
  const target = options.clientReadOnly ? resolveClientHostCacheTarget(options) : null;
  if (target) {
    const fetchSnapshot = dependencies.fetchHostSnapshot ?? fetchLibrarySyncSpoolSnapshot;
    const snapshot = await fetchSnapshot(target.baseUrl, target.libraryId, target.targetGeneration);
    return { rows: normalizeSpoolWithMasterRows(snapshot.rows), capturedAt: snapshot.captured_at };
  }

  // Local reads and live-only reads without a target generation do not write a Client cache.
  const rows = await loadAllSpoolRowsWithPageLoader(
    options,
    limit,
    dependencies.loadPage ?? loadSpoolRowsPage,
    MAX_LOAD_ALL_SPOOL_PAGES,
    dependencies.readRevision,
  );
  return { rows, capturedAt: null };
}

async function readSpoolRevision(options: SpoolDataSourceOptions): Promise<SpoolRevision> {
  if (!options.clientReadOnly) return getLibraryDomainRevisions();
  const target = resolveClientHostTarget(options);
  if (!target) throw new Error("Host connection details are missing for client inventory loading.");
  return fetchLibrarySyncDomainRevisions(target.baseUrl, target.libraryId);
}

export async function loadAllSpoolRowsWithPageLoader(
  options: SpoolDataSourceOptions,
  limit = 200,
  loadPage: SpoolRowsPageLoader,
  maxPages = MAX_LOAD_ALL_SPOOL_PAGES,
  readRevision = readSpoolRevision,
): Promise<NormalizedSpoolWithMasterRow[]> {
  const requested = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_SPOOL_PAGE_SIZE;
  const pageLimit = options.clientReadOnly ? Math.min(requested, MAX_HOST_SPOOL_PAGE_SIZE) : requested;
  const first = await loadPage(options, pageLimit, 0);
  if (first.length < pageLimit) {
    const duplicate = findDuplicateId(first, new Set());
    if (duplicate != null) throw repeatedSpoolError(duplicate);
    return normalizeSpoolWithMasterRows(first);
  }

  // A single SELECT is consistent. For larger lists, bracket every page,
  // including the first, with revisions covering both spool and master data.
  let before = await readRevision(options);
  for (let attempt = 0; attempt < 2; attempt++) {
    const rows: SpoolWithMasterRow[] = [];
    const seenIds = new Set<string>();
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const page = await loadPage(options, pageLimit, rows.length);
      const duplicate = findDuplicateId(page, seenIds);
      rows.push(...page);
      if (duplicate != null || page.length < pageLimit) {
        const after = await readRevision(options);
        if (before.inventory === after.inventory && before.catalog === after.catalog) {
          if (duplicate != null) throw repeatedSpoolError(duplicate);
          return normalizeSpoolWithMasterRows(rows);
        }
        before = after;
        break;
      }
      if (pageIndex + 1 === maxPages) {
        throw new Error("Stopped loading spools because pagination did not finish.");
      }
    }
  }
  throw new Error("Inventory changed during pagination.");
}

function findDuplicateId(page: SpoolWithMasterRow[], seen: Set<string>): string | null {
  for (const { spool } of page) {
    if (seen.has(spool.id)) return spool.id;
    seen.add(spool.id);
  }
  return null;
}

function repeatedSpoolError(id: string) {
  return new Error(`Stopped loading spools because pagination repeated id ${id}.`);
}
