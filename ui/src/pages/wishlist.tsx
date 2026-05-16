import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { neutralChipClass } from "../lib/chip_styles";
import {
  loadCatalogMasters,
  resolveCatalogSelectionDefaults,
} from "../lib/catalog_data_source";
import { useI18n } from "../lib/i18n";
import {
  buildWishlistDraft,
  createWishlistEntry,
  deleteWishlistEntry,
  filterWishlistCatalogMasters,
  filterWishlistItems,
  listWishlistCatalogMastersByVendor,
  loadWishlistItems,
  selectWishlistCatalogMaster,
  summarizeWishlistQueue,
  updateWishlistEntryStatus,
  type WishlistCatalogFilter as CatalogFilter,
  type WishlistStatus,
  type WishlistStatusFilter as WishlistBoardFilter,
} from "../lib/wishlist_data_source";
import {
  createInventorySpoolFromMaster,
  createManualInventorySpool,
} from "../lib/spool_writes";
import {
  type CatalogRefreshProgressPayload,
  type CatalogRefreshResult,
  isTauri,
  refreshBambuCatalog,
  refreshEsunCatalog,
  subscribeCatalogRefreshProgress,
  type MasterCatalogRow,
  type WishlistItemRow,
} from "../lib/tauri_client";
import {
  formatUnknownError,
  type RefreshLogCopyState,
  type WishlistCreateMode,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";
import {
  WishlistAddPanel,
  WishlistBoardPanel,
  WishlistCatalogRefreshModal,
  WishlistMetricTile,
  WishlistRefreshLogModal,
  WishlistRefreshSummaryPanel,
} from "./wishlist_ui";

export default function WishlistPage() {
  const { t } = useI18n();
  const tauri = isTauri();
  const [busy, setBusy] = useState(false);
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);
  const [activeRefreshVendor, setActiveRefreshVendor] = useState<WishlistRefreshVendor>(
    "Bambu",
  );
  const [refreshProgressMessage, setRefreshProgressMessage] = useState(
    t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
  );
  const [refreshProgressPhase, setRefreshProgressPhase] = useState("PREPARE");
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null);
  const [refreshElapsedSeconds, setRefreshElapsedSeconds] = useState(0);
  const [wishlistLoading, setWishlistLoading] = useState(tauri);
  const [error, setError] = useState<string | null>(null);
  const [refreshSummary, setRefreshSummary] = useState<CatalogRefreshResult | null>(
    null,
  );
  const [lastRefreshOutput, setLastRefreshOutput] = useState("");
  const [showRefreshLog, setShowRefreshLog] = useState(false);
  const [refreshLogCopyState, setRefreshLogCopyState] =
    useState<RefreshLogCopyState>("idle");

  const [masters, setMasters] = useState<MasterCatalogRow[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItemRow[]>([]);
  const [boardFilter, setBoardFilter] = useState<WishlistBoardFilter>("WISHLIST");
  const [confirmDeleteWishlistId, setConfirmDeleteWishlistId] = useState<string | null>(
    null,
  );

  const [createMode, setCreateMode] = useState<WishlistCreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [bambuCatalogFilter, setBambuCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newBambuMasterId, setNewBambuMasterId] = useState("");
  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [esunCatalogFilter, setEsunCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");
  const deferredBambuCatalogQuery = useDeferredValue(bambuCatalogQuery);
  const deferredEsunCatalogQuery = useDeferredValue(esunCatalogQuery);
  const [wishlistQuantity, setWishlistQuantity] = useState("1");
  const [wishlistNote, setWishlistNote] = useState("");

  const [manualVendor, setManualVendor] = useState("Generic");
  const [manualMaterial, setManualMaterial] = useState("PLA");
  const [manualFilamentName, setManualFilamentName] = useState("");
  const [manualColorName, setManualColorName] = useState("");
  const [manualHexColor, setManualHexColor] = useState("");

  const reloadCatalog = useCallback(async () => {
    if (!tauri) {
      return;
    }
    try {
      const rows = await loadCatalogMasters();
      setMasters(rows);
      const defaults = resolveCatalogSelectionDefaults(rows);
      setNewBambuMasterId((current) => current || defaults.bambuMasterId);
      setNewEsunMasterId((current) => current || defaults.esunMasterId);
    } catch (catalogError) {
      console.error(catalogError);
      setError(t("wishlist.error.loadCatalog", "Could not load master catalog."));
    }
  }, [t, tauri]);

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

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    if (!tauri) {
      return;
    }

    void subscribeCatalogRefreshProgress((payload: CatalogRefreshProgressPayload) => {
      if (disposed) {
        return;
      }
      setActiveRefreshVendor(payload.vendor === "eSUN" ? "eSUN" : "Bambu");
      setRefreshProgressPhase(payload.phase);
      setRefreshProgressMessage(payload.message);
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    });

    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, [tauri]);

  useEffect(() => {
    if (!refreshSummary) {
      return;
    }
    const timer = window.setTimeout(() => {
      setRefreshSummary(null);
    }, 20_000);
    return () => window.clearTimeout(timer);
  }, [refreshSummary]);

  useEffect(() => {
    if (!confirmDeleteWishlistId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setConfirmDeleteWishlistId(null);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [confirmDeleteWishlistId]);

  useEffect(() => {
    if (!confirmDeleteWishlistId) {
      return;
    }
    if (!wishlistItems.some((item) => item.id === confirmDeleteWishlistId)) {
      setConfirmDeleteWishlistId(null);
    }
  }, [confirmDeleteWishlistId, wishlistItems]);

  useEffect(() => {
    if (!catalogRefreshBusy || refreshStartedAt === null) {
      setRefreshElapsedSeconds(0);
      return;
    }
    const tick = () => {
      setRefreshElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - refreshStartedAt) / 1000)),
      );
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [catalogRefreshBusy, refreshStartedAt]);

  const bambuMasters = useMemo(
    () => listWishlistCatalogMastersByVendor(masters, "bambu"),
    [masters],
  );

  const masterById = useMemo(
    () => new Map(masters.map((master) => [master.id, master])),
    [masters],
  );

  const filteredBambuMasters = useMemo(
    () =>
      filterWishlistCatalogMasters(
        bambuMasters,
        bambuCatalogFilter,
        deferredBambuCatalogQuery,
      ),
    [bambuCatalogFilter, deferredBambuCatalogQuery, bambuMasters],
  );

  const selectedBambuMaster = useMemo(() => {
    return selectWishlistCatalogMaster(filteredBambuMasters, newBambuMasterId);
  }, [filteredBambuMasters, newBambuMasterId]);

  useEffect(() => {
    if (createMode !== "bambu") {
      return;
    }
    if (filteredBambuMasters.length === 0) {
      setNewBambuMasterId("");
      return;
    }
    const exists = filteredBambuMasters.some(
      (master) => master.id === newBambuMasterId,
    );
    if (!exists) {
      setNewBambuMasterId(filteredBambuMasters[0].id);
    }
  }, [createMode, filteredBambuMasters, newBambuMasterId]);

  const esunMasters = useMemo(
    () => listWishlistCatalogMastersByVendor(masters, "esun"),
    [masters],
  );

  const filteredEsunMasters = useMemo(
    () =>
      filterWishlistCatalogMasters(
        esunMasters,
        esunCatalogFilter,
        deferredEsunCatalogQuery,
      ),
    [deferredEsunCatalogQuery, esunCatalogFilter, esunMasters],
  );

  const selectedEsunMaster = useMemo(() => {
    return selectWishlistCatalogMaster(filteredEsunMasters, newEsunMasterId);
  }, [filteredEsunMasters, newEsunMasterId]);

  const currentDraft = useMemo(() => {
    return buildWishlistDraft({
      source: createMode,
      selectedBambuMaster,
      selectedEsunMaster,
      manualVendor,
      manualMaterial,
      manualFilamentName,
      manualColorName,
    });
  }, [
    createMode,
    manualColorName,
    manualFilamentName,
    manualMaterial,
    manualVendor,
    selectedBambuMaster,
    selectedEsunMaster,
  ]);

  useEffect(() => {
    if (createMode !== "esun") {
      return;
    }
    if (filteredEsunMasters.length === 0) {
      setNewEsunMasterId("");
      return;
    }
    const exists = filteredEsunMasters.some(
      (master) => master.id === newEsunMasterId,
    );
    if (!exists) {
      setNewEsunMasterId(filteredEsunMasters[0].id);
    }
  }, [createMode, filteredEsunMasters, newEsunMasterId]);

  const wishlistSummary = useMemo(() => {
    return summarizeWishlistQueue(wishlistItems);
  }, [wishlistItems]);

  const visibleWishlistItems = useMemo(() => {
    return filterWishlistItems(wishlistItems, boardFilter);
  }, [boardFilter, wishlistItems]);

  const activeCatalogCount = useMemo(() => {
    if (createMode === "bambu") {
      return bambuMasters.length;
    }
    if (createMode === "esun") {
      return esunMasters.length;
    }
    return masters.length;
  }, [bambuMasters.length, createMode, esunMasters.length, masters.length]);

  const activeCatalogMatches = useMemo(() => {
    if (createMode === "bambu") {
      return filteredBambuMasters.length;
    }
    if (createMode === "esun") {
      return filteredEsunMasters.length;
    }
    return 0;
  }, [createMode, filteredBambuMasters.length, filteredEsunMasters.length]);

  const currentSelectionHex = useMemo(() => {
    if (createMode === "bambu") {
      return selectedBambuMaster?.hex_color ?? null;
    }
    if (createMode === "esun") {
      return selectedEsunMaster?.hex_color ?? null;
    }
    return manualHexColor || null;
  }, [createMode, manualHexColor, selectedBambuMaster?.hex_color, selectedEsunMaster?.hex_color]);

  const currentSelectionDiscontinued = useMemo(() => {
    if (createMode === "bambu") {
      return selectedBambuMaster?.is_discontinued ?? false;
    }
    if (createMode === "esun") {
      return selectedEsunMaster?.is_discontinued ?? false;
    }
    return false;
  }, [
    createMode,
    selectedBambuMaster?.is_discontinued,
    selectedEsunMaster?.is_discontinued,
  ]);

  function toggleBoardFilter(next: WishlistBoardFilter) {
    setBoardFilter((current) => {
      if (next === "ALL") {
        return "ALL";
      }
      return current === next ? "ALL" : next;
    });
  }

  async function handleRefreshBambuCatalog() {
    if (!tauri || busy || catalogRefreshBusy) {
      return;
    }
    setActiveRefreshVendor("Bambu");
    setRefreshProgressPhase("PREPARE");
    setRefreshProgressMessage(
      t("wishlist.refreshPreparingBambu", "Preparing Bambu catalog refresh..."),
    );
    setRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    setError(null);
    setRefreshSummary(null);
    setShowRefreshLog(false);
    try {
      const summary = await refreshBambuCatalog();
      setRefreshSummary(summary);
      setLastRefreshOutput(summary.output ?? "");
      await reloadCatalog();
      if (summary.imported === 0) {
        setError(
          t(
            "wishlist.error.zeroBambu",
            "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
          ),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const message = formatUnknownError(
        refreshError,
        t("wishlist.error.refreshBambu", "Catalog refresh failed."),
      );
      setError(message);
      setLastRefreshOutput(message);
    } finally {
      setCatalogRefreshBusy(false);
      setRefreshStartedAt(null);
    }
  }

  async function handleRefreshEsunCatalog() {
    if (!tauri || busy || catalogRefreshBusy) {
      return;
    }
    setActiveRefreshVendor("eSUN");
    setRefreshProgressPhase("PREPARE");
    setRefreshProgressMessage(
      t("wishlist.refreshPreparingEsun", "Preparing eSUN catalog refresh..."),
    );
    setRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    setError(null);
    setRefreshSummary(null);
    setShowRefreshLog(false);
    try {
      const summary = await refreshEsunCatalog();
      setRefreshSummary(summary);
      setLastRefreshOutput(summary.output ?? "");
      await reloadCatalog();
      if (summary.imported === 0) {
        setError(
          t(
            "wishlist.error.zeroEsun",
            "eSUN refresh completed with 0 imported rows. Store format may have changed.",
          ),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const message = formatUnknownError(
        refreshError,
        t("wishlist.error.refreshEsun", "eSUN catalog refresh failed."),
      );
      setError(message);
      setLastRefreshOutput(message);
    } finally {
      setCatalogRefreshBusy(false);
      setRefreshStartedAt(null);
    }
  }

  async function handleRefreshActiveCatalog() {
    if (createMode === "esun") {
      await handleRefreshEsunCatalog();
      return;
    }
    await handleRefreshBambuCatalog();
  }

  async function handleCopyRefreshLog() {
    const text = lastRefreshOutput.trim();
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(lastRefreshOutput);
      setRefreshLogCopyState("copied");
      window.setTimeout(() => setRefreshLogCopyState("idle"), 2_000);
    } catch (copyError) {
      console.error(copyError);
      setRefreshLogCopyState("failed");
      window.setTimeout(() => setRefreshLogCopyState("idle"), 2_500);
    }
  }

  async function handleAddCurrentToWishlist() {
    if (!tauri || busy) {
      return;
    }
    const draft = currentDraft;
    if (!draft) {
      setError(
        t(
          "wishlist.error.invalidSelection",
          "Pick a valid filament setup before adding to wishlist.",
        ),
      );
      return;
    }
    const quantity = Number.parseInt(wishlistQuantity, 10);

    setBusy(true);
    setError(null);
    try {
      await createWishlistEntry({
        id: `wish_${Date.now()}`,
        master_id: draft.master_id ?? null,
        vendor: draft.vendor,
        material: draft.material,
        filament_name: draft.filament_name,
        color_name: draft.color_name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        note: wishlistNote.trim() || null,
      });
      await reloadWishlist();
      setWishlistNote("");
    } catch (wishlistError) {
      console.error(wishlistError);
      setError(t("wishlist.error.add", "Failed to add wishlist item."));
    } finally {
      setBusy(false);
    }
  }

  async function handleWishlistStatus(itemId: string, status: WishlistStatus) {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateWishlistEntryStatus({
        item_id: itemId,
        status,
      });
      await reloadWishlist();
    } catch (statusError) {
      console.error(statusError);
      setError(t("wishlist.error.updateStatus", "Failed to update wishlist status."));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWishlistItem(itemId: string) {
    if (!tauri || busy) {
      return;
    }
    if (confirmDeleteWishlistId !== itemId) {
      setConfirmDeleteWishlistId(itemId);
      return;
    }
    setConfirmDeleteWishlistId(null);
    setBusy(true);
    setError(null);
    try {
      await deleteWishlistEntry(itemId);
      await reloadWishlist();
    } catch (deleteError) {
      console.error(deleteError);
      setError(
        formatUnknownError(
          deleteError,
          t("wishlist.error.delete", "Failed to delete wishlist item."),
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleStockFromWishlist(item: WishlistItemRow) {
    if (!tauri || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const linkedMaster = item.master_id
        ? masters.find((master) => master.id === item.master_id) ?? null
        : null;
      const quantity = Math.max(1, Number(item.quantity) || 1);
      for (let index = 0; index < quantity; index += 1) {
        const id = `spool_${Date.now()}_${index}`;
        if (linkedMaster) {
          await createInventorySpoolFromMaster({
            id,
            master_id: linkedMaster.id,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: linkedMaster.default_weight,
            current_weight_g: linkedMaster.default_weight,
            location_id: null,
            purchase_date: null,
            purchase_price: null,
            batch_code: null,
          });
        } else {
          await createManualInventorySpool({
            id,
            vendor: item.vendor,
            material: item.material,
            filament_name: item.filament_name,
            color_name: item.color_name,
            hex_color: null,
            product_url: null,
            default_weight_g: 1000,
            qr_code: null,
            status: "IN_STOCK",
            initial_weight_g: 1000,
            location: null,
          });
        }
      }

      await updateWishlistEntryStatus({
        item_id: item.id,
        status: "RECEIVED",
      });
      await reloadWishlist();
    } catch (stockError) {
      console.error(stockError);
      setError(t("wishlist.error.stock", "Failed to add roll(s) to inventory."));
    } finally {
      setBusy(false);
    }
  }

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
              onClick={() => setShowRefreshLog(true)}
              disabled={!lastRefreshOutput.trim()}
            >
              {t("wishlist.viewRefreshLog", "View refresh log")}
            </button>
            <button
              type="button"
              className="header-button-primary"
              onClick={handleRefreshActiveCatalog}
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
                  onClick={() => toggleBoardFilter("ALL")}
                  className={neutralChipClass(boardFilter === "ALL", "px-3 py-1.5 text-xs")}
                >
                  {t("common.all", "All")} · {wishlistItems.length}
                </button>
                <button
                  type="button"
                  onClick={() => toggleBoardFilter("WISHLIST")}
                  className={neutralChipClass(boardFilter === "WISHLIST", "px-3 py-1.5 text-xs")}
                >
                  {t("wishlist.statusWishlist", "Wishlist")} · {wishlistSummary.wishlist}
                </button>
                <button
                  type="button"
                  onClick={() => toggleBoardFilter("ON_ORDER")}
                  className={neutralChipClass(boardFilter === "ON_ORDER", "px-3 py-1.5 text-xs")}
                >
                  {t("wishlist.statusOnOrder", "On order")} · {wishlistSummary.onOrder}
                </button>
                <button
                  type="button"
                  onClick={() => toggleBoardFilter("RECEIVED")}
                  className={neutralChipClass(boardFilter === "RECEIVED", "px-3 py-1.5 text-xs")}
                >
                  {t("wishlist.statusReceived", "Received")} · {wishlistSummary.received}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
