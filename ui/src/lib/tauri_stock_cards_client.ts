import { invoke } from "./tauri_invoke";
import type { LibraryReadTarget } from "./tauri_library_sync_client";
import type { SpoolWithMasterRow } from "./tauri_inventory_client";

type StockCardResponse = {
  cards: {count: number; remaining: number; rows: SpoolWithMasterRow[]}[];
  groups: number; visible: number; total: number; borrowed: number; revisions: number[];
};

export function getStockCardPage(target: LibraryReadTarget, offset: number, memberOf?: string) {
  return invoke<StockCardResponse | null>("get_stock_card_page", {
    target, query: { offset, member_of: memberOf, locale: navigator.language },
  });
}
