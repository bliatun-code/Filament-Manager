import type { InventorySpool } from "./inventory_list_model";
import {
  archiveInventoryLocation,
  archiveLibrarySyncHostLocation,
  createInventoryLocation,
  createLibrarySyncHostLocation,
  deleteInventoryLocation,
  deleteLibrarySyncHostLocation,
  fetchCachedLibrarySyncLocations,
  fetchLibrarySyncLocations,
  listInventoryLocations,
  mergeInventoryLocations,
  mergeLibrarySyncHostLocations,
  renameInventoryLocation,
  renameLibrarySyncHostLocation,
  restoreInventoryLocation,
  restoreLibrarySyncHostLocation,
  type InventoryLocationListResponse,
  type InventoryLocationMergeResult,
  type InventoryLocationRow,
} from "./tauri_location_client";
import { resolveClientHostCacheTarget } from "./host_write_target";
import { loadCachedInventorySpools, loadInventorySpools } from "./inventory_data_source";
import { inventoryLocationUsageById, isUserManagedInventoryLocation } from "./inventory_location_model";

export type InventoryLocationDataOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
};

export type InventoryLocationLoadResult = {
  rows: InventoryLocationRow[];
  mutationsSupported: boolean;
  source: "LIVE" | "CACHED" | "LEGACY_HOST" | "OFFLINE";
  updatedAt: string | null;
};

type LocationDataDependencies = {
  listLocal?: typeof listInventoryLocations;
  fetchHost?: typeof fetchLibrarySyncLocations;
  fetchCached?: typeof fetchCachedLibrarySyncLocations;
  loadStock?: typeof loadInventorySpools;
  loadCachedStock?: typeof loadCachedInventorySpools;
};

export function selectableInventoryLocations(rows: InventoryLocationRow[]) {
  return rows.filter((row) => isUserManagedInventoryLocation(row) && !row.archived_at);
}

export function legacyLocationsFromSpools(spools: InventorySpool[]): InventoryLocationRow[] {
  const byId = new Map<string, InventoryLocationRow>();
  for (const spool of spools) {
    for (const [id, name] of [
      [spool.locationId ?? spool.location, spool.location],
      [spool.homeLocationId ?? spool.homeLocation, spool.homeLocation],
    ] as const) {
      const safeId = id?.trim();
      if (!safeId || byId.has(safeId)) {
        continue;
      }
      byId.set(safeId, {
        id: safeId,
        name: name?.trim() || safeId,
        location_type: "GENERIC",
        parent_id: null,
        archived_at: null,
        created_at: "",
        updated_at: "",
      });
    }
  }
  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function loadInventoryLocations(
  options: InventoryLocationDataOptions,
  spools?: InventorySpool[],
  dependencies: LocationDataDependencies = {},
): Promise<InventoryLocationLoadResult> {
  const listLocal = dependencies.listLocal ?? listInventoryLocations;
  const fetchHost = dependencies.fetchHost ?? fetchLibrarySyncLocations;
  const fetchCached = dependencies.fetchCached ?? fetchCachedLibrarySyncLocations;

  async function withLegacyCounts(result: InventoryLocationLoadResult, deriveLocations = false) {
    if (!deriveLocations && result.rows.every(row =>
      !isUserManagedInventoryLocation(row) || row.linked_spool_count != null)) return result;

    const cachedOnly = result.source === "CACHED" || result.source === "OFFLINE";
    const loadStock = cachedOnly
      ? dependencies.loadCachedStock ?? loadCachedInventorySpools
      : dependencies.loadStock ?? loadInventorySpools;
    const snapshot = spools === undefined ? await loadStock(options) : null;
    const stock = spools ?? (snapshot && snapshot.source !== "OFFLINE" ? snapshot.rows : null);
    if (!stock) return result;
    const counts = inventoryLocationUsageById(stock);
    const rows = deriveLocations ? legacyLocationsFromSpools(stock) : result.rows;
    const fromSavedStock = result.source === "OFFLINE" && snapshot?.source === "CACHED";
    return {
      ...result,
      source: fromSavedStock ? "CACHED" as const : result.source,
      updatedAt: fromSavedStock ? snapshot.updatedAt : result.updatedAt,
      rows: rows.map(row => ({
        ...row, linked_spool_count: row.linked_spool_count ?? counts.get(row.id) ?? 0,
      })),
    };
  }

  if (!options.clientReadOnly) {
    return withLegacyCounts({
      rows: await listLocal(true), mutationsSupported: true, source: "LIVE", updatedAt: null,
    });
  }

  const baseUrl = options.clientHostBaseUrl?.trim();
  const libraryId = options.clientLibraryId?.trim();
  const cacheTarget = resolveClientHostCacheTarget(options);
  const offline: InventoryLocationLoadResult = {
    rows: [], mutationsSupported: false, source: "OFFLINE", updatedAt: null,
  };
  if (!baseUrl || !libraryId) return withLegacyCounts(offline, true);

  let live: InventoryLocationListResponse;
  try {
    live = await fetchHost({ baseUrl, expectedLibraryId: libraryId, targetGeneration: options.clientTargetGeneration });
  } catch {
    const cached = cacheTarget && await fetchCached({
      baseUrl: cacheTarget.baseUrl, expectedLibraryId: cacheTarget.libraryId,
      targetGeneration: cacheTarget.targetGeneration,
    }).catch(() => null);
    if (cached) return withLegacyCounts({
      rows: cached.rows, mutationsSupported: false, source: "CACHED", updatedAt: cached.captured_at ?? null,
    });
    return withLegacyCounts(offline, true);
  }
  return withLegacyCounts({
    rows: live.rows,
    mutationsSupported: live.mutations_supported,
    source: live.mutations_supported ? "LIVE" : "LEGACY_HOST",
    updatedAt: live.captured_at ?? null,
  }, !live.mutations_supported && !live.rows.length);
}

// A compact Host rename updates the saved locations without replacing the
// complete inventory capture. Resolve names by immutable ID on offline drilldown.
export function applyInventoryLocationNames(spools: InventorySpool[], locations: InventoryLocationRow[]) {
  const names = new Map(locations.map(row => [row.id, row.name]));
  return spools.map(spool => {
    const location = (spool.locationId && names.get(spool.locationId)) || spool.location;
    const homeLocation = (spool.homeLocationId && names.get(spool.homeLocationId)) || spool.homeLocation;
    return location === spool.location && homeLocation === spool.homeLocation
      ? spool : { ...spool, location, homeLocation };
  });
}

export type InventoryLocationMutationContext = InventoryLocationDataOptions & {
  clientHostWritePaired: boolean;
  mutationsSupported: boolean;
};

type DeleteLocationDependencies = {
  deleteHost?: typeof deleteLibrarySyncHostLocation;
  deleteLocal?: typeof deleteInventoryLocation;
};

function hostTarget(context: InventoryLocationMutationContext) {
  const baseUrl = context.clientHostBaseUrl?.trim();
  const expectedLibraryId = context.clientLibraryId?.trim();
  if (!baseUrl || !expectedLibraryId || !context.clientHostWritePaired) {
    throw new Error("Pair this client with the Host before changing locations.");
  }
  if (!context.mutationsSupported) {
    throw new Error(
      "The Host does not support location objects. Upgrade the Host before changing locations.",
    );
  }
  return { baseUrl, expectedLibraryId, ...(context.clientTargetGeneration == null ? {} : { targetGeneration: context.clientTargetGeneration }) };
}

export function createLocationForInventory(
  context: InventoryLocationMutationContext,
  name: string,
) {
  return context.clientReadOnly
    ? createLibrarySyncHostLocation(hostTarget(context), name)
    : createInventoryLocation(name);
}

export function renameLocationForInventory(
  context: InventoryLocationMutationContext,
  locationId: string,
  name: string,
) {
  return context.clientReadOnly
    ? renameLibrarySyncHostLocation(hostTarget(context), locationId, name)
    : renameInventoryLocation(locationId, name);
}

export function archiveLocationForInventory(
  context: InventoryLocationMutationContext,
  locationId: string,
) {
  return context.clientReadOnly
    ? archiveLibrarySyncHostLocation(hostTarget(context), locationId)
    : archiveInventoryLocation(locationId);
}

export function restoreLocationForInventory(
  context: InventoryLocationMutationContext,
  locationId: string,
) {
  return context.clientReadOnly
    ? restoreLibrarySyncHostLocation(hostTarget(context), locationId)
    : restoreInventoryLocation(locationId);
}

export function deleteLocationForInventory(
  context: InventoryLocationMutationContext,
  locationId: string,
  dependencies: DeleteLocationDependencies = {},
) {
  const deleteHost = dependencies.deleteHost ?? deleteLibrarySyncHostLocation;
  const deleteLocal = dependencies.deleteLocal ?? deleteInventoryLocation;
  return context.clientReadOnly
    ? deleteHost(hostTarget(context), locationId)
    : deleteLocal(locationId);
}

export function mergeLocationsForInventory(
  context: InventoryLocationMutationContext,
  sourceId: string,
  targetId: string,
): Promise<InventoryLocationMergeResult> {
  return context.clientReadOnly
    ? mergeLibrarySyncHostLocations(hostTarget(context), sourceId, targetId)
    : mergeInventoryLocations(sourceId, targetId);
}
