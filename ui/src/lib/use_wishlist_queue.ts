import { useCallback, useState } from "react";
import type { PurchaseQueueQuery } from "./purchase_queue_page";
import type { WishlistStatusFilter } from "./wishlist_data_source";

export function useWishlistQueue() {
  const [query, setQuery] = useState<PurchaseQueueQuery>({ status: "WISHLIST", search: "", offset: 0 });
  const [confirmWishlistRemoveId, setConfirmWishlistRemoveId] = useState<string | null>(null);
  const setWishlistQueueFilter = useCallback((status: WishlistStatusFilter) =>
    setQuery(current => ({ ...current, status, offset: 0 })), []);
  const setWishlistQueueQuery = useCallback((search: string) =>
    setQuery(current => ({ ...current, search, offset: 0 })), []);
  const setOffset = useCallback((offset: number) => setQuery(current => ({ ...current, offset })), []);
  const resetWishlistQueue = useCallback((status: WishlistStatusFilter = "WISHLIST") => {
    setQuery({ status, search: "", offset: 0 });
    setConfirmWishlistRemoveId(null);
  }, []);
  return { query, setOffset, confirmWishlistRemoveId, resetWishlistQueue, setConfirmWishlistRemoveId,
    setWishlistQueueFilter, setWishlistQueueQuery };
}
