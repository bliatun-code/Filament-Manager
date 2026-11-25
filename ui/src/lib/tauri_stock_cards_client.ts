import { invoke } from "./tauri_invoke";
import type { LibraryReadTarget } from "./tauri_library_sync_client";
import type { SpoolWithMasterRow } from "./tauri_inventory_client";

export type StockCardFilters = {
  status?: string; ownership?: string; material?: string; vendor?: string;
  location_id?: string; low_stock: boolean; include_options: boolean;
};

type StockCardResponse = {
  options?: { materials: string[]; vendors: string[] };
  cards: {count: number; remaining: number; rows: SpoolWithMasterRow[]}[];
  groups: number; visible: number; total: number; borrowed: number; revisions: number[];
};

export function getStockCardPage(target: LibraryReadTarget, offset: number, memberOf?: string, search = "", filters?: StockCardFilters) {
  return invoke<StockCardResponse | null>("get_stock_card_page", {
    target, query: { offset, search, filters, member_of: memberOf, locale: navigator.language },
  });
}
