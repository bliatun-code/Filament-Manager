import type { LibraryReadTarget } from "./tauri_library_sync_client";
import { getStockCardPage, type StockCardFilters } from "./tauri_stock_cards_client";
import { mapSpoolRowToInventorySpool } from "./inventory_data_source";

async function readStockCards(target: LibraryReadTarget, offset: number, memberOf?: string, search = "", filters?: StockCardFilters) {
  const response = await getStockCardPage(target, offset, memberOf, search, filters);
  if (!response) return null;
  const cards = response.cards.map(card => ({...card, rows: card.rows.map(mapSpoolRowToInventorySpool)}));
  const sortedOptions = (values: string[]) => ["ALL", ...values.sort((a,b) => a.localeCompare(b))];
  const options = response.options && {
    materials: sortedOptions(response.options.materials),
    vendors: sortedOptions(response.options.vendors),
  };
  return {...response, cards, search, filters, options};
}
export type StockCards = NonNullable<Awaited<ReturnType<typeof readStockCards>>>;

export async function loadStockCards(
  target: LibraryReadTarget,
  previous?: StockCards,
  memberOf?: string,
  search = previous?.search ?? "",
  filters = previous?.filters,
) {
  const group = memberOf ? previous?.cards.find(card => card.rows[0]?.id === memberOf) : undefined;
  const page = await readStockCards(target, group?.rows.length ?? previous?.cards.length ?? 0, memberOf, search, filters);
  if (!page || !previous) return page;
  if (!page.revisions.every((revision, i) => revision === previous.revisions[i])) return readStockCards(target, 0, undefined, search, filters);
  if (group && page.cards[0]) {
    const extra = page.cards[0].rows;
    return {...previous, cards: previous.cards.map(card => card === group ? {...card, rows: [...card.rows, ...extra]} : card)};
  }
  return {...page, cards: [...previous.cards, ...page.cards]};
}
