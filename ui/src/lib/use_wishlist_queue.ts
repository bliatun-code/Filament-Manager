import { useCallback, useMemo, useState } from "react";
import type { WishlistItemRow } from "./tauri_client";
import {
  filterWishlistQueueItems,
  summarizeWishlistQueue,
  type WishlistStatusFilter,
} from "./wishlist_data_source";

export function useWishlistQueue(wishlistItems: WishlistItemRow[]) {
  const [wishlistQueueFilter, setWishlistQueueFilter] =
    useState<WishlistStatusFilter>("WISHLIST");
  const [wishlistQueueQuery, setWishlistQueueQuery] = useState("");
  const [confirmWishlistRemoveId, setConfirmWishlistRemoveId] = useState<string | null>(null);

  const visibleWishlistItems = useMemo(
    () => filterWishlistQueueItems(wishlistItems, wishlistQueueFilter, wishlistQueueQuery),
    [wishlistItems, wishlistQueueFilter, wishlistQueueQuery],
  );

  const wishlistQueueSummary = useMemo(
    () => summarizeWishlistQueue(wishlistItems),
    [wishlistItems],
  );

  const resetWishlistQueue = useCallback((filter: WishlistStatusFilter = "WISHLIST") => {
    setWishlistQueueFilter(filter);
    setWishlistQueueQuery("");
    setConfirmWishlistRemoveId(null);
  }, []);

  return {
    confirmWishlistRemoveId,
    resetWishlistQueue,
    setConfirmWishlistRemoveId,
    setWishlistQueueFilter,
    setWishlistQueueQuery,
    visibleWishlistItems,
    wishlistQueueFilter,
    wishlistQueueQuery,
    wishlistQueueSummary,
  };
}
