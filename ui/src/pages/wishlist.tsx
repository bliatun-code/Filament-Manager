import { useCallback, useEffect, useMemo, useState } from "react";
import { loadCatalogMasters } from "../lib/catalog_data_source";
import { useI18n } from "../lib/i18n";
import { loadWishlistItems } from "../lib/wishlist_data_source";
import {
  isTauri,
  type MasterCatalogRow,
  type WishlistItemRow,
} from "../lib/tauri_client";
import { useWishlistBoardState } from "./use_wishlist_board_state";
import { useWishlistCatalogRefresh } from "./use_wishlist_catalog_refresh";
import { useWishlistCreateForm } from "./use_wishlist_create_form";
import { useWishlistMutations } from "./use_wishlist_mutations";
import {
  WishlistAddPanel,
  WishlistBoardPanel,
  WishlistCatalogRefreshModal,
  WishlistMetricTile,
  WishlistPageHeader,
  WishlistRefreshLogModal,
  WishlistRefreshSummaryPanel,
} from "./wishlist_ui";

export default function WishlistPage() {
  const { t } = useI18n();
  const tauri = isTauri();
  const [busy, setBusy] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(tauri);
  const [error, setError] = useState<string | null>(null);

  const [masters, setMasters] = useState<MasterCatalogRow[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItemRow[]>([]);
  const {
    boardFilter,
    confirmDeleteWishlistId,
    setConfirmDeleteWishlistId,
    toggleBoardFilter,
    visibleWishlistItems,
    wishlistSummary,
  } = useWishlistBoardState(wishlistItems);

  const {
    activeCatalogCount,
    activeCatalogMatches,
    applyCatalogSelectionDefaults,
    bambuCatalogFilter,
    bambuCatalogQuery,
    createMode,
    currentDraft,
    currentSelectionDiscontinued,
    currentSelectionHex,
    esunCatalogFilter,
    esunCatalogQuery,
    filteredBambuMasters,
    filteredEsunMasters,
    manualColorName,
    manualFilamentName,
    manualHexColor,
    manualMaterial,
    manualVendor,
    newBambuMasterId,
    newEsunMasterId,
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
    wishlistNote,
    wishlistQuantity,
  } = useWishlistCreateForm(masters);

  const reloadCatalog = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await loadCatalogMasters();
      setMasters(rows);
      applyCatalogSelectionDefaults(rows);
    } catch (catalogError) {
      console.error(catalogError);
      setError(t("wishlist.error.loadCatalog", "Could not load master catalog."));
    }
  }, [applyCatalogSelectionDefaults, t, tauri]);

  const reloadWishlist = useCallback(async () => {
    if (!tauri) {
      return;
    }
    setWishlistLoading(true);
    try {
      const rows = await loadWishlistItems();
      setWishlistItems(rows);
    } catch (wishlistError) {
      console.error(wishlistError);
      setWishlistItems([]);
    } finally {
      setWishlistLoading(false);
    }
  }, [tauri]);

  useEffect(() => {
    if (!tauri) {
      return;
    }
    void reloadCatalog();
    void reloadWishlist();
  }, [reloadCatalog, reloadWishlist, tauri]);

  const masterById = useMemo(
    () => new Map(masters.map((master) => [master.id, master])),
    [masters],
  );

  const {
    activeRefreshVendor,
    catalogRefreshBusy,
    handleCopyRefreshLog,
    handleRefreshActiveCatalog,
    lastRefreshOutput,
    refreshElapsedSeconds,
    refreshLogCopyState,
    refreshProgressMessage,
    refreshProgressPhase,
    refreshSummary,
    setShowRefreshLog,
    showRefreshLog,
  } = useWishlistCatalogRefresh({
    busy,
    createMode,
    reloadCatalog,
    setError,
    tauri,
    t,
  });

  const {
    handleAddCurrentToWishlist,
    handleDeleteWishlistItem,
    handleStockFromWishlist,
    handleWishlistStatus,
  } = useWishlistMutations({
    busy,
    confirmDeleteWishlistId,
    currentDraft,
    masters,
    reloadWishlist,
    setBusy,
    setConfirmDeleteWishlistId,
    setError,
    setWishlistNote,
    tauri,
    t,
    wishlistNote,
    wishlistQuantity,
  });

  return (
    <div className="page-shell">
      {showRefreshLog ? (
        <WishlistRefreshLogModal
          activeRefreshVendor={activeRefreshVendor}
          copyState={refreshLogCopyState}
          lastRefreshOutput={lastRefreshOutput}
          onClose={() => setShowRefreshLog(false)}
          onCopy={handleCopyRefreshLog}
          t={t}
        />
      ) : null}

      {catalogRefreshBusy ? (
        <WishlistCatalogRefreshModal
          activeRefreshVendor={activeRefreshVendor}
          refreshElapsedSeconds={refreshElapsedSeconds}
          refreshProgressMessage={refreshProgressMessage}
          refreshProgressPhase={refreshProgressPhase}
          t={t}
        />
      ) : null}

      <WishlistPageHeader
        activeRefreshVendor={activeRefreshVendor}
        boardFilter={boardFilter}
        busy={busy}
        catalogRefreshBusy={catalogRefreshBusy}
        createMode={createMode}
        lastRefreshOutput={lastRefreshOutput}
        onRefreshActiveCatalog={handleRefreshActiveCatalog}
        onShowRefreshLog={() => setShowRefreshLog(true)}
        onToggleBoardFilter={toggleBoardFilter}
        tauri={tauri}
        t={t}
        wishlistItemCount={wishlistItems.length}
        wishlistSummary={wishlistSummary}
      />

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      {refreshSummary ? (
        <WishlistRefreshSummaryPanel
          activeRefreshVendor={activeRefreshVendor}
          lastRefreshOutput={lastRefreshOutput}
          onViewLog={() => setShowRefreshLog(true)}
          refreshSummary={refreshSummary}
          t={t}
        />
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <WishlistMetricTile
          label={t("wishlist.trackedItems", "Tracked items")}
          value={wishlistItems.length}
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
          hint={t("wishlist.boardHint", "Keep planned purchases moving from wishlist to stock here.")}
          className={boardFilter === "ON_ORDER" ? "border-amber-300/60" : ""}
        />
        <WishlistMetricTile
          label={t("wishlist.statusReceived", "Received")}
          value={wishlistSummary.received}
          hint={t("wishlist.addToStock", "Add to stock")}
          className={boardFilter === "RECEIVED" ? "border-emerald-300/60" : ""}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[1.02fr_1.18fr]">
        <WishlistAddPanel
          activeCatalogCount={activeCatalogCount}
          activeCatalogMatches={activeCatalogMatches}
          activeRefreshVendor={activeRefreshVendor}
          bambuCatalogFilter={bambuCatalogFilter}
          bambuCatalogQuery={bambuCatalogQuery}
          busy={busy}
          createMode={createMode}
          currentDraft={currentDraft}
          currentSelectionDiscontinued={currentSelectionDiscontinued}
          currentSelectionHex={currentSelectionHex}
          esunCatalogFilter={esunCatalogFilter}
          esunCatalogQuery={esunCatalogQuery}
          filteredBambuMasters={filteredBambuMasters}
          filteredEsunMasters={filteredEsunMasters}
          manualColorName={manualColorName}
          manualFilamentName={manualFilamentName}
          manualHexColor={manualHexColor}
          manualMaterial={manualMaterial}
          manualVendor={manualVendor}
          newBambuMasterId={newBambuMasterId}
          newEsunMasterId={newEsunMasterId}
          onAdd={handleAddCurrentToWishlist}
          selectedBambuMaster={selectedBambuMaster}
          setBambuCatalogFilter={setBambuCatalogFilter}
          setBambuCatalogQuery={setBambuCatalogQuery}
          setCreateMode={setCreateMode}
          setEsunCatalogFilter={setEsunCatalogFilter}
          setEsunCatalogQuery={setEsunCatalogQuery}
          setManualColorName={setManualColorName}
          setManualFilamentName={setManualFilamentName}
          setManualHexColor={setManualHexColor}
          setManualMaterial={setManualMaterial}
          setManualVendor={setManualVendor}
          setNewBambuMasterId={setNewBambuMasterId}
          setNewEsunMasterId={setNewEsunMasterId}
          setWishlistNote={setWishlistNote}
          setWishlistQuantity={setWishlistQuantity}
          t={t}
          tauri={tauri}
          visibleItemCount={visibleWishlistItems.length}
          wishlistItemCount={wishlistItems.length}
          wishlistNote={wishlistNote}
          wishlistQuantity={wishlistQuantity}
        />

        <WishlistBoardPanel
          allItemCount={wishlistItems.length}
          busy={busy}
          confirmDeleteWishlistId={confirmDeleteWishlistId}
          items={visibleWishlistItems}
          loading={wishlistLoading}
          masterById={masterById}
          onDelete={handleDeleteWishlistItem}
          onStatus={handleWishlistStatus}
          onStock={handleStockFromWishlist}
          tauri={tauri}
          t={t}
        />
      </div>
    </div>
  );
}
