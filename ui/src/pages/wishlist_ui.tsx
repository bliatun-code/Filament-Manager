import { neutralChipClass } from "../lib/chip_styles";
import { toSwatchColor } from "../lib/color_utils";
import type { I18nContextValue } from "../lib/i18n";
import type {
  WishlistCatalogFilter as CatalogFilter,
  WishlistDraft,
  WishlistStatus,
  WishlistStatusFilter as WishlistBoardFilter,
} from "../lib/wishlist_data_source";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import {
  type WishlistCreateMode,
  wishlistInputClass,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";
import { WishlistCatalogPicker } from "./wishlist_catalog_picker";
import { WishlistCurrentSelectionCard } from "./wishlist_current_selection_card";
import { WishlistItemCard } from "./wishlist_item_card";

type Translate = I18nContextValue["t"];

export function WishlistMetricTile({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`surface-card-compact ${className}`.trim()}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className="mt-2 break-words text-2xl font-semibold leading-tight text-slate-950 dark:text-slate-50">
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{hint}</div>
      ) : null}
    </div>
  );
}

export function WishlistPageHeader({
  activeRefreshVendor,
  boardFilter,
  busy,
  catalogRefreshBusy,
  createMode,
  lastRefreshOutput,
  onRefreshActiveCatalog,
  onShowRefreshLog,
  onToggleBoardFilter,
  tauri,
  t,
  wishlistItemCount,
  wishlistSummary,
}: {
  activeRefreshVendor: WishlistRefreshVendor;
  boardFilter: WishlistBoardFilter;
  busy: boolean;
  catalogRefreshBusy: boolean;
  createMode: WishlistCreateMode;
  lastRefreshOutput: string;
  onRefreshActiveCatalog: () => void | Promise<void>;
  onShowRefreshLog: () => void;
  onToggleBoardFilter: (filter: WishlistBoardFilter) => void;
  tauri: boolean;
  t: Translate;
  wishlistItemCount: number;
  wishlistSummary: {
    onOrder: number;
    received: number;
    wishlist: number;
  };
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <div className="section-eyebrow">
          {t("wishlist.kicker", "Planning and ordering")}
        </div>
        <h1 className="page-title">{t("nav.wishlist", "Wishlist")}</h1>
        <div className="page-subtitle">
          {t(
            "wishlist.subtitle",
            "Plan purchases, refresh vendor catalogs, and move items from wishlist to stock.",
          )}
        </div>
      </div>
      <div className="page-header-actions">
        <div className="page-header-tools">
          <button
            type="button"
            className="header-button-secondary"
            onClick={onShowRefreshLog}
            disabled={!lastRefreshOutput.trim()}
          >
            {t("wishlist.viewRefreshLog", "View refresh log")}
          </button>
          <button
            type="button"
            className="header-button-primary"
            onClick={() => void onRefreshActiveCatalog()}
            disabled={!tauri || busy || catalogRefreshBusy}
          >
            {catalogRefreshBusy
              ? `${t("wishlist.refreshing", "Refreshing")} ${activeRefreshVendor} ${t("wishlist.catalog", "catalog")}...`
              : createMode === "esun"
                ? t("wishlist.refreshEsun", "Refresh eSUN catalog")
                : t("wishlist.refreshBambu", "Refresh Bambu catalog")}
          </button>
        </div>
        <div className="page-header-filter-surface">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 min-[920px]:w-20">
              {t("wishlist.state", "State")}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleBoardFilter("ALL")}
                className={neutralChipClass(
                  boardFilter === "ALL",
                  "px-3 py-1.5 text-xs",
                )}
              >
                {t("common.all", "All")} · {wishlistItemCount}
              </button>
              <button
                type="button"
                onClick={() => onToggleBoardFilter("WISHLIST")}
                className={neutralChipClass(
                  boardFilter === "WISHLIST",
                  "px-3 py-1.5 text-xs",
                )}
              >
                {t("wishlist.statusWishlist", "Wishlist")} · {wishlistSummary.wishlist}
              </button>
              <button
                type="button"
                onClick={() => onToggleBoardFilter("ON_ORDER")}
                className={neutralChipClass(
                  boardFilter === "ON_ORDER",
                  "px-3 py-1.5 text-xs",
                )}
              >
                {t("wishlist.statusOnOrder", "On order")} · {wishlistSummary.onOrder}
              </button>
              <button
                type="button"
                onClick={() => onToggleBoardFilter("RECEIVED")}
                className={neutralChipClass(
                  boardFilter === "RECEIVED",
                  "px-3 py-1.5 text-xs",
                )}
              >
                {t("wishlist.statusReceived", "Received")} · {wishlistSummary.received}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WishlistSummaryMetrics({
  boardFilter,
  t,
  wishlistItemCount,
  wishlistSummary,
}: {
  boardFilter: WishlistBoardFilter;
  t: Translate;
  wishlistItemCount: number;
  wishlistSummary: {
    onOrder: number;
    received: number;
    wishlist: number;
  };
}) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <WishlistMetricTile
        label={t("wishlist.trackedItems", "Tracked items")}
        value={wishlistItemCount}
        hint={t("wishlist.workflow", "Workflow: Wishlist → On order → Add to stock.")}
      />
      <WishlistMetricTile
        label={t("wishlist.statusWishlist", "Wishlist")}
        value={wishlistSummary.wishlist}
        hint={t("wishlist.addTitle", "Add wishlist entry")}
        className={boardFilter === "WISHLIST" ? "border-slate-400/50" : ""}
      />
      <WishlistMetricTile
        label={t("wishlist.statusOnOrder", "On order")}
        value={wishlistSummary.onOrder}
        hint={t(
          "wishlist.boardHint",
          "Keep planned purchases moving from wishlist to stock here.",
        )}
        className={boardFilter === "ON_ORDER" ? "border-amber-300/60" : ""}
      />
      <WishlistMetricTile
        label={t("wishlist.statusReceived", "Received")}
        value={wishlistSummary.received}
        hint={t("wishlist.addToStock", "Add to stock")}
        className={boardFilter === "RECEIVED" ? "border-emerald-300/60" : ""}
      />
    </div>
  );
}

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
              ? t("wishlist.manualHint", "Use manual mode when the vendor catalog is missing the filament you need.")
              : activeRefreshVendor
          }
        />
        <WishlistMetricTile
          label={t("wishlist.catalogMatches", "Catalog matches")}
          value={createMode === "manual" ? "Manual" : activeCatalogMatches}
          hint={
            createMode === "manual"
              ? t("wishlist.manualHint", "Use manual mode when the vendor catalog is missing the filament you need.")
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
