import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityItem } from "../components/dashboard_widgets";
import { parseDateTime } from "../lib/date_time";
import {
  type DashboardGoalMetrics,
  type DashboardHealth,
  type DashboardStat,
} from "../lib/dashboard_model";
import { loadDashboardData } from "../lib/dashboard_data_source";
import { formatDashboardSyncTime } from "../lib/dashboard_sync_time";
import { usePageRefreshState } from "../lib/page_refresh_state";
import { isTauri, type TrustedLanCompanionStatus } from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

const DASHBOARD_REFRESH_INTERVAL_MS = 4_000;
const DASHBOARD_RETRY_DELAY_MS = 1_000;

let cachedGoalMetrics: DashboardGoalMetrics | null = null;

function createDefaultGoalMetrics(): DashboardGoalMetrics {
  return {
    activeSpools: 0,
    placedActiveSpools: 0,
    totalJobs: 0,
    totalSlots: 0,
    loadedSlots: 0,
  };
}

function createDefaultStats(t: TranslateFn): DashboardStat[] {
  return [
    {
      id: "total",
      title: t("dashboard.totalSpools", "Total Spools"),
      value: "0",
      subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
      trend: "—",
      accent: "sky",
    },
    {
      id: "activePrinters",
      title: t("dashboard.activePrinters", "Active Printers"),
      value: "0",
      subtitle: t("dashboard.amsOnline", "Slots online"),
      trend: "—",
      accent: "emerald",
    },
    {
      id: "lowStock",
      title: t("dashboard.lowStock", "Low Stock"),
      value: "0",
      subtitle: t("dashboard.below20", "Below 20%"),
      trend: "—",
      accent: "rose",
    },
    {
      id: "monthlyUsage",
      title: t("dashboard.monthlyUsage", "Monthly Usage"),
      value: "0 g",
      subtitle: t("dashboard.last30", "Last 30 days"),
      trend: "—",
      accent: "amber",
    },
  ];
}

function createEmptyActivity(t: TranslateFn): ActivityItem[] {
  return [
    {
      id: "empty",
      title: t("dashboard.noRecentActivity", "No recent activity yet."),
      detail: t(
        "dashboard.activityEmptyHint",
        "Loans, printer jobs, and other tracked activity will appear here.",
      ),
      tone: "slate",
    },
  ];
}

function createDefaultHealth(t: TranslateFn): DashboardHealth {
  return {
    score: null,
    headline: t("dashboard.noInventoryData", "Not enough data"),
    detail: t("dashboard.addRollsForHealth", "Add rolls to start health tracking."),
    metrics: [
      {
        id: "lowStock",
        label: t("dashboard.lowStockShort", "low stock"),
        value: "0",
        tone: "rose",
      },
      {
        id: "loaned",
        label: t("dashboard.loaned", "loaned"),
        value: "0",
        tone: "amber",
      },
      {
        id: "onOrder",
        label: t("dashboard.onOrder", "on order"),
        value: "0",
        tone: "sky",
      },
      {
        id: "loaded",
        label: t("dashboard.amsLoaded", "slots loaded"),
        value: "0",
        tone: "emerald",
      },
    ],
  };
}

export function useDashboardPageData(t: TranslateFn, locale: string) {
  const tauri = isTauri();
  const refreshInFlightRef = useRef(false);
  const {
    beginRefresh,
    completeRefresh,
    error,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri);
  const [goalMetrics, setGoalMetrics] = useState<DashboardGoalMetrics>(
    () => cachedGoalMetrics ?? createDefaultGoalMetrics(),
  );
  const [stats, setStats] = useState<DashboardStat[]>(() => createDefaultStats(t));
  const [activity, setActivity] = useState<ActivityItem[]>(() => createEmptyActivity(t));
  const [usagePoints, setUsagePoints] = useState<number[]>([0, 0]);
  const [ownershipLowStock, setOwnershipLowStock] = useState({
    owned: 0,
    borrowedIn: 0,
  });
  const [ownershipOnHand, setOwnershipOnHand] = useState({
    total: 0,
    owned: 0,
    borrowedIn: 0,
    inUse: 0,
  });
  const [health, setHealth] = useState<DashboardHealth>(() => createDefaultHealth(t));
  const [lastSyncLabel, setLastSyncLabel] = useState(
    t("dashboard.syncedFromDb", "Synced from local DB"),
  );
  const [companionStatus, setCompanionStatus] = useState<TrustedLanCompanionStatus | null>(null);
  const [dashboardSyncMode, setDashboardSyncMode] = useState<string>("STANDALONE");
  const [clientHostCompanionTone, setClientHostCompanionTone] = useState<"off" | "live" | "warn">(
    "off",
  );
  const [clientHostDisplayName, setClientHostDisplayName] = useState<string | null>(null);
  const [clientHostNeedsRepair, setClientHostNeedsRepair] = useState(false);

  const refreshDashboard = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      if (!tauri || refreshInFlightRef.current) {
        return true;
      }
      refreshInFlightRef.current = true;
      beginRefresh();
      try {
        const loaded = await loadDashboardData({
          previousClientHostNeedsRepair: clientHostNeedsRepair,
          t,
        });
        if (cancelledRef?.current) {
          return true;
        }

        setDashboardSyncMode(loaded.syncMode);
        setCompanionStatus(loaded.trustedLan);
        setClientHostCompanionTone(loaded.clientHostCompanionTone);
        setClientHostDisplayName(loaded.clientHostDisplayName);
        setClientHostNeedsRepair(loaded.clientHostNeedsRepair);
        setStats(loaded.derived.stats);
        setActivity(loaded.derived.activity);
        setUsagePoints(loaded.derived.usagePoints);
        setOwnershipOnHand(loaded.derived.ownershipOnHand);
        setOwnershipLowStock(loaded.derived.ownershipLowStock);
        cachedGoalMetrics = loaded.derived.goalMetrics;
        setGoalMetrics(cachedGoalMetrics);
        setHealth(loaded.derived.health);

        if (loaded.syncSource !== "local") {
          const capturedAt = parseDateTime(loaded.capturedAt);
          const sourceLabel = t(
            loaded.syncSource === "client-live"
              ? "dashboard.clientSnapshotSyncedLive"
              : loaded.syncSource === "client-cached"
                ? "dashboard.clientSnapshotSyncedCached"
                : "dashboard.clientSnapshotOffline",
            loaded.syncSource === "client-live"
              ? "Live host snapshot"
              : loaded.syncSource === "client-cached"
                ? "Cached host snapshot"
                : "Host snapshot unavailable",
          );
          const timeLabel = capturedAt
            ? formatDashboardSyncTime(capturedAt, locale)
            : loaded.capturedAt;
          setLastSyncLabel(timeLabel ? `${sourceLabel} ${timeLabel}` : sourceLabel);
        } else {
          setLastSyncLabel(
            `${t("dashboard.synced", "Synced")} ${formatDashboardSyncTime(new Date(), locale)}`,
          );
        }
        completeRefresh();
        return true;
      } catch (loadError) {
        console.error(loadError);
        if (!cancelledRef?.current) {
          failRefresh(
            t("errors.requestFailed", "The request could not be completed."),
          );
        }
        return false;
      } finally {
        refreshInFlightRef.current = false;
      }
    },
    [
      beginRefresh,
      clientHostNeedsRepair,
      completeRefresh,
      failRefresh,
      locale,
      tauri,
      t,
    ],
  );

  useEffect(() => {
    if (!tauri) {
      return;
    }

    const cancelledRef = { current: false };
    let loading = false;
    let retryTimeout: number | null = null;
    const nativeUnlisteners: Array<() => void> = [];

    const runRefresh = async () => {
      if (loading || cancelledRef.current) {
        return;
      }
      if (retryTimeout != null) {
        window.clearTimeout(retryTimeout);
        retryTimeout = null;
      }
      loading = true;
      const succeeded = await refreshDashboard(cancelledRef);
      if (!succeeded && !cancelledRef.current) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = null;
          void runRefresh();
        }, DASHBOARD_RETRY_DELAY_MS);
      }
      loading = false;
    };

    const handleFocus = () => {
      void runRefresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runRefresh();
      }
    };

    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (cancelledRef.current) {
          return;
        }
        const appWindow = getCurrentWindow();
        const unlistenFocusChanged = await appWindow.onFocusChanged(({ payload }) => {
          if (payload) {
            void runRefresh();
          }
        });
        if (cancelledRef.current) {
          unlistenFocusChanged();
          return;
        }
        nativeUnlisteners.push(unlistenFocusChanged);
      } catch (error) {
        console.error(error);
      }
    })();

    void runRefresh();
    const interval = window.setInterval(() => {
      void runRefresh();
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelledRef.current = true;
      if (retryTimeout != null) {
        window.clearTimeout(retryTimeout);
      }
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      nativeUnlisteners.forEach((unlisten) => {
        unlisten();
      });
    };
  }, [refreshDashboard, tauri]);

  return {
    activity,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    companionStatus,
    dashboardSyncMode,
    error,
    goalMetrics,
    health,
    lastSyncLabel,
    loading,
    ownershipLowStock,
    ownershipOnHand,
    refreshAvailable: tauri,
    refreshDashboard,
    refreshing,
    stats,
    usagePoints,
  };
}
