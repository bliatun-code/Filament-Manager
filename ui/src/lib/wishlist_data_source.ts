import {
  createLibrarySyncHostWishlistItem,
  createWishlistItem,
  deleteLibrarySyncHostWishlistItem,
  deleteWishlistItem,
  fetchCachedLibrarySyncWishlist,
  fetchLibrarySyncWishlistItems,
  listWishlistItems,
  receiveLibrarySyncHostWishlistItem,
  receiveWishlistItem,
  updateLibrarySyncHostWishlistItemStatus,
  updateWishlistItemStatus,
  type CreateWishlistItemInput,
  type MasterCatalogRow,
  type ReceiveWishlistItemInput,
  type UpdateWishlistStatusInput,
  type WishlistItemRow,
  type WishlistReceiptResult,
} from "./tauri_client";
import {
  requireClientHostWriteTarget,
  resolveClientHostCacheTarget,
  resolveClientHostTarget,
} from "./host_write_target";

export type WishlistDataSourceOptions = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  clientTargetGeneration?: number | null;
  limit?: number;
};

export type WishlistSnapshotSource = "LIVE" | "CACHED" | "OFFLINE";

export type WishlistItemsLoadResult = {
  rows: WishlistItemRow[];
  source: WishlistSnapshotSource;
};

export type WishlistStatus = "WISHLIST" | "ON_ORDER" | "RECEIVED";
export type WishlistStatusFilter = "ALL" | WishlistStatus;
export type WishlistCatalogFilter = "ALL" | "ACTIVE" | "DISCONTINUED";

export type WishlistQueueSummary = {
  all: number;
  wishlist: number;
  onOrder: number;
  received: number;
};

export type WishlistDraftSource = "bambu" | "esun" | "manual";

export type WishlistDraftInput = {
  source: WishlistDraftSource;
  selectedBambuMaster?: MasterCatalogRow | null;
  selectedEsunMaster?: MasterCatalogRow | null;
  manualVendor?: string | null;
  manualMaterial?: string | null;
  manualFilamentName?: string | null;
  manualColorName?: string | null;
};

export type WishlistDraft = {
  master_id?: string | null;
  vendor: string;
  material: string;
  filament_name: string;
  color_name: string;
};

type WishlistDataSourceDependencies = {
  fetchCachedWishlist?: typeof fetchCachedLibrarySyncWishlist;
  fetchHostWishlist?: typeof fetchLibrarySyncWishlistItems;
  listLocalWishlist?: typeof listWishlistItems;
  createHostWishlistItem?: typeof createLibrarySyncHostWishlistItem;
  createLocalWishlistItem?: typeof createWishlistItem;
  updateHostWishlistItemStatus?: typeof updateLibrarySyncHostWishlistItemStatus;
  updateLocalWishlistItemStatus?: typeof updateWishlistItemStatus;
  receiveHostWishlistItem?: typeof receiveLibrarySyncHostWishlistItem;
  receiveLocalWishlistItem?: typeof receiveWishlistItem;
  deleteHostWishlistItem?: typeof deleteLibrarySyncHostWishlistItem;
  deleteLocalWishlistItem?: typeof deleteWishlistItem;
};

const missingWishlistHostTargetMessage =
  "Host connection details are missing for this wishlist action.";

type WishlistItemsInternalLoadResult = {
  result: WishlistItemsLoadResult;
  loadError: unknown | null;
};

export function filterWishlistItems(
  items: WishlistItemRow[],
  statusFilter: WishlistStatusFilter,
): WishlistItemRow[] {
  return items.filter((item) => (statusFilter === "ALL" ? true : item.status === statusFilter));
}

export function filterWishlistQueueItems(
  items: WishlistItemRow[],
  statusFilter: WishlistStatusFilter,
  query: string,
): WishlistItemRow[] {
  const statusItems = filterWishlistItems(items, statusFilter);
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return statusItems;
  }
  return statusItems.filter((item) =>
    `${item.vendor} ${item.material} ${item.filament_name} ${item.color_name}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
}

export function summarizeWishlistQueue(items: WishlistItemRow[]): WishlistQueueSummary {
  return items.reduce(
    (summary, item) => {
      summary.all += 1;
      if (item.status === "WISHLIST") {
        summary.wishlist += 1;
      } else if (item.status === "ON_ORDER") {
        summary.onOrder += 1;
      } else if (item.status === "RECEIVED") {
        summary.received += 1;
      }
      return summary;
    },
    { all: 0, wishlist: 0, onOrder: 0, received: 0 },
  );
}

export function normalizeWishlistStatus(statusRaw: string): WishlistStatus {
  if (statusRaw === "ON_ORDER" || statusRaw === "RECEIVED") {
    return statusRaw;
  }
  return "WISHLIST";
}

export function canStockWishlistItem(statusRaw: string): boolean {
  return normalizeWishlistStatus(statusRaw) !== "RECEIVED";
}

export function normalizeWishlistReceiptQuantity(
  quantityRaw: string | number,
  remainingQuantity: number,
): number {
  const parsed = Number.parseInt(String(quantityRaw).trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.min(parsed, Math.max(1, Math.trunc(remainingQuantity)));
}

export function listWishlistCatalogMastersByVendor(
  masters: MasterCatalogRow[],
  vendorNeedle: string,
): MasterCatalogRow[] {
  const normalizedVendor = vendorNeedle.trim().toLowerCase();
  return masters
    .filter((master) => master.vendor.toLowerCase().includes(normalizedVendor))
    .sort((left, right) => {
      if (left.is_discontinued !== right.is_discontinued) {
        return Number(left.is_discontinued) - Number(right.is_discontinued);
      }
      return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
        `${right.material} ${right.filament_name} ${right.color_name}`,
      );
    });
}

export function filterWishlistCatalogMasters(
  masters: MasterCatalogRow[],
  statusFilter: WishlistCatalogFilter,
  query: string,
): MasterCatalogRow[] {
  const term = query.trim().toLowerCase();
  return masters.filter((master) => {
    const stateMatch =
      statusFilter === "ALL"
        ? true
        : statusFilter === "ACTIVE"
          ? !master.is_discontinued
          : master.is_discontinued;
    const textMatch =
      term.length === 0
        ? true
        : `${master.material} ${master.filament_name} ${master.color_name}`
            .toLowerCase()
            .includes(term);
    return stateMatch && textMatch;
  });
}

export function selectWishlistCatalogMaster(
  masters: MasterCatalogRow[],
  selectedMasterId: string,
): MasterCatalogRow | null {
  return masters.find((master) => master.id === selectedMasterId) ?? masters[0] ?? null;
}

export function buildWishlistDraft(input: WishlistDraftInput): WishlistDraft | null {
  if (input.source === "bambu") {
    const master = input.selectedBambuMaster;
    if (!master) {
      return null;
    }
    return {
      master_id: master.id,
      vendor: master.vendor,
      material: master.material,
      filament_name: master.filament_name,
      color_name: master.color_name,
    };
  }

  if (input.source === "esun") {
    const master = input.selectedEsunMaster;
    if (!master) {
      return null;
    }
    return {
      master_id: master.id,
      vendor: master.vendor,
      material: master.material,
      filament_name: master.filament_name,
      color_name: master.color_name,
    };
  }

  const filamentName = (input.manualFilamentName ?? "").trim();
  const colorName = (input.manualColorName ?? "").trim();
  if (!filamentName || !colorName) {
    return null;
  }
  return {
    master_id: null,
    vendor: (input.manualVendor ?? "").trim() || "Generic",
    material: (input.manualMaterial ?? "").trim() || "PLA",
    filament_name: filamentName,
    color_name: colorName,
  };
}

async function loadWishlistItemsInternal(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemsInternalLoadResult> {
  const fetchCachedWishlist = dependencies.fetchCachedWishlist ?? fetchCachedLibrarySyncWishlist;
  const fetchHostWishlist = dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const { clientReadOnly = false, limit = 500 } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;
  const cacheTarget = clientReadOnly ? resolveClientHostCacheTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      const cached = cacheTarget
        ? await fetchCachedWishlist(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      return {
        result: {
          rows: cached?.rows ?? [],
          source: cached ? "CACHED" : "OFFLINE",
        },
        loadError: null,
      };
    }
    try {
      return {
        result: {
          rows: await fetchHostWishlist(hostTarget.baseUrl, hostTarget.libraryId, limit),
          source: "LIVE",
        },
        loadError: null,
      };
    } catch (loadError) {
      const cached = cacheTarget
        ? await fetchCachedWishlist(
            cacheTarget.baseUrl,
            cacheTarget.libraryId,
            cacheTarget.targetGeneration,
          ).catch(() => null)
        : null;
      if (cached) {
        return {
          result: {
            rows: cached.rows,
            source: "CACHED",
          },
          loadError: null,
        };
      }
      return {
        result: {
          rows: [],
          source: "OFFLINE",
        },
        loadError,
      };
    }
  }

  return {
    result: {
      rows: await listLocalWishlist(limit),
      source: "LIVE",
    },
    loadError: null,
  };
}

export async function loadWishlistItemsSnapshot(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemsLoadResult> {
  return (await loadWishlistItemsInternal(options, dependencies)).result;
}

export async function loadWishlistItems(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemRow[]> {
  const { result, loadError } = await loadWishlistItemsInternal(options, dependencies);
  if (loadError) {
    throw loadError;
  }
  return result.rows;
}

export async function createWishlistEntry(
  input: CreateWishlistItemInput,
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<void> {
  const createHostWishlistItem =
    dependencies.createHostWishlistItem ?? createLibrarySyncHostWishlistItem;
  const createLocalWishlistItem = dependencies.createLocalWishlistItem ?? createWishlistItem;

  if (options.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      options,
      missingWishlistHostTargetMessage,
    );
    await createHostWishlistItem(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await createLocalWishlistItem(input);
}

export async function updateWishlistEntryStatus(
  input: UpdateWishlistStatusInput,
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<void> {
  const updateHostWishlistItemStatus =
    dependencies.updateHostWishlistItemStatus ?? updateLibrarySyncHostWishlistItemStatus;
  const updateLocalWishlistItemStatus =
    dependencies.updateLocalWishlistItemStatus ?? updateWishlistItemStatus;

  if (options.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      options,
      missingWishlistHostTargetMessage,
    );
    await updateHostWishlistItemStatus(hostTarget.baseUrl, hostTarget.libraryId, input);
    return;
  }

  await updateLocalWishlistItemStatus(input);
}

export async function receiveWishlistEntry(
  input: ReceiveWishlistItemInput,
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistReceiptResult> {
  const receiveHostWishlistItem =
    dependencies.receiveHostWishlistItem ?? receiveLibrarySyncHostWishlistItem;
  const receiveLocalWishlistItem =
    dependencies.receiveLocalWishlistItem ?? receiveWishlistItem;

  if (options.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      options,
      missingWishlistHostTargetMessage,
    );
    return receiveHostWishlistItem(hostTarget.baseUrl, hostTarget.libraryId, input);
  }

  return receiveLocalWishlistItem(input);
}

export async function deleteWishlistEntry(
  itemId: string,
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<void> {
  const deleteHostWishlistItem =
    dependencies.deleteHostWishlistItem ?? deleteLibrarySyncHostWishlistItem;
  const deleteLocalWishlistItem = dependencies.deleteLocalWishlistItem ?? deleteWishlistItem;

  if (options.clientReadOnly) {
    const hostTarget = requireClientHostWriteTarget(
      options,
      missingWishlistHostTargetMessage,
    );
    await deleteHostWishlistItem(hostTarget.baseUrl, hostTarget.libraryId, itemId);
    return;
  }

  await deleteLocalWishlistItem(itemId);
}
