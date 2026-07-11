import { VendorBadge } from "./vendor_badge";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { InventorySwatchChip } from "./inventory_swatch_chip";
import { useI18n } from "../lib/i18n";
import { formatInventoryDisplayTitle } from "../lib/inventory_list_model";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import { formInputChromeClassName } from "./form_control_class";
import {
  canStockWishlistItem,
  normalizeWishlistStatus,
  type WishlistQueueSummary,
  type WishlistStatus,
  type WishlistStatusFilter,
} from "../lib/wishlist_data_source";

type WishlistQueuePanelProps = {
  busy: boolean;
  catalogMasterById: Map<string, MasterCatalogRow>;
  confirmWishlistRemoveId: string | null;
  items: WishlistItemRow[];
  loading: boolean;
  onCancelDeleteItem: () => void;
  onDeleteItem: (itemId: string) => void;
  onFilterChange: (filter: WishlistStatusFilter) => void;
  onQueryChange: (query: string) => void;
  onRequestDeleteItem: (itemId: string) => void;
  onStatusChange: (itemId: string, status: WishlistStatus) => void;
  onStockItem: (item: WishlistItemRow) => void;
  resolvedTheme: ResolvedTheme;
  query: string;
  summary: WishlistQueueSummary;
  tauriAvailable: boolean;
  visibleItems: WishlistItemRow[];
  value: WishlistStatusFilter;
};

function wishlistItemHex(
  item: WishlistItemRow,
  catalogMasterById: Map<string, MasterCatalogRow>,
): string | null {
  return item.master_id ? catalogMasterById.get(item.master_id)?.hex_color ?? null : null;
}

type WishlistQueueActionTone = "stock" | "remove" | "danger";

function wishlistQueueActionButtonClassName(tone: WishlistQueueActionTone): string {
  const base =
    "inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[11px] font-semibold outline-none transition focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:border-sky-400/60 dark:focus-visible:ring-sky-500/20";

  if (tone === "stock") {
    return `${base} border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20`;
  }
  if (tone === "danger") {
    return `${base} border-rose-500 bg-rose-600 text-white shadow-sm shadow-rose-300/25 hover:bg-rose-700 dark:border-rose-400/70 dark:bg-rose-500/25 dark:text-rose-100 dark:shadow-none dark:hover:bg-rose-500/35`;
  }

  return `${base} border-slate-300 bg-white/80 text-slate-700 hover:bg-white dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900/80`;
}

export function WishlistQueuePanel({
  busy,
  catalogMasterById,
  confirmWishlistRemoveId,
  items,
  loading,
  onCancelDeleteItem,
  onDeleteItem,
  onFilterChange,
  onQueryChange,
  onRequestDeleteItem,
  onStatusChange,
  onStockItem,
  query,
  resolvedTheme,
  summary,
  tauriAvailable,
  value,
  visibleItems,
}: WishlistQueuePanelProps) {
  const { t } = useI18n();
  const resultCount = t(
    "wishlist.resultCount",
    "{count, plural, one {# item} other {# items}}",
    { count: visibleItems.length },
  );

  return (
    <div className="surface-card space-y-4">
      <div className="surface-subtle p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {t("inventory.wishlistOrders", "Wishlist & orders")}
            </div>
            <div className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {t(
                "inventory.wishlistQueueHelp",
                "Keep planned purchases here, move them to on order, then stock them when they arrive.",
              )}
            </div>
          </div>
        </div>
        <SegmentedChoiceRow
          className="mt-4"
          groupAriaLabel={t("wishlist.statusFilter", "Wishlist status filter")}
          value={value}
          onChange={onFilterChange}
          options={[
            {
              value: "ALL",
              label: t("common.all", "All"),
              count: summary.all,
            },
            {
              value: "WISHLIST",
              label: t("wishlist.statusWishlist", "Wishlist"),
              count: summary.wishlist,
            },
            {
              value: "ON_ORDER",
              label: t("wishlist.statusOnOrder", "On order"),
              count: summary.onOrder,
            },
            {
              value: "RECEIVED",
              label: t("wishlist.statusReceived", "Received"),
              count: summary.received,
            },
          ]}
        />
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <label className="block min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("wishlist.searchQueueLabel", "Search purchase queue")}
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={t(
                "wishlist.searchQueuePlaceholder",
                "Search by name, color or vendor",
              )}
              className={`mt-1.5 w-full ${formInputChromeClassName}`}
            />
          </label>
          <span className="count-pill tabular-nums" aria-live="polite">
            {resultCount}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
          {t("wishlist.loading", "Loading wishlist...")}
        </div>
      ) : null}
      {!loading && items.length === 0 ? (
        <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
          {t("wishlist.empty", "No wishlist items yet.")}
        </div>
      ) : null}
      {!loading && items.length > 0 && visibleItems.length === 0 ? (
        <div className="surface-subtle border-dashed px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
          {query.trim()
            ? t("wishlist.noSearchResults", "No wishlist items match this search.")
            : t("wishlist.noneFiltered", "No items match the selected status filter.")}
        </div>
      ) : null}

      <div className="max-h-[28rem] space-y-2 overflow-y-auto overscroll-contain pr-1 lg:max-h-[32rem]">
        {visibleItems.map((item) => {
          const itemHex = wishlistItemHex(item, catalogMasterById);
          const itemStatus = normalizeWishlistStatus(item.status);
          const canStockItem = canStockWishlistItem(item.status);
          const itemTitle = formatInventoryDisplayTitle(
            item.material,
            item.filament_name,
            item.color_name,
          );
          const confirmingRemove = confirmWishlistRemoveId === item.id;
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 p-3.5 text-xs shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:shadow-none"
              style={inventorySwatchInsetStyle(itemHex, resolvedTheme)}
            >
              <div className="flex items-start gap-3">
                <InventorySwatchChip
                  className="h-12 w-12 rounded-2xl"
                  swatchColor={itemHex}
                  tone="soft"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {itemTitle}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VendorBadge vendor={item.vendor} compact />
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {t("wishlist.qty", "Qty")} {item.quantity}
                    </span>
                  </div>
                  {item.note ? (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-slate-600 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-300">
                      {item.note}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-slate-700/80">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {t("inventory.status", "Status")}
                </div>
                <SegmentedChoiceRow<WishlistStatus>
                  className="mt-2"
                  groupAriaLabel={t("wishlist.itemStatusGroup", "Status for {name}", {
                    name: itemTitle,
                  })}
                  value={itemStatus}
                  onChange={(nextStatus) => onStatusChange(item.id, nextStatus)}
                  optionSizeClassName="px-3 py-1.5 text-[11px]"
                  isOptionDisabled={(option) =>
                    !tauriAvailable || busy || itemStatus === option.value
                  }
                  options={[
                    {
                      value: "WISHLIST",
                      label: t("wishlist.statusWishlist", "Wishlist"),
                    },
                    {
                      value: "ON_ORDER",
                      label: t("wishlist.statusOnOrder", "On order"),
                    },
                    {
                      value: "RECEIVED",
                      label: t("wishlist.statusReceived", "Received"),
                    },
                  ]}
                />
                {confirmingRemove ? (
                  <div
                    className="mt-3 rounded-xl border border-rose-300 bg-rose-50/95 p-3 text-rose-950 dark:border-rose-400/45 dark:bg-rose-500/15 dark:text-rose-100"
                    role="alert"
                  >
                    <div className="font-semibold">
                      {t(
                        "wishlist.confirmRemoveTitle",
                        "Remove {name} from the purchase queue?",
                        { name: itemTitle },
                      )}
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-rose-800 dark:text-rose-200">
                      {t(
                        "wishlist.confirmRemoveHint",
                        "This removes the queue entry. Existing inventory rolls are not affected.",
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={wishlistQueueActionButtonClassName("danger")}
                        onClick={() => onDeleteItem(item.id)}
                        disabled={!tauriAvailable || busy}
                      >
                        {t("wishlist.confirmRemoveAction", "Confirm remove")}
                      </button>
                      <button
                        type="button"
                        className={wishlistQueueActionButtonClassName("remove")}
                        onClick={onCancelDeleteItem}
                        disabled={busy}
                      >
                        {t("common.cancel", "Cancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canStockItem ? (
                      <button
                        type="button"
                        className={wishlistQueueActionButtonClassName("stock")}
                        onClick={() => onStockItem(item)}
                        disabled={!tauriAvailable || busy}
                      >
                        {t("inventory.stockRollNow", "Stock roll now")}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={wishlistQueueActionButtonClassName("remove")}
                      onClick={() => onRequestDeleteItem(item.id)}
                      disabled={!tauriAvailable || busy}
                    >
                      {t("common.remove", "Remove")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
