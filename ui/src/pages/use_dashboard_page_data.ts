import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityItem } from "../components/dashboard_widgets";
import { parseDateTime } from "../lib/date_time";
import {
  type DashboardGoalMetrics,
  type DashboardHealth,
  type DashboardStat,
} from "../lib/dashboard_model";
import { loadDashboardData } from "../lib/dashboard_data_source";
import {
  beginDashboardPageSnapshotRequest,
  readDashboardPageSnapshotGeneration,
  readDashboardPageSnapshot,
  updateDashboardPageSnapshot,
  writeDashboardPageSnapshot,
} from "../lib/dashboard_page_snapshot_cache";
import { formatDashboardSyncTime } from "../lib/dashboard_sync_time";
import {
  createLibraryRevisionTracker,
  fetchLibraryDomainRevisionsForSource,
  LIBRARY_REVISION_DOMAINS,
  libraryRevisionSourceKey,
  markLibraryRevisionUnavailable,
  observeLibraryDomainRevisions,
  type LibraryRevisionSource,
} from "../lib/library_domain_revisions";
import { usePageRefreshState } from "../lib/page_refresh_state";
import { boundedPollingBackoffDelay } from "../lib/polling_schedule";
import {
  getTrustedLanCompanionStatus,
  isTauri,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

const DASHBOARD_REFRESH_INTERVAL_MS = 4_000;
const DASHBOARD_RETRY_INITIAL_DELAY_MS = 1_000;
const DASHBOARD_RETRY_MAX_DELAY_MS = 30_000;
const DASHBOARD_REVISION_DOMAINS = [
  LIBRARY_REVISION_DOMAINS.inventory,
  LIBRARY_REVISION_DOMAINS.catalog,
  LIBRARY_REVISION_DOMAINS.loans,
  LIBRARY_REVISION_DOMAINS.printers,
  LIBRARY_REVISION_DOMAINS.jobs,
  LIBRARY_REVISION_DOMAINS.wishlist,
] as const;

type DashboardRefreshOutcome = {
  revisionPollComplete: boolean;
  revisionSource: LibraryRevisionSource | null;
  succeeded: boolean;
};

function createDefaultGoalMetrics(): DashboardGoalMetrics {
  return {
    totalSpools: 0,
    configuredPrinters: 0,
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
  const [initialSnapshot] = useState(() =>
    readDashboardPageSnapshot(locale),
  );
  const dashboardPageSnapshotGenerationRef = useRef(
    readDashboardPageSnapshotGeneration(),
  );
  const refreshInFlightRef = useRef(false);
  const revisionSourceRef = useRef<LibraryRevisionSource | null>(
    initialSnapshot?.revisionSource ?? null,
  );
  const revisionTrackerRef = useRef(createLibraryRevisionTracker());
  const {
    beginRefresh,
    completeRefresh,
    error,
    failRefresh,
    loading,
    refreshing,
  } = usePageRefreshState(tauri, initialSnapshot !== null);
  const [goalMetrics, setGoalMetrics] = useState<DashboardGoalMetrics>(
    () => initialSnapshot?.goalMetrics ?? createDefaultGoalMetrics(),
  );
  const [stats, setStats] = useState<DashboardStat[]>(
    () => initialSnapshot?.stats ?? createDefaultStats(t),
  );
  const [activity, setActivity] = useState<ActivityItem[]>(
    () => initialSnapshot?.activity ?? createEmptyActivity(t),
  );
  const [usagePoints, setUsagePoints] = useState<number[]>(
    () => initialSnapshot?.usagePoints ?? [0, 0],
  );
  const [ownershipLowStock, setOwnershipLowStock] = useState(
    () =>
      initialSnapshot?.ownershipLowStock ?? {
        owned: 0,
        borrowedIn: 0,
      },
  );
  const [ownershipOnHand, setOwnershipOnHand] = useState(
    () =>
      initialSnapshot?.ownershipOnHand ?? {
        total: 0,
        owned: 0,
        borrowedIn: 0,
        inUse: 0,
      },
  );
  const [health, setHealth] = useState<DashboardHealth>(
    () => initialSnapshot?.health ?? createDefaultHealth(t),
  );
  const [lastSyncLabel, setLastSyncLabel] = useState(
    () =>
      initialSnapshot?.lastSyncLabel ??
      t("dashboard.syncedFromDb", "Synced from local DB"),
  );
  const [companionStatus, setCompanionStatus] =
    useState<TrustedLanCompanionStatus | null>(
      () => initialSnapshot?.companionStatus ?? null,
    );
  const [dashboardSyncMode, setDashboardSyncMode] = useState<string>(
    () => initialSnapshot?.dashboardSyncMode ?? "STANDALONE",
  );
  const [clientHostCompanionTone, setClientHostCompanionTone] = useState<"off" | "live" | "warn">(
    () => initialSnapshot?.clientHostCompanionTone ?? "off",
  );
  const [clientHostDisplayName, setClientHostDisplayName] = useState<
    string | null
  >(
    () => initialSnapshot?.clientHostDisplayName ?? null,
  );
  const [clientHostNeedsRepair, setClientHostNeedsRepair] = useState(
    () => initialSnapshot?.clientHostNeedsRepair ?? false,
  );
  const [clientHostPaired, setClientHostPaired] = useState(
    () => initialSnapshot?.clientHostPaired ?? false,
  );
  const [setupDataAvailable, setSetupDataAvailable] = useState(
    () => initialSnapshot?.setupDataAvailable ?? false,
  );

  const performDashboardRefresh = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      if (!tauri || refreshInFlightRef.current) {
        return {
          revisionPollComplete: false,
          revisionSource: revisionSourceRef.current,
          succeeded: false,
        } satisfies DashboardRefreshOutcome;
      }
      refreshInFlightRef.current = true;
      const snapshotRequest = beginDashboardPageSnapshotRequest(
        dashboardPageSnapshotGenerationRef.current,
      );
      beginRefresh();
      try {
        const loaded = await loadDashboardData({
          previousClientHostNeedsRepair: clientHostNeedsRepair,
          t,
        });

        let nextLastSyncLabel: string;
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
          nextLastSyncLabel = timeLabel
            ? `${sourceLabel} ${timeLabel}`
            : sourceLabel;
        } else {
          nextLastSyncLabel = `${t(
            "dashboard.synced",
            "Synced",
          )} ${formatDashboardSyncTime(new Date(), locale)}`;
        }

        const cacheAccepted = writeDashboardPageSnapshot(
          {
            activity: loaded.derived.activity,
            clientHostCompanionTone: loaded.clientHostCompanionTone,
            clientHostDisplayName: loaded.clientHostDisplayName,
            clientHostNeedsRepair: loaded.clientHostNeedsRepair,
            clientHostPaired: loaded.clientHostPaired,
            companionStatus: loaded.trustedLan,
            dashboardSyncMode: loaded.syncMode,
            goalMetrics: loaded.derived.goalMetrics,
            health: loaded.derived.health,
            lastSyncLabel: nextLastSyncLabel,
            locale,
            ownershipLowStock: loaded.derived.ownershipLowStock,
            ownershipOnHand: loaded.derived.ownershipOnHand,
            revisionSource: loaded.revisionSource,
            setupDataAvailable: loaded.setupDataAvailable,
            stats: loaded.derived.stats,
            usagePoints: loaded.derived.usagePoints,
          },
          snapshotRequest,
        );
        if (cancelledRef?.current || !cacheAccepted) {
          return {
            revisionPollComplete: false,
            revisionSource: loaded.revisionSource,
            succeeded: false,
          } satisfies DashboardRefreshOutcome;
        }

        revisionSourceRef.current = loaded.revisionSource;

        setDashboardSyncMode(loaded.syncMode);
        setCompanionStatus(loaded.trustedLan);
        setClientHostCompanionTone(loaded.clientHostCompanionTone);
        setClientHostDisplayName(loaded.clientHostDisplayName);
        setClientHostNeedsRepair(loaded.clientHostNeedsRepair);
        setClientHostPaired(loaded.clientHostPaired);
        setSetupDataAvailable(loaded.setupDataAvailable);
        setStats(loaded.derived.stats);
        setActivity(loaded.derived.activity);
        setUsagePoints(loaded.derived.usagePoints);
        setOwnershipOnHand(loaded.derived.ownershipOnHand);
        setOwnershipLowStock(loaded.derived.ownershipLowStock);
        setGoalMetrics(loaded.derived.goalMetrics);
        setHealth(loaded.derived.health);
        setLastSyncLabel(nextLastSyncLabel);
        completeRefresh();
        if (!loaded.revisionPollComplete) {
          revisionTrackerRef.current = markLibraryRevisionUnavailable(
            revisionTrackerRef.current,
            loaded.revisionSource,
          );
        }
        return {
          revisionPollComplete: loaded.revisionPollComplete,
          revisionSource: loaded.revisionSource,
          succeeded: true,
        } satisfies DashboardRefreshOutcome;
      } catch (loadError) {
        console.error(loadError);
        if (!cancelledRef?.current) {
          failRefresh(
            t("errors.requestFailed", "The request could not be completed."),
          );
        }
        return {
          revisionPollComplete: false,
          revisionSource: revisionSourceRef.current,
          succeeded: false,
        } satisfies DashboardRefreshOutcome;
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

  const refreshDashboard = useCallback(
    async (cancelledRef?: { current: boolean }) =>
      (await performDashboardRefresh(cancelledRef)).succeeded,
    [performDashboardRefresh],
  );

  const pollDashboard = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      const source = revisionSourceRef.current;
      const [trustedLanResult, revisionsResult] = await Promise.allSettled([
        getTrustedLanCompanionStatus(),
        fetchLibraryDomainRevisionsForSource(source),
      ]);
      if (cancelledRef?.current) {
        return true;
      }
      if (trustedLanResult.status === "fulfilled") {
        const cacheAccepted = updateDashboardPageSnapshot(
          locale,
          { companionStatus: trustedLanResult.value },
          dashboardPageSnapshotGenerationRef.current,
        );
        if (cacheAccepted) {
          setCompanionStatus(trustedLanResult.value);
        }
      }

      const revisions =
        revisionsResult.status === "fulfilled" ? revisionsResult.value : null;
      if (!source || !revisions) {
        revisionTrackerRef.current = markLibraryRevisionUnavailable(
          revisionTrackerRef.current,
          source,
        );
        // The scheduler backs repeated failures off to 30 seconds. Keep doing a
        // full fallback read at that bounded cadence so older hosts without the
        // revision endpoint never leave an otherwise healthy client frozen.
        await performDashboardRefresh(cancelledRef);
        return false;
      }

      const previousTracker = revisionTrackerRef.current;
      const observation = observeLibraryDomainRevisions(
        previousTracker,
        source,
        revisions,
        DASHBOARD_REVISION_DOMAINS,
      );
      if (!observation.shouldReload) {
        revisionTrackerRef.current = observation.tracker;
        return true;
      }

      const outcome = await performDashboardRefresh(cancelledRef);
      if (
        outcome.succeeded &&
        outcome.revisionPollComplete &&
        libraryRevisionSourceKey(outcome.revisionSource) ===
          libraryRevisionSourceKey(source)
      ) {
        revisionTrackerRef.current = observation.tracker;
        return true;
      }

      revisionTrackerRef.current = markLibraryRevisionUnavailable(
        previousTracker,
        outcome.revisionSource,
      );
      return false;
    },
    [locale, performDashboardRefresh],
  );

  useEffect(() => {
    if (!tauri) {
      return;
    }

    const cancelledRef = { current: false };
    let consecutiveFailures = 0;
    let loading = false;
    let refreshRequested = false;
    let refreshTimeout: number | null = null;
    let initialRefreshPending = true;
    const nativeUnlisteners: Array<() => void> = [];

    const documentAllowsPolling = () => document.visibilityState !== "hidden";
    const clearRefreshTimeout = () => {
      if (refreshTimeout !== null) {
        window.clearTimeout(refreshTimeout);
        refreshTimeout = null;
      }
    };
    const scheduleRefresh = (delayMs: number) => {
      clearRefreshTimeout();
      if (cancelledRef.current || !documentAllowsPolling()) {
        return;
      }
      refreshTimeout = window.setTimeout(() => {
        refreshTimeout = null;
        void runRefresh();
      }, Math.max(0, delayMs));
    };

    const runRefresh = async () => {
      if (cancelledRef.current || !documentAllowsPolling()) {
        return;
      }
      if (loading) {
        refreshRequested = true;
        return;
      }
      clearRefreshTimeout();
      loading = true;
      const succeeded = initialRefreshPending
        ? await refreshDashboard(cancelledRef)
        : await pollDashboard(cancelledRef);
      if (initialRefreshPending && succeeded) {
        initialRefreshPending = false;
      }
      loading = false;
      if (cancelledRef.current || !documentAllowsPolling()) {
        return;
      }
      if (refreshRequested) {
        refreshRequested = false;
        scheduleRefresh(0);
        return;
      }
      if (succeeded) {
        consecutiveFailures = 0;
        scheduleRefresh(DASHBOARD_REFRESH_INTERVAL_MS);
        return;
      }
      consecutiveFailures += 1;
      scheduleRefresh(
        boundedPollingBackoffDelay({
          failureCount: consecutiveFailures,
          initialDelayMs: DASHBOARD_RETRY_INITIAL_DELAY_MS,
          maxDelayMs: DASHBOARD_RETRY_MAX_DELAY_MS,
        }),
      );
    };

    const handleFocus = () => {
      void runRefresh();
    };
    const handleVisibilityChange = () => {
      if (!documentAllowsPolling()) {
        clearRefreshTimeout();
        return;
      }
      consecutiveFailures = 0;
      void runRefresh();
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

    if (documentAllowsPolling()) {
      void runRefresh();
    }
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelledRef.current = true;
      clearRefreshTimeout();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      nativeUnlisteners.forEach((unlisten) => {
        unlisten();
      });
    };
  }, [pollDashboard, refreshDashboard, tauri]);

  return {
    activity,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    clientHostPaired,
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
    setupDataAvailable,
  };
}
