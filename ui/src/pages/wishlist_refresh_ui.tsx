import { AppModal } from "../components/app_modal";
import type { I18nContextValue } from "../lib/i18n";
import type { CatalogRefreshResult } from "../lib/tauri_client";
import {
  type RefreshLogCopyState,
  wishlistSecondaryButtonClass,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";
import { WishlistMetricTile } from "./wishlist_ui";

type Translate = I18nContextValue["t"];

const wishlistModalOverlayClassName: Record<40 | 50, string> = {
  40: "fixed inset-0 z-40 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-md dark:bg-black/55",
  50: "fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-md dark:bg-black/55",
};

const wishlistModalPanelClassName = {
  lg: "w-full max-w-lg rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45",
  xl: "w-full max-w-3xl rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-2xl shadow-slate-300/25 backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-900/92 dark:shadow-black/45",
};

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
