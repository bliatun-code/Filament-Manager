import { useCallback, useEffect, useState } from "react";
import type { PurchaseQueueQuery } from "./purchase_queue_page";
import type { WishlistStatusFilter } from "./wishlist_data_source";

export function useWishlistQueue(active = true) {
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState<PurchaseQueueQuery>({ status: "WISHLIST", search: "", offset: 0 });
  const [removeConfirmation, setRemoveConfirmation] = useState<{ authorityKey: string; itemId: string } | null>(null);
  useEffect(() => {
    if (!active || searchText === query.search) return;
    const timer = window.setTimeout(() => {
      setQuery(current => ({ ...current, search: searchText, offset: 0 }));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [active, query.search, searchText]);

  const setWishlistQueueQuery = useCallback((text: string) => {
    setSearchText(text);
    if (!text) {
      setQuery(current => current.search || current.offset ? { ...current, search: "", offset: 0 } : current);
    }
  }, []);

  const setWishlistQueueFilter = useCallback((status: WishlistStatusFilter) =>
    setQuery({ status, search: searchText, offset: 0 }), [searchText]);

  const setOffset = useCallback((offset: number) => setQuery(current => ({
    ...current, search: searchText, offset: current.search === searchText ? offset : 0,
  })), [searchText]);

  const resetWishlistQueue = useCallback((status: WishlistStatusFilter = "WISHLIST") => {
    setSearchText("");
    setQuery({ status, search: "", offset: 0 });
    setRemoveConfirmation(null);
  }, []);
  return { query, searchText, setOffset, removeConfirmation, resetWishlistQueue, setRemoveConfirmation,
    setWishlistQueueFilter, setWishlistQueueQuery };
}
