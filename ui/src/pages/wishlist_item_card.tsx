import { VendorBadge } from "../components/vendor_badge";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import { toSwatchColor } from "../lib/color_utils";
import type { I18nContextValue } from "../lib/i18n";
import { materialTone } from "../lib/material_theme";
import type { WishlistStatus } from "../lib/wishlist_data_source";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import { statusBadgeClasses } from "./wishlist_helpers";

type Translate = I18nContextValue["t"];

type WishlistItemCardProps = {
  busy: boolean;
  confirmDeleteWishlistId: string | null;
  item: WishlistItemRow;
  linkedMaster: MasterCatalogRow | null;
  onDelete: (itemId: string) => void;
  onStock: (item: WishlistItemRow) => void;
  onStatus: (itemId: string, status: WishlistStatus) => void;
  tauri: boolean;
  t: Translate;
};

export function WishlistItemCard({
  busy,
  confirmDeleteWishlistId,
  item,
  linkedMaster,
  onDelete,
  onStock,
  onStatus,
  tauri,
  t,
}: WishlistItemCardProps) {
  const swatchHex = linkedMaster?.hex_color ?? null;
  const itemTone = materialTone(item.material);

  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm shadow-slate-200/30 dark:shadow-none ${itemTone.card} ${itemTone.cardBorder}`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="h-14 w-14 shrink-0 rounded-2xl border border-white/70 shadow-inner shadow-white/30 dark:border-white/10 dark:shadow-black/30"
              style={{ backgroundColor: toSwatchColor(swatchHex) }}
            />
            <div className="min-w-0">
              <div className="break-words text-lg font-semibold text-slate-950 dark:text-slate-50">
                {item.material} · {item.filament_name} · {item.color_name}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <VendorBadge vendor={item.vendor} compact />
                <span className={statusBadgeClasses(item.status)}>
                  {item.status === "WISHLIST"
                    ? t("wishlist.statusWishlist", "Wishlist")
                    : item.status === "ON_ORDER"
                      ? t("wishlist.statusOnOrder", "On order")
                      : t("wishlist.statusReceived", "Received")}
                </span>
                <span className={semanticChipClass("info", "px-2 py-1 text-[11px]")}>
                  {t("wishlist.qty", "Qty")} {item.quantity}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("wishlist.qty", "Qty")}
            </div>
            <div className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
              {item.quantity}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/75 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-200">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("wishlist.noteOptional", "Note (optional)")}
            </div>
            <div className="mt-2 leading-6 text-slate-700 dark:text-slate-300">
              {item.note?.trim() || "—"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={neutralChipClass(
              item.status === "WISHLIST",
              "px-3 py-1.5 text-xs",
            )}
            onClick={() => onStatus(item.id, "WISHLIST")}
            disabled={!tauri || busy || item.status === "WISHLIST"}
          >
            {t("wishlist.statusWishlist", "Wishlist")}
          </button>
          <button
            type="button"
            className={neutralChipClass(
              item.status === "ON_ORDER",
              "px-3 py-1.5 text-xs",
            )}
            onClick={() => onStatus(item.id, "ON_ORDER")}
            disabled={!tauri || busy || item.status === "ON_ORDER"}
          >
            {t("wishlist.statusOnOrder", "On order")}
          </button>
          <button
            type="button"
            className={semanticChipClass("success", "px-3 py-1.5 text-xs")}
            onClick={() => onStock(item)}
            disabled={!tauri || busy || item.status === "RECEIVED"}
          >
            {t("wishlist.addToStock", "Add to stock")}
          </button>
          <button
            type="button"
            className={
              confirmDeleteWishlistId === item.id
                ? semanticChipClass("danger", "px-3 py-1.5 text-xs")
                : "rounded-full border border-rose-300/70 bg-rose-50/60 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-50 dark:border-rose-600/50 dark:bg-rose-900/10 dark:text-rose-300"
            }
            onClick={() => onDelete(item.id)}
            disabled={!tauri || busy}
          >
            {confirmDeleteWishlistId === item.id
              ? t("wishlist.confirmRemoveAction", "Confirm remove")
              : t("common.remove", "Remove")}
          </button>
        </div>
      </div>
    </div>
  );
}
