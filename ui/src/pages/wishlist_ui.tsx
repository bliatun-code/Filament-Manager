import { AppModal } from "../components/app_modal";
import { neutralChipClass } from "../lib/chip_styles";
import { toSwatchColor } from "../lib/color_utils";
import type { I18nContextValue } from "../lib/i18n";
import type {
  WishlistCatalogFilter as CatalogFilter,
  WishlistDraft,
  WishlistStatus,
} from "../lib/wishlist_data_source";
import type {
  CatalogRefreshResult,
  MasterCatalogRow,
  WishlistItemRow,
} from "../lib/tauri_client";
import {
  type RefreshLogCopyState,
  type WishlistCreateMode,
  wishlistInputClass,
  wishlistSecondaryButtonClass,
  wishlistSelectClass,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";
import { WishlistCurrentSelectionCard } from "./wishlist_current_selection_card";
import { WishlistItemCard } from "./wishlist_item_card";

type Translate = I18nContextValue["t"];

const catalogFilters: ReadonlyArray<CatalogFilter> = [
  "ALL",
  "ACTIVE",
  "DISCONTINUED",
];

const wishlistModalOverlayClassName: Record<40 | 50, string> = {
  40: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-md dark:bg-black/55",
  50: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-md dark:bg-black/55",
};

const wishlistModalPanelClassName = {
  lg: "w-full max-w-lg rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45",
  xl: "w-full max-w-3xl rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45",
};

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

export function WishlistRefreshLogModal({
  activeRefreshVendor,
  copyState,
  lastRefreshOutput,
  onClose,
  onCopy,
  t,
}: {
  activeRefreshVendor: WishlistRefreshVendor;
  copyState: RefreshLogCopyState;
  lastRefreshOutput: string;
  onClose: () => void;
  onCopy: () => void;
  t: Translate;
}) {
  return (
    <AppModal
      zIndex={50}
      closeOnBackdrop
      onBackdropClose={onClose}
      overlayClassName={wishlistModalOverlayClassName[50]}
      panelClassName={wishlistModalPanelClassName.xl}
    >
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="section-eyebrow">
              {activeRefreshVendor} {t("wishlist.refreshLog", "refresh log")}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("wishlist.refreshLogFull", "Full catalog refresh output")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={wishlistSecondaryButtonClass}
              onClick={onCopy}
              disabled={!lastRefreshOutput.trim()}
            >
              {copyState === "copied"
                ? t("common.copied", "Copied")
                : copyState === "failed"
                  ? t("common.copyFailed", "Copy failed")
                  : t("wishlist.copyLog", "Copy log")}
            </button>
            <button
              type="button"
              className={wishlistSecondaryButtonClass}
              onClick={onClose}
            >
              {t("common.close", "Close")}
            </button>
          </div>
        </div>
        <pre className="mt-4 max-h-[65vh] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200">
          {lastRefreshOutput || t("wishlist.noRefreshOutput", "No refresh output available yet.")}
        </pre>
      </>
    </AppModal>
  );
}

export function WishlistCatalogRefreshModal({
  activeRefreshVendor,
  refreshElapsedSeconds,
  refreshProgressMessage,
  refreshProgressPhase,
  t,
}: {
  activeRefreshVendor: WishlistRefreshVendor;
  refreshElapsedSeconds: number;
  refreshProgressMessage: string;
  refreshProgressPhase: string;
  t: Translate;
}) {
  return (
    <AppModal
      zIndex={40}
      overlayClassName={wishlistModalOverlayClassName[40]}
      panelClassName={wishlistModalPanelClassName.lg}
    >
      <>
        <div className="section-eyebrow">
          {activeRefreshVendor} {t("wishlist.catalogRefresh", "catalog refresh")}
        </div>
        <div className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {refreshProgressMessage}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <WishlistMetricTile
            label={t("wishlist.phase", "Phase")}
            value={refreshProgressPhase}
            className="bg-white/80 dark:bg-slate-950/50"
          />
          <WishlistMetricTile
            label={t("wishlist.elapsed", "Elapsed")}
            value={`${refreshElapsedSeconds}s`}
            className="bg-white/80 dark:bg-slate-950/50"
          />
        </div>
        <div className="mt-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-2 w-2/3 rounded-full bg-slate-900 animate-pulse dark:bg-slate-100" />
        </div>
        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {t("wishlist.backgroundWork", "App is working in background. Keep this window open.")}
        </div>
      </>
    </AppModal>
  );
}

export function WishlistRefreshSummaryPanel({
  activeRefreshVendor,
  lastRefreshOutput,
  onViewLog,
  refreshSummary,
  t,
}: {
  activeRefreshVendor: WishlistRefreshVendor;
  lastRefreshOutput: string;
  onViewLog: () => void;
  refreshSummary: CatalogRefreshResult;
  t: Translate;
}) {
  return (
    <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50/90 p-5 text-emerald-950 shadow-sm shadow-emerald-200/30 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:shadow-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="section-eyebrow !text-emerald-800 dark:!text-emerald-200">
            {activeRefreshVendor} {t("wishlist.catalogRefresh", "catalog refresh")}
          </div>
          <div className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
            {t(
              "wishlist.refreshHint",
              "Keep the latest catalog refresh here so you can check what changed before continuing the wishlist flow.",
            )}
          </div>
        </div>
        <button
          type="button"
          className="rounded-2xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-400/40 dark:bg-emerald-950/20 dark:text-emerald-100 dark:hover:bg-emerald-950/30"
          onClick={onViewLog}
          disabled={!lastRefreshOutput.trim()}
        >
          {t("wishlist.viewFullLog", "View full refresh log")}
        </button>
      </div>
      <div
        className={`mt-4 grid gap-3 ${
          refreshSummary.reused_cached_products != null ||
          refreshSummary.detail_fetches != null
            ? "sm:grid-cols-2 xl:grid-cols-5"
            : "sm:grid-cols-3"
        }`}
      >
        <WishlistMetricTile
          label={t("wishlist.imported", "Imported")}
          value={refreshSummary.imported}
          className="border-emerald-200/80 bg-white/75 dark:border-emerald-400/30 dark:bg-emerald-950/20"
        />
        <WishlistMetricTile
          label={t("wishlist.reactivated", "Reactivated")}
          value={refreshSummary.reactivated_count}
          className="border-emerald-200/80 bg-white/75 dark:border-emerald-400/30 dark:bg-emerald-950/20"
        />
        <WishlistMetricTile
          label={t("common.discontinued", "Discontinued")}
          value={refreshSummary.discontinued_count}
          className="border-emerald-200/80 bg-white/75 dark:border-emerald-400/30 dark:bg-emerald-950/20"
        />
        {refreshSummary.reused_cached_products != null ? (
          <WishlistMetricTile
            label={t("wishlist.cachedReused", "Cached reused")}
            value={refreshSummary.reused_cached_products}
            className="border-emerald-200/80 bg-white/75 dark:border-emerald-400/30 dark:bg-emerald-950/20"
          />
        ) : null}
        {refreshSummary.detail_fetches != null ? (
          <WishlistMetricTile
            label={t("wishlist.detailFetches", "Detail fetches")}
            value={refreshSummary.detail_fetches}
            className="border-emerald-200/80 bg-white/75 dark:border-emerald-400/30 dark:bg-emerald-950/20"
          />
        ) : null}
      </div>
      {refreshSummary.detected_store ? (
        <div className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
          {refreshSummary.detected_store} /{" "}
          {refreshSummary.detected_collection ??
            t("wishlist.unknownCollection", "unknown collection")}
        </div>
      ) : null}
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
          <div className="surface-subtle p-4">
            <input
              type="search"
              value={bambuCatalogQuery}
              onChange={(event) => setBambuCatalogQuery(event.target.value)}
              placeholder={t("wishlist.searchBambu", "Search Bambu material/color")}
              className={wishlistInputClass}
              disabled={!tauri}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {catalogFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setBambuCatalogFilter(filter)}
                  className={neutralChipClass(
                    bambuCatalogFilter === filter,
                    "px-3 py-1 text-[11px]",
                  )}
                >
                  {filter === "ALL"
                    ? t("common.all", "All")
                    : filter === "ACTIVE"
                      ? t("common.active", "Active")
                      : t("common.discontinued", "Discontinued")}
                </button>
              ))}
            </div>
            <select
              value={newBambuMasterId}
              onChange={(event) => setNewBambuMasterId(event.target.value)}
              className={`mt-3 ${wishlistSelectClass}`}
              disabled={!tauri || filteredBambuMasters.length === 0}
            >
              {filteredBambuMasters.map((master) => (
                <option key={master.id} value={master.id}>
                  {master.material} · {master.filament_name} · {master.color_name}
                  {master.is_discontinued
                    ? ` · ${t("common.discontinued", "Discontinued")}`
                    : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={`mt-3 w-full ${wishlistSecondaryButtonClass}`}
              onClick={() => {
                setCreateMode("manual");
                setManualVendor("Bambu");
                if (selectedBambuMaster) {
                  setManualMaterial(selectedBambuMaster.material);
                }
              }}
            >
              {t(
                "wishlist.addMissingBambuManual",
                "Bambu filament missing? Add it manually",
              )}
            </button>
          </div>
        ) : null}

        {createMode === "esun" ? (
          <div className="surface-subtle p-4">
            <input
              type="search"
              value={esunCatalogQuery}
              onChange={(event) => setEsunCatalogQuery(event.target.value)}
              placeholder={t("wishlist.searchEsun", "Search eSUN material/color")}
              className={wishlistInputClass}
              disabled={!tauri}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {catalogFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setEsunCatalogFilter(filter)}
                  className={neutralChipClass(
                    esunCatalogFilter === filter,
                    "px-3 py-1 text-[11px]",
                  )}
                >
                  {filter === "ALL"
                    ? t("common.all", "All")
                    : filter === "ACTIVE"
                      ? t("common.active", "Active")
                      : t("common.discontinued", "Discontinued")}
                </button>
              ))}
            </div>
            <select
              value={newEsunMasterId}
              onChange={(event) => setNewEsunMasterId(event.target.value)}
              className={`mt-3 ${wishlistSelectClass}`}
              disabled={!tauri || filteredEsunMasters.length === 0}
            >
              {filteredEsunMasters.map((master) => (
                <option key={master.id} value={master.id}>
                  {master.material} · {master.filament_name} · {master.color_name}
                  {master.is_discontinued
                    ? ` · ${t("common.discontinued", "Discontinued")}`
                    : ""}
                </option>
              ))}
            </select>
          </div>
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
