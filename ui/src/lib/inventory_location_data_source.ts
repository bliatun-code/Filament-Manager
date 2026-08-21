import type { InventorySpool } from "./inventory_list_model";
import {
  archiveInventoryLocation,
  archiveLibrarySyncHostLocation,
  createInventoryLocation,
  createLibrarySyncHostLocation,
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

export type InventoryLocationDataOptions = {
  clientReadOnly: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
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
};

export function selectableInventoryLocations(rows: InventoryLocationRow[]) {
  return rows.filter(
    (row) => row.location_type === "GENERIC" && !row.archived_at,
  );
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
  spools: InventorySpool[],
  dependencies: LocationDataDependencies = {},
): Promise<InventoryLocationLoadResult> {
  const listLocal = dependencies.listLocal ?? listInventoryLocations;
  const fetchHost = dependencies.fetchHost ?? fetchLibrarySyncLocations;
  const fetchCached = dependencies.fetchCached ?? fetchCachedLibrarySyncLocations;

  if (!options.clientReadOnly) {
    return {
      rows: await listLocal(true),
      mutationsSupported: true,
      source: "LIVE",
      updatedAt: null,
    };
  }

  const baseUrl = options.clientHostBaseUrl?.trim();
  const libraryId = options.clientLibraryId?.trim();
  if (!baseUrl || !libraryId) {
    return {
      rows: legacyLocationsFromSpools(spools),
      mutationsSupported: false,
      source: "OFFLINE",
      updatedAt: null,
    };
  }

  try {
    const live = await fetchHost({ baseUrl, expectedLibraryId: libraryId });
    if (!live.mutations_supported) {
      const rows = live.rows.length > 0 ? live.rows : legacyLocationsFromSpools(spools);
      return {
        rows,
        mutationsSupported: false,
        source: "LEGACY_HOST",
        updatedAt: live.captured_at ?? null,
      };
    }
    return {
      rows: live.rows,
      mutationsSupported: true,
      source: "LIVE",
      updatedAt: live.captured_at ?? null,
    };
  } catch (error) {
    const cached = await fetchCached().catch(
      (): InventoryLocationListResponse | null => null,
    );
    if (cached) {
      return {
        rows: cached.rows,
        mutationsSupported: cached.mutations_supported,
        source: "CACHED",
        updatedAt: cached.captured_at ?? null,
      };
    }
    if (spools.length > 0) {
      return {
        rows: legacyLocationsFromSpools(spools),
        mutationsSupported: false,
        source: "OFFLINE",
        updatedAt: null,
      };
    }
    throw error;
  }
}

export type InventoryLocationMutationContext = InventoryLocationDataOptions & {
  clientHostWritePaired: boolean;
  mutationsSupported: boolean;
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
  return { baseUrl, expectedLibraryId };
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

export function mergeLocationsForInventory(
  context: InventoryLocationMutationContext,
  sourceId: string,
  targetId: string,
): Promise<InventoryLocationMergeResult> {
  return context.clientReadOnly
    ? mergeLibrarySyncHostLocations(hostTarget(context), sourceId, targetId)
    : mergeInventoryLocations(sourceId, targetId);
}
