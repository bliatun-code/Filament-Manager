import {
  fetchLibrarySyncWishlistItems,
  listWishlistItems,
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
};

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
