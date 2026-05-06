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

function requireClientHostDetails(options: WishlistDataSourceOptions): {
  clientHostBaseUrl: string;
  clientLibraryId: string | null | undefined;
} {
  if (!options.clientHostBaseUrl?.trim()) {
    throw new Error("Client host base URL is required for wishlist host writes.");
  }
  return {
    clientHostBaseUrl: options.clientHostBaseUrl,
    clientLibraryId: options.clientLibraryId,
  };
}

export async function loadWishlistItems(
  options: WishlistDataSourceOptions = {},
  dependencies: WishlistDataSourceDependencies = {},
): Promise<WishlistItemRow[]> {
  const fetchHostWishlist = dependencies.fetchHostWishlist ?? fetchLibrarySyncWishlistItems;
  const listLocalWishlist = dependencies.listLocalWishlist ?? listWishlistItems;
  const { clientReadOnly = false, clientHostBaseUrl, clientLibraryId, limit = 500 } = options;

  if (clientReadOnly && clientHostBaseUrl && clientLibraryId) {
    return fetchHostWishlist(clientHostBaseUrl, clientLibraryId, limit);
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
    const { clientHostBaseUrl, clientLibraryId } = requireClientHostDetails(options);
    await createHostWishlistItem(clientHostBaseUrl, clientLibraryId, input);
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
    const { clientHostBaseUrl, clientLibraryId } = requireClientHostDetails(options);
    await updateHostWishlistItemStatus(clientHostBaseUrl, clientLibraryId, input);
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
    const { clientHostBaseUrl, clientLibraryId } = requireClientHostDetails(options);
    await deleteHostWishlistItem(clientHostBaseUrl, clientLibraryId, itemId);
    return;
  }

  await deleteLocalWishlistItem(itemId);
}
