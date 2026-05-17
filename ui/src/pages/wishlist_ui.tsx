import { neutralChipClass } from "../lib/chip_styles";
import type { I18nContextValue } from "../lib/i18n";
import type {
  WishlistStatus,
  WishlistStatusFilter as WishlistBoardFilter,
} from "../lib/wishlist_data_source";
import type { MasterCatalogRow, WishlistItemRow } from "../lib/tauri_client";
import { type WishlistCreateMode, type WishlistRefreshVendor } from "./wishlist_helpers";
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
