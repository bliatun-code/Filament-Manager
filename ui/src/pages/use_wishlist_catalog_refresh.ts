import { useEffect, useState } from "react";
import type { I18nContextValue } from "../lib/i18n";
import {
  type CatalogRefreshResult,
  type CatalogRefreshProgressPayload,
  refreshBambuCatalog,
  refreshEsunCatalog,
  subscribeCatalogRefreshProgress,
} from "../lib/tauri_client";
import {
  formatUnknownError,
  type RefreshLogCopyState,
  type WishlistCreateMode,
  type WishlistRefreshVendor,
} from "./wishlist_helpers";

type Translate = I18nContextValue["t"];

type UseWishlistCatalogRefreshOptions = {
  busy: boolean;
  createMode: WishlistCreateMode;
  reloadCatalog: () => Promise<void>;
  setError: (message: string | null) => void;
  tauri: boolean;
  t: Translate;
};

export function useWishlistCatalogRefresh({
  busy,
  createMode,
  reloadCatalog,
  setError,
  tauri,
  t,
}: UseWishlistCatalogRefreshOptions) {
  const [catalogRefreshBusy, setCatalogRefreshBusy] = useState(false);
  const [activeRefreshVendor, setActiveRefreshVendor] =
    useState<WishlistRefreshVendor>("Bambu");
  const [refreshProgressMessage, setRefreshProgressMessage] = useState(
    t("wishlist.refreshPreparing", "Preparing catalog refresh..."),
  );
  const [refreshProgressPhase, setRefreshProgressPhase] = useState("PREPARE");
  const [refreshStartedAt, setRefreshStartedAt] = useState<number | null>(null);
  const [refreshElapsedSeconds, setRefreshElapsedSeconds] = useState(0);
  const [refreshSummary, setRefreshSummary] = useState<CatalogRefreshResult | null>(
    null,
  );
  const [lastRefreshOutput, setLastRefreshOutput] = useState("");
  const [showRefreshLog, setShowRefreshLog] = useState(false);
  const [refreshLogCopyState, setRefreshLogCopyState] =
    useState<RefreshLogCopyState>("idle");

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

  async function refreshCatalog(vendor: WishlistRefreshVendor) {
    if (!tauri || busy || catalogRefreshBusy) {
      return;
    }
    const isEsun = vendor === "eSUN";
    setActiveRefreshVendor(vendor);
    setRefreshProgressPhase("PREPARE");
    setRefreshProgressMessage(
      isEsun
        ? t("wishlist.refreshPreparingEsun", "Preparing eSUN catalog refresh...")
        : t("wishlist.refreshPreparingBambu", "Preparing Bambu catalog refresh..."),
    );
    setRefreshStartedAt(Date.now());
    setCatalogRefreshBusy(true);
    setError(null);
    setRefreshSummary(null);
    setShowRefreshLog(false);
    try {
      const summary = isEsun ? await refreshEsunCatalog() : await refreshBambuCatalog();
      setRefreshSummary(summary);
      setLastRefreshOutput(summary.output ?? "");
      await reloadCatalog();
      if (summary.imported === 0) {
        setError(
          isEsun
            ? t(
                "wishlist.error.zeroEsun",
                "eSUN refresh completed with 0 imported rows. Store format may have changed.",
              )
            : t(
                "wishlist.error.zeroBambu",
                "Refresh completed with 0 imported rows. The store may be rate-limited or changed.",
              ),
        );
      }
    } catch (refreshError) {
      console.error(refreshError);
      const message = formatUnknownError(
        refreshError,
        isEsun
          ? t("wishlist.error.refreshEsun", "eSUN catalog refresh failed.")
          : t("wishlist.error.refreshBambu", "Catalog refresh failed."),
      );
      setError(message);
      setLastRefreshOutput(message);
    } finally {
      setCatalogRefreshBusy(false);
      setRefreshStartedAt(null);
    }
  }

  async function handleRefreshActiveCatalog() {
    await refreshCatalog(createMode === "esun" ? "eSUN" : "Bambu");
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

  return {
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
  };
}
