import { getPurchaseQueuePage, type WishlistItemRow } from "./tauri_wishlist_client";
import { fetchCachedLibrarySyncWishlist, type LibraryReadTarget } from "./tauri_library_sync_client";
import {
  filterWishlistQueueItems, loadWishlistItemsSnapshot, summarizeWishlistQueue,
  type WishlistDataSourceOptions, type WishlistQueueSummary, type WishlistStatusFilter,
} from "./wishlist_data_source";

export const PURCHASE_PAGE_SIZE = 50;
export type PurchaseQueueQuery = { status: WishlistStatusFilter; search: string; offset: number };
export type PurchaseQueuePage = {
  rows: WishlistItemRow[]; matched: number; offset: number; summary: WishlistQueueSummary;
};

function pageOfSavedRows(rows: WishlistItemRow[], query: PurchaseQueueQuery, pinned?: string): PurchaseQueuePage {
  const filtered = filterWishlistQueueItems(rows, query.status, query.search);
  const index = pinned ? filtered.findIndex(row => row.id === pinned) : -1;
  const ordered = index > 0 ? [filtered[index]!, ...filtered.slice(0, index), ...filtered.slice(index + 1)] : filtered;
  const lastOffset = Math.floor(Math.max(0, ordered.length - 1) / PURCHASE_PAGE_SIZE) * PURCHASE_PAGE_SIZE;
  const offset = Math.min(query.offset, lastOffset);
  return { rows: ordered.slice(offset, offset + PURCHASE_PAGE_SIZE), matched: ordered.length, offset, summary: summarizeWishlistQueue(rows) };
}

export async function loadPurchaseQueuePage(target: LibraryReadTarget, query: PurchaseQueueQuery, options: WishlistDataSourceOptions) {
  try {
    const page = await getPurchaseQueuePage(target, query, options.reviewedItemId);
    if (page) return { rows: page.rows, page, source: "LIVE" as const };
  } catch (error) {
    if (!target.base_url) throw error;
    const cached = await fetchCachedLibrarySyncWishlist(target.base_url, target.expected_library_id, target.target_generation).catch(() => null);
    const page = pageOfSavedRows(cached?.rows ?? [], query, options.reviewedItemId);
    return { rows: page.rows, page, source: cached ? "CACHED" as const : "OFFLINE" as const };
  }
  const legacy = await loadWishlistItemsSnapshot(options);
  const page = pageOfSavedRows(legacy.rows, query, options.reviewedItemId);
  return { rows: page.rows, page, source: legacy.source };
}
