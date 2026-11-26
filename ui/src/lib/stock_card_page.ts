import type { LibraryReadTarget } from "./tauri_library_sync_client";
import { getStockCardPage, type StockCardFilters } from "./tauri_stock_cards_client";
import { mapSpoolRowToInventorySpool } from "./inventory_data_source";

async function readStockCards(target: LibraryReadTarget, offset: number, memberOf?: string, search = "", filters?: StockCardFilters, reuseOptions = false) {
  const queryFilters = reuseOptions && filters ? {...filters, include_options: false} : filters;
  const response = await getStockCardPage(target, offset, memberOf, search, queryFilters);
  if (!response) return null;
  const cards = response.cards.map(card => ({...card, rows: card.rows.map(mapSpoolRowToInventorySpool)}));
  const sortedOptions = (values: string[]) => ["ALL", ...values.sort((a,b) => a.localeCompare(b))];
  const options = response.options && {
    materials: sortedOptions(response.options.materials),
    vendors: sortedOptions(response.options.vendors),
  };
  return {...response, target, cards, search, filters, options};
}
export type StockCards = NonNullable<Awaited<ReturnType<typeof readStockCards>>>;

export async function loadStockCards(
  target: LibraryReadTarget,
  previous?: StockCards,
  memberOf?: string,
  search = previous?.search ?? "",
  filters = previous?.filters,
) {
  if (previous && (previous.target.base_url !== target.base_url ||
    previous.target.expected_library_id !== target.expected_library_id ||
    previous.target.target_generation !== target.target_generation)) {
    return readStockCards(target, 0);
  }
  const group = memberOf ? previous?.cards.find(card => card.rows[0]?.id === memberOf) : undefined;
  const reuseOptions = Boolean(previous?.options && filters?.include_options);
  const offset = group?.rows.length ?? previous?.cards.length ?? 0;
  const page = await readStockCards(target, offset, memberOf, search, filters, reuseOptions);
  if (!page || !previous) return page;
  if (page.revisions.length !== 2 || previous.revisions.length !== 2 ||
    !page.revisions.every((revision, i) => revision === previous.revisions[i])) {
    return readStockCards(target, 0, undefined, search, filters);
  }
  const options = reuseOptions ? previous.options : page.options;
  if (group && page.cards[0]) {
    const extra = page.cards[0].rows;
    return {...previous, options, cards: previous.cards.map(card => card === group ? {...card, rows: [...card.rows, ...extra]} : card)};
  }
  return {...page, options, cards: [...previous.cards, ...page.cards]};
}
