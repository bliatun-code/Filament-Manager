import { useEffect, useMemo, useState } from "react";
import {
  filterWishlistItems,
  summarizeWishlistQueue,
  type WishlistStatusFilter as WishlistBoardFilter,
} from "../lib/wishlist_data_source";
import type { WishlistItemRow } from "../lib/tauri_client";

export function useWishlistBoardState(wishlistItems: WishlistItemRow[]) {
  const [boardFilter, setBoardFilter] = useState<WishlistBoardFilter>("WISHLIST");
  const [confirmDeleteWishlistId, setConfirmDeleteWishlistId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!confirmDeleteWishlistId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmDeleteWishlistId(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteWishlistId]);

  useEffect(() => {
    if (!confirmDeleteWishlistId) {
      return;
    }
    if (!wishlistItems.some((item) => item.id === confirmDeleteWishlistId)) {
      setConfirmDeleteWishlistId(null);
    }
  }, [confirmDeleteWishlistId, wishlistItems]);

  const wishlistSummary = useMemo(() => {
    return summarizeWishlistQueue(wishlistItems);
  }, [wishlistItems]);

  const visibleWishlistItems = useMemo(() => {
    return filterWishlistItems(wishlistItems, boardFilter);
  }, [boardFilter, wishlistItems]);

  function toggleBoardFilter(next: WishlistBoardFilter) {
    setBoardFilter((current) => {
      if (next === "ALL") {
        return "ALL";
      }
      return current === next ? "ALL" : next;
    });
  }

  return {
    boardFilter,
    confirmDeleteWishlistId,
    setConfirmDeleteWishlistId,
    toggleBoardFilter,
    visibleWishlistItems,
    wishlistSummary,
  };
}
