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
  type UpdateWishlistStatusInput,
  type WishlistItemRow,
} from "./tauri_client";
import {
  requireClientHostBaseTarget,
  resolveClientHostTarget,
} from "./host_write_target";

export type WishlistDataSourceOptions = {
  clientReadOnly?: boolean;
  clientHostBaseUrl?: string | null;
  clientLibraryId?: string | null;
  limit?: number;
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
  "Client host base URL is required for wishlist host writes.";

export async function loadWishlistItems(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemRow[]> {
  const fetchHostWishlist = dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const { clientReadOnly = false, limit = 500 } = options;
  const hostTarget = clientReadOnly ? resolveClientHostTarget(options) : null;

  if (hostTarget) {
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
    const hostTarget = requireClientHostBaseTarget(
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
    const hostTarget = requireClientHostBaseTarget(
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
    const hostTarget = requireClientHostBaseTarget(
      options,
      missingWishlistHostTargetMessage,
    );
    await deleteHostWishlistItem(hostTarget.baseUrl, hostTarget.libraryId, itemId);
    return;
  }

  await deleteLocalWishlistItem(itemId);
}
