import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  StatCard,
  UsageChart,
  type ActivityItem,
} from "../components/dashboard_widgets";
import {
  fetchLibrarySyncLoans,
  fetchLibrarySyncPrinterOverview,
  fetchLibrarySyncSnapshot,
  fetchLibrarySyncSpools,
  fetchLibrarySyncWishlistItems,
  getTrustedLanCompanionStatus,
  getLibrarySyncSettings,
  inventoryOverview,
  isTauri,
  listActiveSpoolLoans,
  listPrinterOverview,
  listWishlistItems,
  listSpools,
  topMaterials,
  type WishlistItemRow,
  type TrustedLanCompanionStatus,
} from "../lib/tauri_client";
import { useI18n } from "../lib/i18n";
import { LOW_STOCK_GRAMS } from "../lib/inventory_constants";
import { summarizeEffectivePrinterSlots } from "../lib/printer_profiles";
import type { PageKey } from "../App";

const defaultStats = [
  {
    id: "total",
    title: "Total Spools",
    value: "0",
    subtitle: "Across all locations",
    trend: "—",
    accent: "sky" as const,
  },
  {
    id: "activePrinters",
    title: "Active Printers",
    value: "0",
    subtitle: "Slots online",
    trend: "—",
    accent: "emerald" as const,
  },
  {
    id: "lowStock",
    title: "Low Stock",
    value: "0",
    subtitle: "Below 20%",
    trend: "—",
    accent: "rose" as const,
  },
  {
    id: "monthlyUsage",
    title: "Monthly Usage",
    value: "0 g",
    subtitle: "Last 30 days",
    trend: "—",
    accent: "amber" as const,
  },
];

type DashboardGoalMetrics = {
  activeSpools: number;
  placedActiveSpools: number;
  totalJobs: number;
  totalSlots: number;
  loadedSlots: number;
};

function parseUtcTimestamp(raw: string): Date | null {
  const normalized = raw.trim();
  if (!normalized) {
    return null;
  }
  const parsed = new Date(normalized.replace(" ", "T") + "Z");
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function progressRatio(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, current / target));
}

type DashboardPageProps = {
  onNavigate?: (page: PageKey) => void;
  onOpenLowStock?: () => void;
  onOpenCompanionSettings?: () => void;
};

const DASHBOARD_REFRESH_INTERVAL_MS = 4_000;
const DASHBOARD_RETRY_DELAY_MS = 1_000;
let cachedGoalMetrics: DashboardGoalMetrics | null = null;

export default function DashboardPage({
  onNavigate,
  onOpenLowStock,
  onOpenCompanionSettings,
}: DashboardPageProps) {
  const { t } = useI18n();
  const tauri = isTauri();
  const [goalMetrics, setGoalMetrics] = useState<DashboardGoalMetrics>(
    () =>
      cachedGoalMetrics ?? {
        activeSpools: 0,
        placedActiveSpools: 0,
        totalJobs: 0,
        totalSlots: 0,
        loadedSlots: 0,
      },
  );
  const badges = useMemo(() => {
    const jobGoal = 20;
    const locationProgress =
      goalMetrics.activeSpools > 0
        ? progressRatio(goalMetrics.placedActiveSpools, goalMetrics.activeSpools)
        : 0;
    const jobsProgress = progressRatio(Math.min(goalMetrics.totalJobs, jobGoal), jobGoal);
    const slotsProgress =
      goalMetrics.totalSlots > 0
        ? progressRatio(goalMetrics.loadedSlots, goalMetrics.totalSlots)
        : 0;

    return [
      {
        id: "badge-location-coverage",
        title: t("dashboard.badgeLocationCoverage", "Location coverage"),
        status:
          goalMetrics.activeSpools > 0
            ? `${goalMetrics.placedActiveSpools}/${goalMetrics.activeSpools} ${t(
                "dashboard.badgeActiveSpoolsPlaced",
                "active spools placed",
              )}`
            : t("dashboard.badgeNoActiveSpools", "No active spools yet."),
        description: t(
          "dashboard.badgeLocationCoverageDesc",
          "Keep every active spool assigned to a shelf, loan, or printer slot.",
        ),
        progress: locationProgress,
      },
      {
        id: "badge-job-logging",
        title: t("dashboard.badgeJobLogging", "Job logging"),
        status:
          goalMetrics.totalJobs > jobGoal
            ? `${goalMetrics.totalJobs} ${t("dashboard.badgeJobsLogged", "jobs logged")}`
            : `${goalMetrics.totalJobs}/${jobGoal} ${t("dashboard.badgeJobsLogged", "jobs logged")}`,
        description: t(
          "dashboard.badgeJobLoggingDesc",
          "Log printer-linked jobs so consumption stays grounded in real usage.",
        ),
        progress: jobsProgress,
      },
      {
        id: "badge-slotReadiness",
        title: t("dashboard.badgeSlotReadiness", "Slot readiness"),
        status:
          goalMetrics.totalSlots > 0
            ? `${goalMetrics.loadedSlots}/${goalMetrics.totalSlots} ${t(
                "dashboard.badgeSlotsLoaded",
                "slots loaded",
              )}`
            : t("dashboard.badgeNoPrinterSlots", "No printer slots configured yet."),
        description: t(
          "dashboard.badgeSlotReadinessDesc",
          "Keep configured printer slots stocked with active spools.",
        ),
        progress: slotsProgress,
      },
    ];
  }, [goalMetrics, t]);
  const [stats, setStats] = useState(() =>
    defaultStats.map((stat) => ({
      ...stat,
      title:
        stat.id === "total"
          ? t("dashboard.totalSpools", "Total Spools")
          : stat.id === "activePrinters"
            ? t("dashboard.activePrinters", "Active Printers")
            : stat.id === "lowStock"
              ? t("dashboard.lowStock", "Low Stock")
              : t("dashboard.monthlyUsage", "Monthly Usage"),
      subtitle:
        stat.id === "total"
          ? t("dashboard.totalSpoolsSubtitle", "Across all locations")
          : stat.id === "activePrinters"
            ? t("dashboard.amsOnline", "Slots online")
            : stat.id === "lowStock"
              ? t("dashboard.below20", "Below 20%")
              : t("dashboard.last30", "Last 30 days"),
    })),
  );
  const [activity, setActivity] = useState<ActivityItem[]>([
    {
      id: "empty",
      title: t("dashboard.noRecentActivity", "No recent activity yet."),
      detail: t(
        "dashboard.activityEmptyHint",
        "Loans, printer jobs, and other tracked activity will appear here.",
      ),
      tone: "slate",
    },
  ]);
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
  const [health, setHealth] = useState({
    score: 100,
    headline: t("dashboard.noInventoryData", "No inventory data"),
    detail: t("dashboard.addRollsForHealth", "Add rolls to start health tracking."),
    metrics: [
      {
        id: "lowStock",
        label: t("dashboard.lowStockShort", "low stock"),
        value: "0",
        tone: "rose" as const,
      },
      {
        id: "loaned",
        label: t("dashboard.loaned", "loaned"),
        value: "0",
        tone: "amber" as const,
      },
      {
        id: "onOrder",
        label: t("dashboard.onOrder", "on order"),
        value: "0",
        tone: "sky" as const,
      },
      {
        id: "loaded",
        label: t("dashboard.amsLoaded", "slots loaded"),
        value: "0",
        tone: "emerald" as const,
      },
    ],
  });
  const [lastSyncLabel, setLastSyncLabel] = useState(
    t("dashboard.syncedFromDb", "Synced from local DB"),
  );
  const [companionStatus, setCompanionStatus] = useState<TrustedLanCompanionStatus | null>(null);
  const [dashboardSyncMode, setDashboardSyncMode] = useState<string>("STANDALONE");
  const [clientHostCompanionTone, setClientHostCompanionTone] = useState<"off" | "live" | "warn">(
    "off",
  );
  const [clientHostDisplayName, setClientHostDisplayName] = useState<string | null>(null);

  const refreshDashboard = useCallback(
    async (cancelledRef?: { current: boolean }) => {
      if (!tauri) {
        return;
      }
      const [syncSettings, trustedLan] =
        await Promise.all([
          getLibrarySyncSettings().catch(() => null),
          getTrustedLanCompanionStatus().catch(() => null),
        ]);
      if (cancelledRef?.current) {
        return;
      }

      setDashboardSyncMode((syncSettings?.mode ?? "STANDALONE").trim().toUpperCase());
      setCompanionStatus(trustedLan);
      const cachedSnapshot = syncSettings?.cached_snapshot ?? null;
      const clientMode = syncSettings?.mode === "CLIENT";
      setClientHostDisplayName(
        syncSettings?.host_device_name ?? cachedSnapshot?.device_name ?? null,
      );
      if (clientMode) {
        if (!syncSettings?.host_base_url) {
          setClientHostCompanionTone("off");
        }
      } else {
        setClientHostCompanionTone(
          !trustedLan?.enabled
            ? "off"
            : trustedLan.running && trustedLan.shell_reachable
              ? "live"
              : "warn",
        );
      }
      let activeClientSnapshot = cachedSnapshot;
      let clientSnapshotSource: "live" | "cached" = "cached";
      let clientSpoolRows = syncSettings?.cached_spools?.rows ?? null;
      let clientPrinterRows = syncSettings?.cached_printers?.rows ?? null;
      let clientLoanRows = syncSettings?.cached_loans?.rows ?? null;
      let clientWishlistRows = [] as WishlistItemRow[];
      if (clientMode && syncSettings?.host_base_url) {
        const [snapshotResult, spoolsResult, printersResult, loansResult, wishlistResult] =
          await Promise.allSettled([
            fetchLibrarySyncSnapshot(syncSettings.host_base_url, syncSettings.library_id),
            fetchLibrarySyncSpools(syncSettings.host_base_url, syncSettings.library_id, 2500, 0),
            fetchLibrarySyncPrinterOverview(syncSettings.host_base_url, syncSettings.library_id),
            fetchLibrarySyncLoans(syncSettings.host_base_url, syncSettings.library_id, 2000),
            fetchLibrarySyncWishlistItems(syncSettings.host_base_url, syncSettings.library_id, 500),
          ]);
        if (snapshotResult.status === "fulfilled") {
          activeClientSnapshot = snapshotResult.value;
          clientSnapshotSource = "live";
          setClientHostCompanionTone("live");
          setClientHostDisplayName(snapshotResult.value.device_name ?? syncSettings?.host_device_name ?? null);
        } else {
          console.error(snapshotResult.reason);
          setClientHostCompanionTone(syncSettings?.host_base_url ? "warn" : "off");
        }
        if (spoolsResult.status === "fulfilled") {
          clientSpoolRows = spoolsResult.value;
        } else {
          console.error(spoolsResult.reason);
        }
        if (printersResult.status === "fulfilled") {
          clientPrinterRows = printersResult.value;
        } else {
          console.error(printersResult.reason);
        }
        if (loansResult.status === "fulfilled") {
          clientLoanRows = loansResult.value;
        } else {
          console.error(loansResult.reason);
        }
        if (wishlistResult.status === "fulfilled") {
          clientWishlistRows = wishlistResult.value;
        } else {
          console.error(wishlistResult.reason);
        }
      }
      if (clientMode && activeClientSnapshot) {
        const spoolRows = clientSpoolRows ?? [];
        const printers = clientPrinterRows ?? [];
        const loans = clientLoanRows ?? [];
        const overview = activeClientSnapshot.inventory;
        const printerCount = printers.length;
        const effectiveSlotTotals = printers.reduce(
          (sum, printer) => {
            const summary = summarizeEffectivePrinterSlots(printer.slots);
            return {
              loadedSlots: sum.loadedSlots + summary.loadedSlots,
              totalSlots: sum.totalSlots + summary.totalSlots,
            };
          },
          { loadedSlots: 0, totalSlots: 0 },
        );
        const onOrderCount = clientWishlistRows
          .filter((item) => item.status === "ON_ORDER")
          .reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0);
        const onHandRows = spoolRows.filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          return status === "IN_STOCK" || status === "IN_USE";
        });
        const onHandTotal = onHandRows.length;
        const onHandOwned = onHandRows.filter((row) => {
          const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
          return ownershipType !== "BORROWED_IN";
        }).length;
        const onHandBorrowedIn = onHandRows.filter((row) => {
          const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
          return ownershipType === "BORROWED_IN";
        }).length;
        const onHandInUse = onHandRows.filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          return status === "IN_USE";
        }).length;
        const lowStockRows = spoolRows
          .filter((row) => {
            const status = (row.spool.status ?? "").trim().toUpperCase();
            const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
            return (
              status !== "EMPTY" &&
              status !== "LOST" &&
              remaining > 0 &&
              remaining <= LOW_STOCK_GRAMS
            );
          })
          .sort((left, right) => (left.spool.remaining_g ?? 0) - (right.spool.remaining_g ?? 0))
          .slice(0, 5)
          .map((row) => ({
            id: row.spool.id,
            name: row.master.filament_name,
            color: row.master.color_name,
            remaining: `${row.spool.remaining_g ?? 0} g`,
          }));
        const lowStockCount = lowStockRows.length;
        const ownedLowStockCount = spoolRows.filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
          const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
          return (
            status !== "EMPTY" &&
            status !== "LOST" &&
            ownershipType !== "BORROWED_IN" &&
            remaining > 0 &&
            remaining <= LOW_STOCK_GRAMS
          );
        }).length;
        const borrowedInLowStockCount = spoolRows.filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
          const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
          return (
            status !== "EMPTY" &&
            status !== "LOST" &&
            ownershipType === "BORROWED_IN" &&
            remaining > 0 &&
            remaining <= LOW_STOCK_GRAMS
          );
        }).length;
        const liveActivity: ActivityItem[] = [
          ...loans.slice(0, 3).map((loan) => ({
            id: `loan-${loan.loan.id}`,
            title: `${t("dashboard.loanedTo", "Loaned to")} ${loan.loan.borrower_name}`,
            detail: `${loan.material} ${loan.filament_name} · ${loan.loan.grams_out} g`,
            tone: "amber" as const,
          })),
          ...printers.slice(0, 3).map((printer) => ({
            id: `printer-${printer.printer.id}`,
            title: printer.printer.name,
            detail: `${printer.usage.total_jobs} ${t("printers.jobs", "jobs")} · ${printer.usage.total_used_g} g ${t("printers.used", "used")}`,
            tone: "sky" as const,
          })),
        ];

        setStats([
          {
            id: "total",
            title: t("dashboard.totalSpools", "Total Spools"),
            value: onHandTotal.toString(),
            subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
            trend: `${onHandInUse} ${t("dashboard.inUse", "in use")}`,
            accent: "sky" as const,
          },
          {
            id: "activePrinters",
            title: t("dashboard.activePrinters", "Active Printers"),
            value: printerCount.toString(),
            subtitle: `${printerCount} ${t("dashboard.configured", "configured")}`,
            trend:
              printerCount > 0
                ? t("dashboard.allConfiguredActive", "All configured printers are active")
                : t("dashboard.noPrintersConfigured", "No printers configured"),
            accent: "emerald" as const,
          },
          {
            id: "lowStock",
            title: t("dashboard.lowStock", "Low Stock"),
            value: lowStockCount.toString(),
            subtitle: t("dashboard.below200", "Below 200g"),
            trend:
              lowStockRows.length > 0
                ? `${lowStockRows[0].remaining} ${t("dashboard.lowest", "lowest")}`
                : t("dashboard.noAlerts", "No alerts"),
            accent: "rose" as const,
          },
          {
            id: "monthlyUsage",
            title: t("dashboard.monthlyUsage", "Monthly Usage"),
            value: `${overview.total_consumption_30d} g`,
            subtitle: t("dashboard.last30", "Last 30 days"),
            trend: `${Math.round(overview.total_consumption_30d / 30)} g/day`,
            accent: "amber" as const,
          },
        ]);
        const capturedAt = parseUtcTimestamp(activeClientSnapshot.captured_at);
        setLastSyncLabel(
          `${t(
            clientSnapshotSource === "live"
              ? "dashboard.clientSnapshotSyncedLive"
              : "dashboard.clientSnapshotSyncedCached",
            clientSnapshotSource === "live" ? "Live host snapshot" : "Cached host snapshot",
          )} ${
            capturedAt
              ? capturedAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : activeClientSnapshot.captured_at
          }`,
        );
        setActivity(
          liveActivity.length > 0
            ? liveActivity
            : [
                {
                  id: "empty",
                  title: t("dashboard.noRecentActivity", "No recent activity yet."),
                  detail: t(
                    "dashboard.activityEmptyHint",
                    "Loans, printer jobs, and other tracked activity will appear here.",
                  ),
                  tone: "slate",
                },
              ],
        );
        setUsagePoints([0, overview.total_consumption_30d]);
        setOwnershipOnHand({
          total: onHandTotal || overview.total_spools,
          owned: onHandOwned || overview.total_owned_spools,
          borrowedIn: onHandBorrowedIn || overview.total_borrowed_in_spools,
          inUse: onHandInUse,
        });
        setOwnershipLowStock({
          owned: ownedLowStockCount || overview.owned_low_stock,
          borrowedIn: borrowedInLowStockCount || overview.borrowed_in_low_stock,
        });
        cachedGoalMetrics = {
          activeSpools: onHandTotal,
          placedActiveSpools: onHandRows.filter((row) =>
            Boolean((row.spool.location_id ?? "").trim()),
          ).length,
          totalJobs: printers.reduce((sum, printer) => sum + Math.max(0, printer.usage.total_jobs), 0),
          totalSlots: effectiveSlotTotals.totalSlots,
          loadedSlots: effectiveSlotTotals.loadedSlots,
        };
        setGoalMetrics(cachedGoalMetrics);
        const healthySpools = spoolRows.filter((row) => {
          const remaining =
            row.spool.remaining_g ??
            row.spool.current_weight_g ??
            row.spool.initial_weight_g ??
            0;
          return row.spool.status !== "EMPTY" && row.spool.status !== "LOST" && remaining >= 200;
        }).length;
        const healthScore =
          onHandTotal === 0 ? 100 : Math.round((healthySpools / onHandTotal) * 100);
        setHealth({
          score: healthScore,
          headline:
            healthScore >= 90
              ? t("dashboard.healthStable", "Stable supply")
              : healthScore >= 70
                ? t("dashboard.healthMonitor", "Monitor restock")
                : t("dashboard.healthRestock", "Restock recommended"),
          detail: t(
            "dashboard.healthBalanceHint",
            "Watch low stock, loans, orders, and loaded slots together.",
          ),
          metrics: [
            {
              id: "lowStock",
              label: t("dashboard.lowStockShort", "low stock"),
              value: lowStockCount.toString(),
              tone: "rose" as const,
            },
            {
              id: "loaned",
              label: t("dashboard.loaned", "loaned"),
              value: loans.length.toString(),
              tone: "amber" as const,
            },
            {
              id: "onOrder",
              label: t("dashboard.onOrder", "on order"),
              value: onOrderCount.toString(),
              tone: "sky" as const,
            },
            {
              id: "loaded",
              label: t("dashboard.amsLoaded", "slots loaded"),
              value: effectiveSlotTotals.loadedSlots.toString(),
              tone: "emerald" as const,
            },
          ],
        });
        return;
      }

      const [overview, printers, spoolRows, loans, wishlist, materialRows] = await Promise.all([
        inventoryOverview(),
        listPrinterOverview(),
        listSpools(2500, 0),
        listActiveSpoolLoans(),
        listWishlistItems(500),
        topMaterials(12),
      ]);
      if (cancelledRef?.current) {
        return;
      }

      const printerCount = printers.length;
      const effectiveSlotTotals = printers.reduce(
        (sum, printer) => {
          const summary = summarizeEffectivePrinterSlots(printer.slots);
          return {
            loadedSlots: sum.loadedSlots + summary.loadedSlots,
            totalSlots: sum.totalSlots + summary.totalSlots,
          };
        },
        { loadedSlots: 0, totalSlots: 0 },
      );
      const onOrderCount = wishlist
        .filter((item) => item.status === "ON_ORDER")
        .reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0);
      const onHandRows = spoolRows.filter((row) => {
        const status = (row.spool.status ?? "").trim().toUpperCase();
        return status === "IN_STOCK" || status === "IN_USE";
      });
      const onHandTotal = onHandRows.length;
      const onHandOwned = onHandRows.filter((row) => {
        const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
        return ownershipType !== "BORROWED_IN";
      }).length;
      const onHandBorrowedIn = onHandRows.filter((row) => {
        const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
        return ownershipType === "BORROWED_IN";
      }).length;
      const onHandInUse = onHandRows.filter((row) => {
        const status = (row.spool.status ?? "").trim().toUpperCase();
        return status === "IN_USE";
      }).length;
      setOwnershipOnHand({
        total: onHandTotal,
        owned: onHandOwned,
        borrowedIn: onHandBorrowedIn,
        inUse: onHandInUse,
      });
      const lowStockRows = spoolRows
        .filter((row) => {
          const status = (row.spool.status ?? "").trim().toUpperCase();
          const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
          return (
            status !== "EMPTY" &&
            status !== "LOST" &&
            remaining > 0 &&
            remaining <= LOW_STOCK_GRAMS
          );
        })
        .sort((left, right) => (left.spool.remaining_g ?? 0) - (right.spool.remaining_g ?? 0))
        .slice(0, 5)
        .map((row) => ({
          id: row.spool.id,
          name: row.master.filament_name,
          color: row.master.color_name,
          remaining: `${row.spool.remaining_g ?? 0} g`,
        }));
      const lowStockCount = lowStockRows.length;
      const ownedLowStockCount = spoolRows.filter((row) => {
        const status = (row.spool.status ?? "").trim().toUpperCase();
        const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
        const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
        return (
          status !== "EMPTY" &&
          status !== "LOST" &&
          ownershipType !== "BORROWED_IN" &&
          remaining > 0 &&
          remaining <= LOW_STOCK_GRAMS
        );
      }).length;
      const borrowedInLowStockCount = spoolRows.filter((row) => {
        const status = (row.spool.status ?? "").trim().toUpperCase();
        const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
        const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
        return (
          status !== "EMPTY" &&
          status !== "LOST" &&
          ownershipType === "BORROWED_IN" &&
          remaining > 0 &&
          remaining <= LOW_STOCK_GRAMS
        );
      }).length;
      setOwnershipLowStock({
        owned: ownedLowStockCount,
        borrowedIn: borrowedInLowStockCount,
      });
      const liveActivity: ActivityItem[] = [
        ...loans.slice(0, 3).map((loan) => ({
          id: `loan-${loan.loan.id}`,
          title: `${t("dashboard.loanedTo", "Loaned to")} ${loan.loan.borrower_name}`,
          detail: `${loan.material} ${loan.filament_name} · ${loan.loan.grams_out} g`,
          tone: "amber" as const,
        })),
        ...printers.slice(0, 3).map((printer) => ({
          id: `printer-${printer.printer.id}`,
          title: printer.printer.name,
          detail: `${printer.usage.total_jobs} ${t("printers.jobs", "jobs")} · ${printer.usage.total_used_g} g ${t("printers.used", "used")}`,
          tone: "sky" as const,
        })),
      ];

      setStats([
        {
          id: "total",
          title: t("dashboard.totalSpools", "Total Spools"),
          value: onHandTotal.toString(),
          subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
          trend: `${onHandInUse} ${t("dashboard.inUse", "in use")}`,
          accent: "sky" as const,
        },
        {
          id: "activePrinters",
          title: t("dashboard.activePrinters", "Active Printers"),
          value: printerCount.toString(),
          subtitle: `${printerCount} ${t("dashboard.configured", "configured")}`,
          trend:
            printerCount > 0
              ? t("dashboard.allConfiguredActive", "All configured printers are active")
              : t("dashboard.noPrintersConfigured", "No printers configured"),
          accent: "emerald" as const,
        },
        {
          id: "lowStock",
          title: t("dashboard.lowStock", "Low Stock"),
          value: lowStockCount.toString(),
          subtitle: t("dashboard.below200", "Below 200g"),
          trend:
            lowStockRows.length > 0
              ? `${lowStockRows[0].remaining} ${t("dashboard.lowest", "lowest")}`
              : t("dashboard.noAlerts", "No alerts"),
          accent: "rose" as const,
        },
        {
          id: "monthlyUsage",
          title: t("dashboard.monthlyUsage", "Monthly Usage"),
          value: `${overview.total_consumption_30d} g`,
          subtitle: t("dashboard.last30", "Last 30 days"),
          trend: `${Math.round(overview.total_consumption_30d / 30)} g/day`,
          accent: "amber" as const,
        },
      ]);
      setActivity(
        liveActivity.length > 0
          ? liveActivity
          : [
              {
                id: "empty",
                title: t("dashboard.noRecentActivity", "No recent activity yet."),
                detail: t(
                  "dashboard.activityEmptyHint",
                  "Loans, printer jobs, and other tracked activity will appear here.",
                ),
                tone: "slate",
              },
            ],
      );

      const dynamicUsage = materialRows
        .map((row) => Math.max(0, row.used_grams))
        .filter((value) => value > 0)
        .slice(0, 8)
        .reverse();
      if (dynamicUsage.length >= 2) {
        setUsagePoints(dynamicUsage);
      } else if (dynamicUsage.length === 1) {
        setUsagePoints([0, dynamicUsage[0]]);
      } else {
        setUsagePoints([0, overview.total_consumption_30d]);
      }

      const activeSpoolRows = spoolRows.filter((row) => {
        const status = row.spool.status.trim().toUpperCase();
        return status !== "EMPTY" && status !== "LOST";
      });
      const placedActiveSpools = activeSpoolRows.filter((row) =>
        Boolean((row.spool.location_id ?? "").trim()),
      ).length;
      const totalJobs = printers.reduce(
        (sum, printer) => sum + Math.max(0, printer.usage.total_jobs),
        0,
      );
      const nextGoalMetrics = {
        activeSpools: activeSpoolRows.length,
        placedActiveSpools,
        totalJobs,
        totalSlots: effectiveSlotTotals.totalSlots,
        loadedSlots: effectiveSlotTotals.loadedSlots,
      };
      cachedGoalMetrics = nextGoalMetrics;
      setGoalMetrics(nextGoalMetrics);

      const healthySpools = spoolRows.filter((row) => {
        const remaining =
          row.spool.remaining_g ??
          row.spool.current_weight_g ??
          row.spool.initial_weight_g ??
          0;
        return row.spool.status !== "EMPTY" && row.spool.status !== "LOST" && remaining >= 200;
      }).length;
      const healthScore =
        onHandTotal === 0
          ? 100
          : Math.round((healthySpools / onHandTotal) * 100);
      const headline =
        healthScore >= 90
          ? t("dashboard.healthStable", "Stable supply")
          : healthScore >= 70
            ? t("dashboard.healthMonitor", "Monitor restock")
            : t("dashboard.healthRestock", "Restock recommended");
      setHealth({
        score: healthScore,
        headline,
        detail: t(
          "dashboard.healthBalanceHint",
          "Watch low stock, loans, orders, and loaded slots together.",
        ),
        metrics: [
          {
            id: "lowStock",
            label: t("dashboard.lowStockShort", "low stock"),
            value: lowStockCount.toString(),
            tone: "rose" as const,
          },
          {
            id: "loaned",
            label: t("dashboard.loaned", "loaned"),
            value: loans.length.toString(),
            tone: "amber" as const,
          },
          {
            id: "onOrder",
            label: t("dashboard.onOrder", "on order"),
            value: onOrderCount.toString(),
            tone: "sky" as const,
          },
          {
            id: "loaded",
            label: t("dashboard.amsLoaded", "slots loaded"),
            value: effectiveSlotTotals.loadedSlots.toString(),
            tone: "emerald" as const,
          },
        ],
      });
      setLastSyncLabel(
        `${t("dashboard.synced", "Synced")} ${new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    },
    [tauri, t],
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
      try {
        await refreshDashboard(cancelledRef);
      } catch (error) {
        console.error(error);
        if (!cancelledRef.current) {
          retryTimeout = window.setTimeout(() => {
            retryTimeout = null;
            void runRefresh();
          }, DASHBOARD_RETRY_DELAY_MS);
        }
      } finally {
        loading = false;
      }
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

        const unlistenResized = await appWindow.onResized(() => {
          void runRefresh();
        });
        if (cancelledRef.current) {
          unlistenResized();
          return;
        }
        nativeUnlisteners.push(unlistenResized);
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

  const companionTone = !companionStatus?.enabled
    ? "off"
    : companionStatus.running && companionStatus.shell_reachable
      ? "live"
      : "warn";
  const effectiveCompanionTone =
    dashboardSyncMode === "CLIENT" ? clientHostCompanionTone : companionTone;
  const companionLabel =
    dashboardSyncMode === "CLIENT"
      ? effectiveCompanionTone === "off"
        ? t("dashboard.hostCompanionOff", "Host disconnected")
        : effectiveCompanionTone === "live"
          ? `${t("dashboard.connectedToHost", "Connected to")} ${clientHostDisplayName ?? t("dashboard.hostFallbackName", "host")}`
          : `${t("dashboard.checkHostConnection", "Check connection to")} ${clientHostDisplayName ?? t("dashboard.hostFallbackName", "host")}`
      : effectiveCompanionTone === "off"
        ? t("dashboard.companionOff", "Web app off")
        : effectiveCompanionTone === "live"
          ? t("dashboard.companionLive", "Web app running")
          : t("dashboard.companionCheck", "Web app check");
  const companionDotClass =
    effectiveCompanionTone === "live"
      ? "bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.14)]"
      : effectiveCompanionTone === "warn"
        ? "bg-amber-400 shadow-[0_0_0_5px_rgba(251,191,36,0.14)]"
        : "bg-slate-400 shadow-[0_0_0_5px_rgba(148,163,184,0.12)]";

  return (
    <div className="page-shell">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">{t("nav.dashboard", "Dashboard")}</h1>
          <div className="page-subtitle">
            {t(
              "dashboard.subtitle",
              "Follow inventory health, current usage and printer activity from one overview.",
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 xl:pt-1">
          <button
            type="button"
            onClick={() => onOpenCompanionSettings?.()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300/35 backdrop-blur transition hover:bg-slate-50 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-900"
            title={t("dashboard.openCompanionSettings", "Open companion settings")}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${companionDotClass}`} />
            {companionLabel}
          </button>
          <div className="rounded-full border border-slate-300/70 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm shadow-slate-300/35 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-300 dark:shadow-none">
            {lastSyncLabel}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.title}
            {...stat}
            onClick={
              stat.id === "total"
                ? () => onNavigate?.("inventory")
                : stat.id === "activePrinters"
                  ? () => onNavigate?.("printers")
                  : stat.id === "lowStock"
                    ? () => onOpenLowStock?.()
                    : stat.id === "monthlyUsage"
                      ? () => onNavigate?.("statistics")
                      : undefined
            }
          />
        ))}
      </div>

      <div className="mt-6 surface-card">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="section-eyebrow">
              {t("dashboard.ownershipSnapshot", "Ownership snapshot")}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-sky-200/85 bg-sky-50/80 px-3 py-3 dark:border-sky-400/25 dark:bg-sky-500/10">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipOnHand.owned}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.ownedOnHand", "Owned on hand")}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200/85 bg-amber-50/80 px-3 py-3 dark:border-amber-400/25 dark:bg-amber-500/10">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipOnHand.borrowedIn}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.borrowedInOnHand", "Borrowed in on hand")}
            </div>
          </div>
          <div className="rounded-2xl border border-rose-200/85 bg-rose-50/80 px-3 py-3 dark:border-rose-400/25 dark:bg-rose-500/10">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipLowStock.owned}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.ownedLowStock", "Owned low stock")}
            </div>
          </div>
          <div className="rounded-2xl border border-orange-200/85 bg-orange-50/80 px-3 py-3 dark:border-orange-400/25 dark:bg-orange-500/10">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipLowStock.borrowedIn}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.borrowedInLowStock", "Borrowed-in low stock")}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <UsageChart
          title={t("dashboard.consumption", "Filament Consumption")}
          value={stats[3]?.value ?? "0 g"}
          caption={t(
            "dashboard.consumptionCaption",
            "Usage is aggregated from printer-linked print jobs.",
          )}
          points={usagePoints}
          onClick={() => onNavigate?.("statistics")}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
        <ActivityTimeline items={activity} />
        <div className="surface-card">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="section-eyebrow">
                {t("dashboard.inventoryHealth", "Inventory Health")}
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-950 dark:text-slate-50">
                {health.headline}
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {health.detail}
              </div>
            </div>
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-emerald-200/85 bg-[radial-gradient(circle_at_30%_28%,rgba(255,255,255,0.96),rgba(220,252,231,0.98)_52%,rgba(167,243,208,0.94))] text-2xl font-semibold text-emerald-800 shadow-inner shadow-white/70 dark:border-emerald-400/28 dark:bg-[radial-gradient(circle_at_30%_28%,rgba(52,211,153,0.26),rgba(15,23,42,0.96)_62%,rgba(2,6,23,1))] dark:text-emerald-200 dark:shadow-none">
              <span className="absolute inset-[8px] rounded-full border border-emerald-200/80 dark:border-emerald-300/10" />
              <span className="relative">{health.score}%</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {health.metrics.map((metric) => (
              <div
                key={metric.id}
                className={`rounded-2xl border px-3 py-3 ${
                  metric.tone === "rose"
                    ? "border-rose-200/85 bg-rose-50/80 dark:border-rose-400/25 dark:bg-rose-500/10"
                    : metric.tone === "amber"
                      ? "border-amber-200/85 bg-amber-50/80 dark:border-amber-400/25 dark:bg-amber-500/10"
                      : metric.tone === "sky"
                        ? "border-sky-200/85 bg-sky-50/80 dark:border-sky-400/25 dark:bg-sky-500/10"
                        : "border-emerald-200/85 bg-emerald-50/80 dark:border-emerald-400/25 dark:bg-emerald-500/10"
                }`}
              >
                <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
                  {metric.value}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <BadgePanel badges={badges} />
      </div>
    </div>
  );
}
