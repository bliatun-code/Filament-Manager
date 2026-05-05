import { useCallback, useEffect, useMemo, useState } from "react";
import { AppModal } from "../components/app_modal";
import { VendorBadge } from "../components/vendor_badge";
import { neutralChipClass, semanticChipClass } from "../lib/chip_styles";
import { toSwatchColor } from "../lib/color_utils";
import {
  loadCatalogMasters,
  resolveCatalogSelectionDefaults,
} from "../lib/catalog_data_source";
import { useI18n } from "../lib/i18n";
import { materialTone } from "../lib/material_theme";
import {
  type CatalogRefreshProgressPayload,
  type CatalogRefreshResult,
  createManualSpool,
  createSpool,
  createWishlistItem,
  deleteWishlistItem,
  isTauri,
  listWishlistItems,
  refreshBambuCatalog,
  refreshEsunCatalog,
  subscribeCatalogRefreshProgress,
  type MasterCatalogRow,
  type WishlistItemRow,
  updateWishlistItemStatus,
} from "../lib/tauri_client";

type CreateMode = "bambu" | "esun" | "manual";
type CatalogFilter = "ALL" | "ACTIVE" | "DISCONTINUED";
type WishlistStatus = "WISHLIST" | "ON_ORDER" | "RECEIVED";
type WishlistBoardFilter = "ALL" | WishlistStatus;

const catalogFilters: ReadonlyArray<CatalogFilter> = [
  "ALL",
  "ACTIVE",
  "DISCONTINUED",
];

function statusBadgeClasses(status: string): string {
  switch (status) {
    case "ON_ORDER":
      return semanticChipClass("warning", "px-2 py-1 text-[11px]");
    case "RECEIVED":
      return semanticChipClass("success", "px-2 py-1 text-[11px]");
    default:
      return semanticChipClass("neutral", "px-2 py-1 text-[11px]");
  }
}

const wishlistInputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:placeholder:text-slate-400";

const wishlistSelectClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100";

const wishlistSecondaryButtonClass =
  "rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900/60 dark:text-slate-100 dark:shadow-none dark:hover:bg-slate-900/80";

function WishlistMetricTile({
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

function formatUnknownError(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // no-op
  }
  return fallback;
}

export default function WishlistPage() {
  const { t } = useI18n();
  const tauri = isTauri();
  const [busy, setBusy] = useState(false);
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);
  const [activeRefreshVendor, setActiveRefreshVendor] = useState<"Bambu" | "eSUN">(
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
  const [refreshLogCopyState, setRefreshLogCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");

  const [masters, setMasters] = useState<MasterCatalogRow[]>([]);
  const [wishlistItems, setWishlistItems] = useState<WishlistItemRow[]>([]);
  const [boardFilter, setBoardFilter] = useState<WishlistBoardFilter>("WISHLIST");
  const [confirmDeleteWishlistId, setConfirmDeleteWishlistId] = useState<string | null>(
    null,
  );

  const [createMode, setCreateMode] = useState<CreateMode>("bambu");
  const [bambuCatalogQuery, setBambuCatalogQuery] = useState("");
  const [bambuCatalogFilter, setBambuCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newBambuMasterId, setNewBambuMasterId] = useState("");
  const [esunCatalogQuery, setEsunCatalogQuery] = useState("");
  const [esunCatalogFilter, setEsunCatalogFilter] =
    useState<CatalogFilter>("ALL");
  const [newEsunMasterId, setNewEsunMasterId] = useState("");
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
      const rows = await listWishlistItems(500);
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
    () =>
      masters
        .filter((master) => master.vendor.toLowerCase().includes("bambu"))
        .sort((left, right) => {
          if (left.is_discontinued !== right.is_discontinued) {
            return Number(left.is_discontinued) - Number(right.is_discontinued);
          }
          return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
            `${right.material} ${right.filament_name} ${right.color_name}`,
          );
        }),
    [masters],
  );

  const filteredBambuMasters = useMemo(() => {
    const term = bambuCatalogQuery.trim().toLowerCase();
    return bambuMasters.filter((master) => {
      const stateMatch =
        bambuCatalogFilter === "ALL"
          ? true
          : bambuCatalogFilter === "ACTIVE"
            ? !master.is_discontinued
            : master.is_discontinued;
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return stateMatch && textMatch;
    });
  }, [bambuCatalogFilter, bambuCatalogQuery, bambuMasters]);

  const selectedBambuMaster = useMemo(() => {
    const fromId = masters.find((master) => master.id === newBambuMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredBambuMasters[0] ?? null;
  }, [filteredBambuMasters, masters, newBambuMasterId]);

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
    () =>
      masters
        .filter((master) => master.vendor.toLowerCase().includes("esun"))
        .sort((left, right) => {
          if (left.is_discontinued !== right.is_discontinued) {
            return Number(left.is_discontinued) - Number(right.is_discontinued);
          }
          return `${left.material} ${left.filament_name} ${left.color_name}`.localeCompare(
            `${right.material} ${right.filament_name} ${right.color_name}`,
          );
        }),
    [masters],
  );

  const filteredEsunMasters = useMemo(() => {
    const term = esunCatalogQuery.trim().toLowerCase();
    return esunMasters.filter((master) => {
      const stateMatch =
        esunCatalogFilter === "ALL"
          ? true
          : esunCatalogFilter === "ACTIVE"
            ? !master.is_discontinued
            : master.is_discontinued;
      const textMatch =
        term.length === 0
          ? true
          : `${master.material} ${master.filament_name} ${master.color_name}`
              .toLowerCase()
              .includes(term);
      return stateMatch && textMatch;
    });
  }, [esunCatalogFilter, esunCatalogQuery, esunMasters]);

  const selectedEsunMaster = useMemo(() => {
    const fromId = masters.find((master) => master.id === newEsunMasterId) ?? null;
    if (fromId) {
      return fromId;
    }
    return filteredEsunMasters[0] ?? null;
  }, [filteredEsunMasters, masters, newEsunMasterId]);

  const currentDraft = useMemo(() => {
    if (createMode === "bambu") {
      if (!selectedBambuMaster) {
        return null;
      }
      return {
        master_id: selectedBambuMaster.id,
        vendor: selectedBambuMaster.vendor,
        material: selectedBambuMaster.material,
        filament_name: selectedBambuMaster.filament_name,
        color_name: selectedBambuMaster.color_name,
      };
    }

    if (createMode === "esun") {
      if (!selectedEsunMaster) {
        return null;
      }
      return {
        master_id: selectedEsunMaster.id,
        vendor: selectedEsunMaster.vendor,
        material: selectedEsunMaster.material,
        filament_name: selectedEsunMaster.filament_name,
        color_name: selectedEsunMaster.color_name,
      };
    }

    if (!manualFilamentName.trim() || !manualColorName.trim()) {
      return null;
    }
    return {
      master_id: null,
      vendor: manualVendor.trim() || "Generic",
      material: manualMaterial.trim() || "PLA",
      filament_name: manualFilamentName.trim(),
      color_name: manualColorName.trim(),
    };
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
    const wishlist = wishlistItems.filter((item) => item.status === "WISHLIST").length;
    const onOrder = wishlistItems.filter((item) => item.status === "ON_ORDER").length;
    const received = wishlistItems.filter((item) => item.status === "RECEIVED").length;
    return { wishlist, onOrder, received };
  }, [wishlistItems]);

  const visibleWishlistItems = useMemo(() => {
    if (boardFilter === "ALL") {
      return wishlistItems;
    }
    return wishlistItems.filter((item) => item.status === boardFilter);
  }, [boardFilter, wishlistItems]);

  const linkedMasterById = useMemo(
    () => new Map(masters.map((master) => [master.id, master])),
    [masters],
  );

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

  function buildWishlistDraft():
    | {
        master_id?: string | null;
        vendor: string;
        material: string;
        filament_name: string;
        color_name: string;
      }
    | null {
    return currentDraft;
  }

  async function handleAddCurrentToWishlist() {
    if (!tauri || busy) {
      return;
    }
    const draft = buildWishlistDraft();
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
      await createWishlistItem({
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
      await updateWishlistItemStatus({
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
      await deleteWishlistItem(itemId);
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
          await createSpool({
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
          await createManualSpool({
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

      await updateWishlistItemStatus({
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
        <AppModal
          zIndex={50}
          closeOnBackdrop
          onBackdropClose={() => setShowRefreshLog(false)}
          overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-md dark:bg-black/55"
          panelClassName="w-full max-w-3xl rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
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
                  onClick={handleCopyRefreshLog}
                  disabled={!lastRefreshOutput.trim()}
                >
                  {refreshLogCopyState === "copied"
                    ? t("common.copied", "Copied")
                    : refreshLogCopyState === "failed"
                      ? t("common.copyFailed", "Copy failed")
                      : t("wishlist.copyLog", "Copy log")}
                </button>
                <button
                  type="button"
                  className={wishlistSecondaryButtonClass}
                  onClick={() => setShowRefreshLog(false)}
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
      ) : null}

      {catalogRefreshBusy ? (
        <AppModal
          zIndex={40}
          overlayClassName="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-md dark:bg-black/55"
          panelClassName="w-full max-w-lg rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45"
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
              onClick={() => setShowRefreshLog(true)}
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
              value={visibleWishlistItems.length}
              hint={`${t("common.all", "All")}: ${wishlistItems.length}`}
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

            {currentDraft ? (
              <div
                className={`mt-4 rounded-2xl border p-4 ${materialTone(currentDraft.material).card} ${materialTone(currentDraft.material).cardBorder}`}
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
                      {currentDraft.material} {currentDraft.filament_name} ({currentDraft.color_name})
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <VendorBadge vendor={currentDraft.vendor} compact />
                      <span className={statusBadgeClasses(currentSelectionDiscontinued ? "ON_ORDER" : "WISHLIST")}>
                        {currentSelectionDiscontinued
                          ? t("wishlist.discontinued", "Discontinued")
                          : t("wishlist.active", "Active")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
                {createMode === "manual"
                  ? t("wishlist.manualHint", "Use manual mode when the vendor catalog is missing the filament you need.")
                  : t(
                      "wishlist.addHint",
                      "Choose a catalog-backed filament or build a manual fallback, then send it into the wishlist flow below.",
                    )}
              </div>
            )}
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
              onClick={handleAddCurrentToWishlist}
              disabled={!tauri || busy}
            >
              {t("wishlist.addButton", "Add to wishlist")}
            </button>
          </div>
        </section>

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
              {visibleWishlistItems.length} / {wishlistItems.length}
            </div>
          </div>

          {wishlistLoading ? (
            <div className="surface-subtle mt-4 border-dashed p-4 text-sm text-slate-500 dark:text-slate-300">
              {t("wishlist.loading", "Loading wishlist...")}
            </div>
          ) : null}
          {!wishlistLoading && visibleWishlistItems.length === 0 ? (
            <div className="surface-subtle mt-4 border-dashed p-5 text-sm text-slate-500 dark:text-slate-300">
              {wishlistItems.length === 0
                ? t("wishlist.none", "No wishlist items yet.")
                : t("wishlist.noneFiltered", "No items match the selected status filter.")}
            </div>
          ) : null}

          <div className="mt-4 space-y-4">
            {visibleWishlistItems.map((item) => {
              const linkedMaster = item.master_id ? linkedMasterById.get(item.master_id) ?? null : null;
              const swatchHex = linkedMaster?.hex_color ?? null;
              const itemTone = materialTone(item.material);
              return (
                <div
                  key={item.id}
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
                        className={neutralChipClass(item.status === "WISHLIST", "px-3 py-1.5 text-xs")}
                        onClick={() => handleWishlistStatus(item.id, "WISHLIST")}
                        disabled={!tauri || busy || item.status === "WISHLIST"}
                      >
                        {t("wishlist.statusWishlist", "Wishlist")}
                      </button>
                      <button
                        type="button"
                        className={neutralChipClass(item.status === "ON_ORDER", "px-3 py-1.5 text-xs")}
                        onClick={() => handleWishlistStatus(item.id, "ON_ORDER")}
                        disabled={!tauri || busy || item.status === "ON_ORDER"}
                      >
                        {t("wishlist.statusOnOrder", "On order")}
                      </button>
                      <button
                        type="button"
                        className={semanticChipClass("success", "px-3 py-1.5 text-xs")}
                        onClick={() => handleStockFromWishlist(item)}
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
                        onClick={() => handleDeleteWishlistItem(item.id)}
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
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
