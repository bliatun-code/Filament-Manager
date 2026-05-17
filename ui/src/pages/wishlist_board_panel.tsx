import type { I18nContextValue } from "../lib/i18n";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import type { WishlistStatus } from "../lib/wishlist_data_source";
import { WishlistItemCard } from "./wishlist_item_card";

type Translate = I18nContextValue["t"];

export function WishlistBoardPanel({
  allItemCount,
  busy,
  confirmDeleteWishlistId,
  items,
  loading,
  masterById,
  onDelete,
  onStock,
  onStatus,
  tauri,
  t,
}: {
  allItemCount: number;
  busy: boolean;
  confirmDeleteWishlistId: string | null;
  items: WishlistItemRow[];
  loading: boolean;
  masterById: Map<string, MasterCatalogRow>;
  onDelete: (itemId: string) => void;
  onStock: (item: WishlistItemRow) => void;
  onStatus: (itemId: string, status: WishlistStatus) => void;
  tauri: boolean;
  t: Translate;
}) {
  return (
    <section className="surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-eyebrow">
            {t("wishlist.board", "Wishlist board")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t(
              "wishlist.boardHint",
              "Keep planned purchases moving from wishlist to stock here.",
            )}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-none">
          {items.length} / {allItemCount}
        </div>
      </div>

      {loading ? (
        <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-600 dark:text-slate-300">
          {t("wishlist.loading", "Loading wishlist...")}
        </div>
      ) : null}
      {!loading && items.length === 0 ? (
        <div className="surface-subtle mt-4 border-dashed p-5 text-sm text-slate-600 dark:text-slate-300">
          {allItemCount === 0
            ? t("wishlist.none", "No wishlist items yet.")
            : t("wishlist.noneFiltered", "No items match the selected status filter.")}
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {items.map((item) => {
          const linkedMaster = item.master_id ? masterById.get(item.master_id) ?? null : null;
          return (
            <WishlistItemCard
              key={item.id}
              busy={busy}
              confirmDeleteWishlistId={confirmDeleteWishlistId}
              item={item}
              linkedMaster={linkedMaster}
              onDelete={onDelete}
              onStock={onStock}
              onStatus={onStatus}
              tauri={tauri}
              t={t}
            />
          );
        })}
      </div>
    </section>
  );
}
