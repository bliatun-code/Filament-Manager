import { useCallback, useMemo, useState } from "react";
import type { WishlistItemRow } from "./tauri_client";
import {
  filterWishlistItems,
  summarizeWishlistQueue,
  type WishlistStatusFilter,
} from "./wishlist_data_source";

export function useWishlistQueue(wishlistItems: WishlistItemRow[]) {
  const [wishlistQueueFilter, setWishlistQueueFilter] =
    useState<WishlistStatusFilter>("WISHLIST");
  const [confirmWishlistRemoveId, setConfirmWishlistRemoveId] = useState<string | null>(null);

  const visibleWishlistItems = useMemo(
    () => filterWishlistItems(wishlistItems, wishlistQueueFilter),
    [wishlistItems, wishlistQueueFilter],
  );

  const wishlistQueueSummary = useMemo(
    () => summarizeWishlistQueue(wishlistItems),
    [wishlistItems],
  );

  const resetWishlistQueue = useCallback(() => {
    setWishlistQueueFilter("WISHLIST");
    setConfirmWishlistRemoveId(null);
  }, []);

  return {
    confirmWishlistRemoveId,
    resetWishlistQueue,
    setConfirmWishlistRemoveId,
    setWishlistQueueFilter,
    visibleWishlistItems,
    wishlistQueueFilter,
    wishlistQueueSummary,
  };
}
