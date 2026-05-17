import { neutralChipClass } from "../lib/chip_styles";
import type { I18nContextValue } from "../lib/i18n";
import type { WishlistStatusFilter as WishlistBoardFilter } from "../lib/wishlist_data_source";
import { type WishlistCreateMode, type WishlistRefreshVendor } from "./wishlist_helpers";

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
