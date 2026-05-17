import {
  createLibrarySyncHostWishlistItem,
  createWishlistItem,
  deleteLibrarySyncHostWishlistItem,
  deleteWishlistItem,
  fetchLibrarySyncWishlistItems,
  listWishlistItems,
  updateLibrarySyncHostWishlistItemStatus,
  updateWishlistItemStatus,
  type CreateWishlistItemInput,
  type MasterCatalogRow,
  type UpdateWishlistStatusInput,
  type WishlistItemRow,
} from "./tauri_client";
import {
  requireClientHostWriteTarget,
  resolveClientHostTarget,
} from "./host_write_target";

export type WishlistDataSourceOptions = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  limit?: number;
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
  fetchHostWishlist?: typeof fetchLibrarySyncWishlistItems;
  listLocalWishlist?: typeof listWishlistItems;
  createHostWishlistItem?: typeof createLibrarySyncHostWishlistItem;
  createLocalWishlistItem?: typeof createWishlistItem;
  updateHostWishlistItemStatus?: typeof updateLibrarySyncHostWishlistItemStatus;
  updateLocalWishlistItemStatus?: typeof updateWishlistItemStatus;
  deleteHostWishlistItem?: typeof deleteLibrarySyncHostWishlistItem;
  deleteLocalWishlistItem?: typeof deleteWishlistItem;
};

const missingWishlistHostTargetMessage =
  "Host connection details are missing for this wishlist action.";

export function filterWishlistItems(
  items: WishlistItemRow[],
  statusFilter: WishlistStatusFilter,
): WishlistItemRow[] {
  return items.filter((item) => (statusFilter === "ALL" ? true : item.status === statusFilter));
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

export async function loadWishlistItems(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemRow[]> {
  const fetchHostWishlist = dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const { clientReadOnly = false, limit = 500 } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (clientReadOnly) {
    if (!hostTarget) {
      return [];
    }
    return fetchHostWishlist(hostTarget.baseUrl, hostTarget.libraryId, limit);
  }

  return listLocalWishlist(limit);
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
