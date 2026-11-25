import type { LibraryReadTarget } from "./tauri_library_sync_client";
import { getStockCardPage } from "./tauri_stock_cards_client";
import { mapSpoolRowToInventorySpool } from "./inventory_data_source";

async function readStockCards(target: LibraryReadTarget, offset: number, memberOf?: string, search = "") {
  const response = await getStockCardPage(target, offset, memberOf, search);
  if (!response) return null;
  const cards = response.cards.map(card => ({...card, rows: card.rows.map(mapSpoolRowToInventorySpool)}));
  return {...response, cards, search};
}
export type StockCards = NonNullable<Awaited<ReturnType<typeof readStockCards>>>;

export async function loadStockCards(
  target: LibraryReadTarget,
  previous?: StockCards,
  memberOf?: string,
  search = previous?.search ?? "",
) {
  const group = memberOf ? previous?.cards.find(card => card.rows[0]?.id === memberOf) : undefined;
  const page = await readStockCards(target, group?.rows.length ?? previous?.cards.length ?? 0, memberOf, search);
  if (!page || !previous) return page;
  if (!page.revisions.every((revision, i) => revision === previous.revisions[i])) return readStockCards(target, 0, undefined, search);
  if (group && page.cards[0]) {
    const extra = page.cards[0].rows;
    return {...previous, cards: previous.cards.map(card => card === group ? {...card, rows: [...card.rows, ...extra]} : card)};
  }
  return {...page, cards: [...previous.cards, ...page.cards]};
}
