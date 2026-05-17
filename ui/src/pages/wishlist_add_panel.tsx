import { neutralChipClass } from "../lib/chip_styles";
import { toSwatchColor } from "../lib/color_utils";
import type { I18nContextValue } from "../lib/i18n";
import type {
  WishlistCatalogFilter as CatalogFilter,
  WishlistDraft,
} from "../lib/wishlist_data_source";
import type { MasterCatalogRow } from "../lib/tauri_client";
import {
  type WishlistCreateMode,
  wishlistInputClass,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";
import { WishlistCatalogPicker } from "./wishlist_catalog_picker";
import { WishlistCurrentSelectionCard } from "./wishlist_current_selection_card";
import { WishlistMetricTile } from "./wishlist_ui";

type Translate = I18nContextValue["t"];

export function WishlistAddPanel({
  activeCatalogCount,
  activeCatalogMatches,
  activeRefreshVendor,
  bambuCatalogFilter,
  bambuCatalogQuery,
  busy,
  createMode,
  currentDraft,
  currentSelectionDiscontinued,
  currentSelectionHex,
  filteredBambuMasters,
  filteredEsunMasters,
  manualColorName,
  manualFilamentName,
  manualHexColor,
  manualMaterial,
  manualVendor,
  onAdd,
  selectedBambuMaster,
  setBambuCatalogFilter,
  setBambuCatalogQuery,
  setCreateMode,
  setEsunCatalogFilter,
  setEsunCatalogQuery,
  setManualColorName,
  setManualFilamentName,
  setManualHexColor,
  setManualMaterial,
  setManualVendor,
  setNewBambuMasterId,
  setNewEsunMasterId,
  setWishlistNote,
  setWishlistQuantity,
  t,
  tauri,
  visibleItemCount,
  wishlistItemCount,
  wishlistNote,
  wishlistQuantity,
  esunCatalogFilter,
  esunCatalogQuery,
  newBambuMasterId,
  newEsunMasterId,
}: {
  activeCatalogCount: number;
  activeCatalogMatches: number;
  activeRefreshVendor: WishlistRefreshVendor;
  bambuCatalogFilter: CatalogFilter;
  bambuCatalogQuery: string;
  busy: boolean;
  createMode: WishlistCreateMode;
  currentDraft: WishlistDraft | null;
  currentSelectionDiscontinued: boolean;
  currentSelectionHex: string | null;
  filteredBambuMasters: MasterCatalogRow[];
  filteredEsunMasters: MasterCatalogRow[];
  manualColorName: string;
  manualFilamentName: string;
  manualHexColor: string;
  manualMaterial: string;
  manualVendor: string;
  newBambuMasterId: string;
  newEsunMasterId: string;
  onAdd: () => void;
  selectedBambuMaster: MasterCatalogRow | null;
  setBambuCatalogFilter: (filter: CatalogFilter) => void;
  setBambuCatalogQuery: (query: string) => void;
  setCreateMode: (mode: WishlistCreateMode) => void;
  setEsunCatalogFilter: (filter: CatalogFilter) => void;
  setEsunCatalogQuery: (query: string) => void;
  setManualColorName: (value: string) => void;
  setManualFilamentName: (value: string) => void;
  setManualHexColor: (value: string) => void;
  setManualMaterial: (value: string) => void;
  setManualVendor: (value: string) => void;
  setNewBambuMasterId: (masterId: string) => void;
  setNewEsunMasterId: (masterId: string) => void;
  setWishlistNote: (note: string) => void;
  setWishlistQuantity: (quantity: string) => void;
  t: Translate;
  tauri: boolean;
  visibleItemCount: number;
  wishlistItemCount: number;
  wishlistNote: string;
  wishlistQuantity: string;
  esunCatalogFilter: CatalogFilter;
  esunCatalogQuery: string;
}) {
  return (
    <section className="surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="section-eyebrow">
            {t("wishlist.addTitle", "Add wishlist entry")}
          </div>
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {t(
              "wishlist.addHint",
              "Choose a catalog-backed filament or build a manual fallback, then send it into the wishlist flow below.",
            )}
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:shadow-none">
          {createMode === "manual"
            ? t("vendor.generic", "Generic")
            : createMode === "esun"
              ? t("vendor.esun", "eSUN")
              : t("vendor.bambu", "Bambu")}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <WishlistMetricTile
          label={t("wishlist.catalog", "catalog")}
          value={activeCatalogCount}
          hint={
            createMode === "manual"
              ? t(
                  "wishlist.manualHint",
                  "Use manual mode when the vendor catalog is missing the filament you need.",
                )
              : activeRefreshVendor
          }
        />
        <WishlistMetricTile
          label={t("wishlist.catalogMatches", "Catalog matches")}
          value={createMode === "manual" ? "Manual" : activeCatalogMatches}
          hint={
            createMode === "manual"
              ? t(
                  "wishlist.manualHint",
                  "Use manual mode when the vendor catalog is missing the filament you need.",
                )
              : t("wishlist.currentSelection", "Current selection")
          }
        />
        <WishlistMetricTile
          label={t("wishlist.visibleItems", "Visible items")}
          value={visibleItemCount}
          hint={`${t("common.all", "All")}: ${wishlistItemCount}`}
        />
      </div>

      <div className="surface-subtle mt-5 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {t("wishlist.currentSelection", "Current selection")}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className={neutralChipClass(createMode === "bambu", "px-3 py-2 text-xs")}
            onClick={() => setCreateMode("bambu")}
          >
            {t("vendor.bambu", "Bambu")}
          </button>
          <button
            type="button"
            className={neutralChipClass(createMode === "esun", "px-3 py-2 text-xs")}
            onClick={() => setCreateMode("esun")}
          >
            {t("vendor.esun", "eSUN")}
          </button>
          <button
            type="button"
            className={neutralChipClass(createMode === "manual", "px-3 py-2 text-xs")}
            onClick={() => setCreateMode("manual")}
          >
            {t("vendor.generic", "Generic")}
          </button>
        </div>

        <WishlistCurrentSelectionCard
          createMode={createMode}
          currentDraft={currentDraft}
          currentSelectionDiscontinued={currentSelectionDiscontinued}
          currentSelectionHex={currentSelectionHex}
          t={t}
        />
      </div>

      <div className="mt-5 space-y-4">
        {createMode === "bambu" ? (
          <WishlistCatalogPicker
            catalogFilter={bambuCatalogFilter}
            catalogQuery={bambuCatalogQuery}
            filteredMasters={filteredBambuMasters}
            missingAction={{
              label: t(
                "wishlist.addMissingBambuManual",
                "Bambu filament missing? Add it manually",
              ),
              onClick: () => {
                setCreateMode("manual");
                setManualVendor("Bambu");
                if (selectedBambuMaster) {
                  setManualMaterial(selectedBambuMaster.material);
                }
              },
            }}
            onCatalogFilterChange={setBambuCatalogFilter}
            onCatalogQueryChange={setBambuCatalogQuery}
            onMasterChange={setNewBambuMasterId}
            selectedMasterId={newBambuMasterId}
            tauri={tauri}
            t={t}
            vendor="bambu"
          />
        ) : null}

        {createMode === "esun" ? (
          <WishlistCatalogPicker
            catalogFilter={esunCatalogFilter}
            catalogQuery={esunCatalogQuery}
            filteredMasters={filteredEsunMasters}
            onCatalogFilterChange={setEsunCatalogFilter}
            onCatalogQueryChange={setEsunCatalogQuery}
            onMasterChange={setNewEsunMasterId}
            selectedMasterId={newEsunMasterId}
            tauri={tauri}
            t={t}
            vendor="esun"
          />
        ) : null}

        {createMode === "manual" ? (
          <div className="surface-subtle p-4">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              {t(
                "wishlist.manualHint",
                "Use manual mode when the vendor catalog is missing the filament you need.",
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {["Bambu", "eSUN", "Generic"].map((vendorPreset) => (
                <button
                  key={vendorPreset}
                  type="button"
                  onClick={() => setManualVendor(vendorPreset)}
                  className={neutralChipClass(
                    manualVendor.trim().toLowerCase() ===
                      vendorPreset.toLowerCase(),
                    "px-3 py-1 text-[11px]",
                  )}
                >
                  {vendorPreset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={manualVendor}
              onChange={(event) => setManualVendor(event.target.value)}
              placeholder={t("wishlist.vendorPlaceholder", "Vendor (e.g. Generic, eSUN)")}
              className={`mt-3 ${wishlistInputClass}`}
              disabled={!tauri}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={manualMaterial}
                onChange={(event) => setManualMaterial(event.target.value)}
                placeholder={t("wishlist.materialPlaceholder", "Material (e.g. PLA)")}
                className={wishlistInputClass}
                disabled={!tauri}
              />
              <input
                type="text"
                value={manualFilamentName}
                onChange={(event) => setManualFilamentName(event.target.value)}
                placeholder={t("wishlist.filamentName", "Filament name")}
                className={wishlistInputClass}
                disabled={!tauri}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={manualColorName}
                onChange={(event) => setManualColorName(event.target.value)}
                placeholder={t("wishlist.colorName", "Color name")}
                className={wishlistInputClass}
                disabled={!tauri}
              />
              <input
                type="text"
                value={manualHexColor}
                onChange={(event) => setManualHexColor(event.target.value)}
                placeholder={t("wishlist.hexOptional", "Hex color (optional)")}
                className={`${wishlistInputClass} sm:w-[150px]`}
                disabled={!tauri}
              />
              <input
                type="color"
                value={toSwatchColor(manualHexColor)}
                onChange={(event) => setManualHexColor(event.target.value)}
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white p-1 dark:border-slate-600 dark:bg-slate-900/70 sm:w-16"
                disabled={!tauri}
              />
              <span
                className="hidden h-11 w-11 rounded-2xl border border-slate-200 shadow-inner dark:border-slate-600 sm:block"
                style={{ backgroundColor: toSwatchColor(manualHexColor) }}
              />
            </div>
          </div>
        ) : null}

        <div className="surface-subtle p-4">
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <input
              type="number"
              min={1}
              value={wishlistQuantity}
              onChange={(event) => setWishlistQuantity(event.target.value)}
              placeholder={t("wishlist.qty", "Qty")}
              className={wishlistInputClass}
            />
            <input
              type="text"
              value={wishlistNote}
              onChange={(event) => setWishlistNote(event.target.value)}
              placeholder={t("wishlist.noteOptional", "Note (optional)")}
              className={wishlistInputClass}
            />
          </div>
        </div>

        <button
          type="button"
          className="header-button-primary w-full"
          onClick={onAdd}
          disabled={!tauri || busy}
        >
          {t("wishlist.addButton", "Add to wishlist")}
        </button>
      </div>
    </section>
  );
}
