import { VendorBadge } from "./vendor_badge";
import { SegmentedChoiceRow } from "./segmented_choice_row";
import { semanticChipClass } from "../lib/chip_styles";
import { swatchCssBackground } from "../lib/color_utils";
import { useI18n } from "../lib/i18n";
import { formatInventoryDisplayTitle } from "../lib/inventory_list_model";
import { inventorySwatchInsetStyle } from "../lib/inventory_swatch_style";
import type { ResolvedTheme } from "../lib/theme_mode";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
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
  onDeleteItem: (itemId: string) => void;
  onFilterChange: (filter: WishlistStatusFilter) => void;
  onStatusChange: (itemId: string, status: WishlistStatus) => void;
  onStockItem: (item: WishlistItemRow) => void;
  resolvedTheme: ResolvedTheme;
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

export function WishlistQueuePanel({
  busy,
  catalogMasterById,
  confirmWishlistRemoveId,
  items,
  loading,
  onDeleteItem,
  onFilterChange,
  onStatusChange,
  onStockItem,
  resolvedTheme,
  summary,
  tauriAvailable,
  value,
  visibleItems,
}: WishlistQueuePanelProps) {
  const { t } = useI18n();

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
          {t("wishlist.noneFiltered", "No items match the selected status filter.")}
        </div>
      ) : null}

      <div className="space-y-2 lg:max-h-[32rem] lg:overflow-y-auto lg:pr-1">
        {visibleItems.map((item) => {
          const itemHex = wishlistItemHex(item, catalogMasterById);
          const itemStatus = normalizeWishlistStatus(item.status);
          const canStockItem = canStockWishlistItem(item.status);
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200 p-3.5 text-xs shadow-sm shadow-slate-900/5 dark:border-slate-700 dark:shadow-none"
              style={inventorySwatchInsetStyle(itemHex, resolvedTheme)}
            >
              <div className="flex items-start gap-3">
                <span
                  className="h-12 w-12 shrink-0 rounded-2xl border border-white/70 shadow-inner shadow-white/30 dark:border-white/10 dark:shadow-black/30"
                  style={{
                    background: swatchCssBackground(itemHex),
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-slate-50">
                    {formatInventoryDisplayTitle(
                      item.material,
                      item.filament_name,
                      item.color_name,
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <VendorBadge vendor={item.vendor} compact />
                    <span className={semanticChipClass("info", "px-3 py-1 text-[11px]")}>
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {canStockItem ? (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/20"
                      onClick={() => onStockItem(item)}
                      disabled={!tauriAvailable || busy}
                    >
                      {t("inventory.stockRollNow", "Stock roll now")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-[11px] font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:bg-slate-900/80"
                    onClick={() => onDeleteItem(item.id)}
                    disabled={!tauriAvailable || busy}
                  >
                    {confirmWishlistRemoveId === item.id
                      ? t("wishlist.confirmRemoveAction", "Confirm remove")
                      : t("common.remove", "Remove")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
