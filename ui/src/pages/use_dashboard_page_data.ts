import { useCallback, useEffect, useRef, useState } from "react";
import { type ActivityItem } from "../components/dashboard_widgets";
import { parseDateTime } from "../lib/date_time";
import {
  type DashboardGoalMetrics,
  type DashboardHealth,
  type DashboardStat,
  type DashboardUsageMonth,
  dashboardCalendarMonthChanged,
  dashboardCalendarMonthKey,
  normalizeDashboardUsageMonths,
} from "../lib/dashboard_model";
import { loadDashboardData } from "../lib/dashboard_data_source";
import type { DashboardBambuLiveAttention } from "../lib/dashboard_bambu_live_attention";
import {
  createDashboardHostConnectionState,
  isDashboardHostFailureInGrace,
} from "../lib/dashboard_host_connection";
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
import { formatDisplayInteger } from "../lib/number_display";
import { usePageRefreshState } from "../lib/page_refresh_state";
import { boundedPollingBackoffDelay } from "../lib/polling_schedule";
import { formatGrams } from "../lib/weight_display";
import {
  getTrustedLanCompanionStatus,
  isTauri,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

const DASHBOARD_REFRESH_INTERVAL_MS = 4_000;
const DASHBOARD_RETRY_INITIAL_DELAY_MS = 1_000;
const DASHBOARD_RETRY_MAX_DELAY_MS = 30_000;
const DASHBOARD_REVISION_FALLBACK_INTERVAL_MS = 30_000;
const DASHBOARD_FOCUS_DEDUPE_WINDOW_MS = 250;
const DASHBOARD_REVISION_DOMAINS = [
  LIBRARY_REVISION_DOMAINS.inventory,
  LIBRARY_REVISION_DOMAINS.catalog,
  LIBRARY_REVISION_DOMAINS.loans,
  LIBRARY_REVISION_DOMAINS.printers,
  LIBRARY_REVISION_DOMAINS.jobs,
  LIBRARY_REVISION_DOMAINS.wishlist,
] as const;

type DashboardRefreshOutcome = {
  clientCacheRead: boolean;
  revisionPollComplete: boolean;
  revisionSource: LibraryRevisionSource | null;
  succeeded: boolean;
};

type DashboardRefreshOptions = {
  clientCacheOnly?: boolean;
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

function createDefaultStats(t: TranslateFn, locale: string): DashboardStat[] {
  return [
    {
      id: "total",
      title: t("dashboard.totalSpools", "Total Spools"),
      value: formatDisplayInteger(0, locale),
      subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
      trend: "—",
      accent: "sky",
    },
    {
      id: "activePrinters",
      title: t("dashboard.activePrinters", "Active Printers"),
      value: formatDisplayInteger(0, locale),
      subtitle: t("dashboard.amsOnline", "Slots online"),
      trend: "—",
      accent: "emerald",
    },
    {
      id: "lowStock",
      title: t("dashboard.lowStock", "Low Stock"),
      value: formatDisplayInteger(0, locale),
      subtitle: t("dashboard.below20", "Below 20%"),
      trend: "—",
      accent: "rose",
    },
    {
      id: "monthlyUsage",
      title: t("dashboard.monthlyUsage", "Monthly Usage"),
      value: formatGrams(0, "zero", locale),
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

function createDefaultHealth(t: TranslateFn, locale: string): DashboardHealth {
  return {
    score: null,
    headline: t("dashboard.noInventoryData", "Not enough data"),
    detail: t("dashboard.addRollsForHealth", "Add rolls to start health tracking."),
    metrics: [
      {
        id: "lowStock",
        label: t("dashboard.lowStockShort", "low stock"),
        value: formatDisplayInteger(0, locale),
        tone: "rose",
      },
      {
        id: "loaned",
        label: t("dashboard.loaned", "loaned"),
        value: formatDisplayInteger(0, locale),
        tone: "amber",
      },
      {
        id: "onOrder",
        label: t("dashboard.onOrder", "on order"),
        value: formatDisplayInteger(0, locale),
        tone: "sky",
      },
      {
        id: "loaded",
        label: t("dashboard.amsLoaded", "slots loaded"),
        value: formatDisplayInteger(0, locale),
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
  const usageCalendarMonthRef = useRef(dashboardCalendarMonthKey());
  const refreshInFlightRef = useRef(false);
  const clientHostConnectionStateRef = useRef(
    createDashboardHostConnectionState(
      initialSnapshot?.clientHostCompanionTone ?? "off",
    ),
  );
  const clientHostNeedsRepairRef = useRef(
    initialSnapshot?.clientHostNeedsRepair ?? false,
  );
  const revisionSourceRef = useRef<LibraryRevisionSource | null>(
    initialSnapshot?.revisionSource ?? null,
  );
  const revisionTrackerRef = useRef(createLibraryRevisionTracker());
  const revisionFallbackRef = useRef<{
    lastRefreshAt: number | null;
    missedPolls: number;
    sourceKey: string | null;
  }>({
    lastRefreshAt: null,
    missedPolls: 0,
    sourceKey: null,
  });
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
    () => initialSnapshot?.stats ?? createDefaultStats(t, locale),
  );
  const [activity, setActivity] = useState<ActivityItem[]>(
    () => initialSnapshot?.activity ?? createEmptyActivity(t),
  );
  const [bambuLiveAttention, setBambuLiveAttention] = useState<
    DashboardBambuLiveAttention[]
  >(() => initialSnapshot?.bambuLiveAttention ?? []);
  const [usageMonths, setUsageMonths] = useState<DashboardUsageMonth[]>(
    () =>
      initialSnapshot?.usageMonths?.length === 12
        ? initialSnapshot.usageMonths
        : normalizeDashboardUsageMonths(undefined),
  );
  const [usageTotal12m, setUsageTotal12m] = useState(
    () => initialSnapshot?.usageTotal12m ?? 0,
  );
  const [usageAvailable, setUsageAvailable] = useState(
    () => initialSnapshot?.usageAvailable ?? false,
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
    () => initialSnapshot?.health ?? createDefaultHealth(t, locale),
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
    async (
      cancelledRef?: { current: boolean },
      options: DashboardRefreshOptions = {},
    ) => {
      if (!tauri || refreshInFlightRef.current) {
        return {
          clientCacheRead: false,
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
          clientCacheOnly: options.clientCacheOnly,
          locale,
          previousClientHostConnectionState:
            clientHostConnectionStateRef.current,
          previousClientHostNeedsRepair: clientHostNeedsRepairRef.current,
          t,
        });

        if (!cancelledRef?.current) {
          clientHostConnectionStateRef.current =
            loaded.clientHostConnectionState;
          clientHostNeedsRepairRef.current = loaded.clientHostNeedsRepair;
        }
        if (
          !cancelledRef?.current &&
          isDashboardHostFailureInGrace(
            loaded.clientHostConnectionState,
            loaded.clientHostConnectionObservation,
          )
        ) {
          // Keep the last-good dashboard and connection tone through one short
          // resolver/HTTP miss. The scheduler immediately retries with backoff.
          completeRefresh();
          return {
            clientCacheRead: false,
            revisionPollComplete: false,
            revisionSource: loaded.revisionSource,
            succeeded: false,
          } satisfies DashboardRefreshOutcome;
        }

        let nextLastSyncLabel: string;
        if (
          loaded.clientHostConnectionObservation === "checking" &&
          loaded.clientHostCompanionTone === "off"
        ) {
          nextLastSyncLabel = t(
            "settings.librarySyncRefreshingSnapshot",
            "Refreshing snapshot...",
          );
        } else if (loaded.syncSource !== "local") {
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
            bambuLiveAttention: loaded.bambuLiveAttention,
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
            usageAvailable: loaded.derived.usageAvailable,
            usageMonths: loaded.derived.usageMonths,
            usageTotal12m: loaded.derived.usageTotal12m,
          },
          snapshotRequest,
        );
        if (cancelledRef?.current || !cacheAccepted) {
          return {
            clientCacheRead: false,
            revisionPollComplete: false,
            revisionSource: loaded.revisionSource,
            succeeded: false,
          } satisfies DashboardRefreshOutcome;
        }

        revisionSourceRef.current = loaded.revisionSource;
        usageCalendarMonthRef.current = dashboardCalendarMonthKey();

        setDashboardSyncMode(loaded.syncMode);
        setBambuLiveAttention(loaded.bambuLiveAttention);
        setCompanionStatus(loaded.trustedLan);
        setClientHostCompanionTone(loaded.clientHostCompanionTone);
        setClientHostDisplayName(loaded.clientHostDisplayName);
        setClientHostNeedsRepair(loaded.clientHostNeedsRepair);
        setClientHostPaired(loaded.clientHostPaired);
        setSetupDataAvailable(loaded.setupDataAvailable);
        setStats(loaded.derived.stats);
        setActivity(loaded.derived.activity);
        setUsageAvailable(loaded.derived.usageAvailable);
        setUsageMonths(loaded.derived.usageMonths);
        setUsageTotal12m(loaded.derived.usageTotal12m);
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
        const clientHostRefreshFailed =
          loaded.syncMode === "CLIENT" &&
          options.clientCacheOnly !== true &&
          (loaded.clientHostConnectionObservation === "failed" ||
            loaded.clientHostConnectionObservation === "repair");
        return {
          clientCacheRead:
            options.clientCacheOnly === true && loaded.syncMode === "CLIENT",
          revisionPollComplete: loaded.revisionPollComplete,
          revisionSource: loaded.revisionSource,
          succeeded: !clientHostRefreshFailed,
        } satisfies DashboardRefreshOutcome;
      } catch (loadError) {
        console.error(loadError);
        if (!cancelledRef?.current) {
          failRefresh(
            t("errors.requestFailed", "The request could not be completed."),
          );
        }
        return {
          clientCacheRead: false,
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
      const calendarMonthChanged = dashboardCalendarMonthChanged(
        usageCalendarMonthRef.current,
      );
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
        const sourceKey = libraryRevisionSourceKey(source);
        const previousFallback = revisionFallbackRef.current;
        const missedPolls =
          previousFallback.sourceKey === sourceKey
            ? previousFallback.missedPolls + 1
            : 1;
        const now = performance.now();
        const hostFailureConfirmationDue =
          clientHostConnectionStateRef.current.consecutiveCoreFailures > 0 &&
          clientHostConnectionStateRef.current.tone !== "warn";
        const fallbackRefreshDue =
          missedPolls >= 2 &&
          (hostFailureConfirmationDue ||
            previousFallback.sourceKey !== sourceKey ||
            previousFallback.lastRefreshAt === null ||
            now - previousFallback.lastRefreshAt >=
              DASHBOARD_REVISION_FALLBACK_INTERVAL_MS);
        revisionFallbackRef.current = {
          lastRefreshAt: fallbackRefreshDue
            ? now
            : previousFallback.sourceKey === sourceKey
              ? previousFallback.lastRefreshAt
              : null,
          missedPolls,
          sourceKey,
        };
        revisionTrackerRef.current = markLibraryRevisionUnavailable(
          revisionTrackerRef.current,
          source,
        );
        // A single revision miss can recover without doing a full read twice.
        // Persistent misses retain one bounded fallback for older hosts.
        if (fallbackRefreshDue) {
          await performDashboardRefresh(cancelledRef);
        }
        return false;
      }

      revisionFallbackRef.current = {
        lastRefreshAt: null,
        missedPolls: 0,
        sourceKey: libraryRevisionSourceKey(source),
      };
      if (source.kind === "host") {
        // The revision endpoint is authenticated. A successful poll therefore proves that the
        // host recovered, and must close a one-failure grace window even when revisions did not
        // change (otherwise a later unrelated miss would be counted as consecutive).
        clientHostConnectionStateRef.current =
          createDashboardHostConnectionState("live");
        clientHostNeedsRepairRef.current = false;
        const cacheAccepted = updateDashboardPageSnapshot(
          locale,
          {
            clientHostCompanionTone: "live",
            clientHostNeedsRepair: false,
            clientHostPaired: true,
          },
          dashboardPageSnapshotGenerationRef.current,
        );
        if (cacheAccepted) {
          setClientHostCompanionTone("live");
          setClientHostNeedsRepair(false);
          setClientHostPaired(true);
        }
      }

      const previousTracker = revisionTrackerRef.current;
      const observation = observeLibraryDomainRevisions(
        previousTracker,
        source,
        revisions,
        DASHBOARD_REVISION_DOMAINS,
      );
      if (!observation.shouldReload && !calendarMonthChanged) {
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
    let lastFocusRefreshAt = Number.NEGATIVE_INFINITY;
    let loading = false;
    let refreshTimeout: number | null = null;
    let initialRefreshPending = true;
    let initialClientCacheAttempted = false;
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
        return;
      }
      clearRefreshTimeout();
      loading = true;
      const clientCacheOnly = initialRefreshPending && !initialClientCacheAttempted;
      if (clientCacheOnly) {
        initialClientCacheAttempted = true;
      }
      let succeeded: boolean;
      let clientCacheRead = false;
      if (initialRefreshPending) {
        const outcome = await performDashboardRefresh(cancelledRef, {
          clientCacheOnly,
        });
        succeeded = outcome.succeeded;
        clientCacheRead = outcome.clientCacheRead;
      } else {
        succeeded = await pollDashboard(cancelledRef);
      }
      if (clientCacheRead) {
        loading = false;
        if (cancelledRef.current || !documentAllowsPolling()) {
          return;
        }
        // The local client cache is available without network I/O. Render it first,
        // then immediately revalidate the host in the next scheduler turn so an
        // unreachable mDNS/HTTP request can never delay the first dashboard paint.
        scheduleRefresh(0);
        return;
      }
      if (initialRefreshPending && succeeded) {
        initialRefreshPending = false;
      }
      loading = false;
      if (cancelledRef.current || !documentAllowsPolling()) {
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

    const requestFocusRefresh = () => {
      if (!documentAllowsPolling()) {
        return;
      }
      const now = performance.now();
      if (
        loading ||
        now - lastFocusRefreshAt < DASHBOARD_FOCUS_DEDUPE_WINDOW_MS
      ) {
        return;
      }
      lastFocusRefreshAt = now;
      void runRefresh();
    };
    const handleFocus = () => {
      requestFocusRefresh();
    };
    const handleVisibilityChange = () => {
      if (!documentAllowsPolling()) {
        clearRefreshTimeout();
        return;
      }
      consecutiveFailures = 0;
      requestFocusRefresh();
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
            requestFocusRefresh();
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
  }, [performDashboardRefresh, pollDashboard, tauri]);

  return {
    activity,
    bambuLiveAttention,
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
    usageMonths,
    usageTotal12m,
    usageAvailable,
    setupDataAvailable,
  };
}
