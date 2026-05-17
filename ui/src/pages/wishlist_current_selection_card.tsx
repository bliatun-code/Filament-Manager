import { VendorBadge } from "../components/vendor_badge";
import { toSwatchColor } from "../lib/color_utils";
import type { I18nContextValue } from "../lib/i18n";
import { materialTone } from "../lib/material_theme";
import type { WishlistDraft } from "../lib/wishlist_data_source";
import { statusBadgeClasses, type WishlistCreateMode } from "./wishlist_helpers";

type Translate = I18nContextValue["t"];

type WishlistCurrentSelectionCardProps = {
  createMode: WishlistCreateMode;
  currentDraft: WishlistDraft | null;
  currentSelectionDiscontinued: boolean;
  currentSelectionHex: string | null;
  t: Translate;
};

export function WishlistCurrentSelectionCard({
  createMode,
  currentDraft,
  currentSelectionDiscontinued,
  currentSelectionHex,
  t,
}: WishlistCurrentSelectionCardProps) {
  if (!currentDraft) {
    return (
      <div className="surface-subtle mt-4 border-dashed px-4 py-5 text-sm text-slate-600 dark:text-slate-300">
        {createMode === "manual"
          ? t(
              "wishlist.manualHint",
              "Use manual mode when the vendor catalog is missing the filament you need.",
            )
          : t(
              "wishlist.addHint",
              "Choose a catalog-backed filament or build a manual fallback, then send it into the wishlist flow below.",
            )}
      </div>
    );
  }

  const currentTone = materialTone(currentDraft.material);

  return (
    <div
      className={`mt-4 rounded-2xl border p-4 ${currentTone.card} ${currentTone.cardBorder}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="h-14 w-14 shrink-0 rounded-2xl border border-white/70 shadow-inner shadow-white/30 dark:border-white/10 dark:shadow-black/30"
          style={{ backgroundColor: toSwatchColor(currentSelectionHex) }}
        />
        <div className="min-w-0 flex-1">
          <div className="section-eyebrow">
            {t("wishlist.currentSelection", "Current selection")}
          </div>
          <div className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            {`${currentDraft.material} ${currentDraft.filament_name} (${currentDraft.color_name})`}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <VendorBadge vendor={currentDraft.vendor} compact />
            <span
              className={statusBadgeClasses(
                currentSelectionDiscontinued ? "ON_ORDER" : "WISHLIST",
              )}
            >
              {currentSelectionDiscontinued
                ? t("wishlist.discontinued", "Discontinued")
                : t("wishlist.active", "Active")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
