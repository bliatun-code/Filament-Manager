import type { ActivityItem } from "../components/dashboard_widgets";
import { LOW_STOCK_GRAMS } from "./inventory_constants";
import {
  isBorrowedInOwnership,
  isSpoolStatusAssigned,
  isSpoolStatusEmptyOrLost,
  isSpoolStatusOnHand,
} from "./inventory_domain";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import { isActiveOutboundLoan } from "./loan_state";
import { summarizeEffectivePrinterSlots } from "./printer_profiles";
import type {
  InventoryOverview,
  MaterialUsageRow,
  PrinterOverviewRow,
  WishlistItemRow,
} from "./tauri_client";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";

type TranslateFn = (key: string, fallback: string) => string;

export type DashboardGoalMetrics = {
  activeSpools: number;
  placedActiveSpools: number;
  totalJobs: number;
  totalSlots: number;
  loadedSlots: number;
};

export type DashboardBadge = {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
};

export type DashboardStat = {
  id: string;
  title: string;
  value: string;
  subtitle: string;
  trend: string;
  accent: "sky" | "emerald" | "rose" | "amber";
};

export type DashboardHealthMetric = {
  id: string;
  label: string;
  value: string;
  tone: "rose" | "amber" | "sky" | "emerald";
};

export type DashboardHealth = {
  score: number | null;
  headline: string;
  detail: string;
  metrics: DashboardHealthMetric[];
};

export type DashboardDerivedState = {
  stats: DashboardStat[];
  activity: ActivityItem[];
  usagePoints: number[];
  ownershipLowStock: {
    owned: number;
    borrowedIn: number;
  };
  ownershipOnHand: {
    total: number;
    owned: number;
    borrowedIn: number;
    inUse: number;
  };
  goalMetrics: DashboardGoalMetrics;
  health: DashboardHealth;
};

export type DashboardCompanionPresentationTone = "off" | "live" | "warn";

type DashboardCompanionStatusInput = {
  enabled?: boolean | null;
  running?: boolean | null;
  shell_reachable?: boolean | null;
};

function progressRatio(current: number, target: number): number {
  if (target <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, current / target));
}

export function buildDashboardBadges(params: {
  goalMetrics: DashboardGoalMetrics;
  jobGoal?: number;
  t: TranslateFn;
}): DashboardBadge[] {
  const { goalMetrics, t } = params;
  const jobGoal = params.jobGoal ?? 20;
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
}

export function buildDashboardCompanionPresentation(params: {
  clientHostCompanionTone: DashboardCompanionPresentationTone;
  clientHostDisplayName: string | null;
  clientHostNeedsRepair: boolean;
  dashboardSyncMode: string;
  companionStatus: DashboardCompanionStatusInput | null;
  t: TranslateFn;
}): {
  label: string;
  tone: DashboardCompanionPresentationTone;
} {
  const {
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    companionStatus,
    dashboardSyncMode,
    t,
  } = params;
  const standaloneCompanionTone: DashboardCompanionPresentationTone = !companionStatus?.enabled
    ? "off"
    : companionStatus.running && companionStatus.shell_reachable
      ? "live"
      : "warn";
  const tone = dashboardSyncMode === "CLIENT" ? clientHostCompanionTone : standaloneCompanionTone;
  const hostName = clientHostDisplayName ?? t("dashboard.hostFallbackName", "host");
  if (dashboardSyncMode === "CLIENT") {
    if (tone === "off") {
      return {
        label: t("dashboard.hostCompanionOff", "Host disconnected"),
        tone,
      };
    }
    if (clientHostNeedsRepair) {
      return {
        label: t("settings.librarySyncClientAuthNeedsRepair", "Re-pair required"),
        tone,
      };
    }
    return {
      label:
        tone === "live"
          ? `${t("dashboard.connectedToHost", "Connected to")} ${hostName}`
          : `${t("dashboard.checkHostConnection", "Check connection to")} ${hostName}`,
      tone,
    };
  }

  return {
    label:
      tone === "off"
        ? t("dashboard.companionOff", "Web app off")
        : tone === "live"
          ? t("dashboard.companionLive", "Web app running")
          : t("dashboard.companionCheck", "Web app check"),
    tone,
  };
}

export function buildDashboardDerivedState(params: {
  overview: InventoryOverview;
  printers: PrinterOverviewRow[];
  spoolRows: NormalizedSpoolWithMasterRow[];
  loans: NormalizedLoanDetailsRow[];
  wishlist: WishlistItemRow[];
  materialRows?: MaterialUsageRow[] | null;
  t: TranslateFn;
}): DashboardDerivedState {
  const { overview, printers, spoolRows, loans, wishlist, materialRows, t } = params;
  const activeLoans = loans.filter(isActiveOutboundLoan);
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
  const onHandRows = spoolRows.filter((row) => isSpoolStatusOnHand(row.spool.normalized_status));
  const onHandTotal = onHandRows.length;
  const onHandOwned = onHandRows.filter(
    (row) => !isBorrowedInOwnership(row.spool.ownership_type),
  ).length;
  const onHandBorrowedIn = onHandRows.filter((row) =>
    isBorrowedInOwnership(row.spool.ownership_type),
  ).length;
  const onHandInUse = onHandRows.filter((row) =>
    isSpoolStatusAssigned(row.spool.normalized_status),
  ).length;
  const lowStockRows = spoolRows
    .filter((row) => {
      const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
      return (
        !isSpoolStatusEmptyOrLost(row.spool.normalized_status) &&
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
    const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
    return (
      !isSpoolStatusEmptyOrLost(row.spool.normalized_status) &&
      !isBorrowedInOwnership(row.spool.ownership_type) &&
      remaining > 0 &&
      remaining <= LOW_STOCK_GRAMS
    );
  }).length;
  const borrowedInLowStockCount = spoolRows.filter((row) => {
    const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
    return (
      !isSpoolStatusEmptyOrLost(row.spool.normalized_status) &&
      isBorrowedInOwnership(row.spool.ownership_type) &&
      remaining > 0 &&
      remaining <= LOW_STOCK_GRAMS
    );
  }).length;

  const activity: ActivityItem[] = [
    ...activeLoans.slice(0, 3).map((loan) => ({
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

  const stats: DashboardStat[] = [
    {
      id: "total",
      title: t("dashboard.totalSpools", "Total Spools"),
      value: onHandTotal.toString(),
      subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
      trend: `${onHandInUse} ${t("dashboard.assigned", "assigned")}`,
      accent: "sky",
    },
    {
      id: "activePrinters",
      title: t("dashboard.activePrinters", "Active Printers"),
      value: printerCount.toString(),
      subtitle: `${printerCount} ${t("dashboard.configured", "configured")}`,
      trend:
        printerCount > 0
          ? ""
          : t("dashboard.noPrintersConfigured", "No printers configured"),
      accent: "emerald",
    },
    {
      id: "lowStock",
      title: t("dashboard.lowStock", "Low Stock"),
      value: lowStockCount.toString(),
      subtitle: t("dashboard.below200", "Below 200g"),
      trend: lowStockRows.length > 0 ? `${lowStockRows[0].remaining} ${t("dashboard.lowest", "lowest")}` : t("dashboard.noAlerts", "No alerts"),
      accent: "rose",
    },
    {
      id: "monthlyUsage",
      title: t("dashboard.monthlyUsage", "Monthly Usage"),
      value: `${overview.total_consumption_30d} g`,
      subtitle: t("dashboard.last30", "Last 30 days"),
      trend: t("dashboard.gramsPerDay", "{count} g/day").replace(
        "{count}",
        String(Math.round(overview.total_consumption_30d / 30)),
      ),
      accent: "amber",
    },
  ];

  const usageFromMaterials = (materialRows ?? [])
    .map((row) => Math.max(0, row.used_grams))
    .filter((value) => value > 0)
    .slice(0, 8)
    .reverse();
  const usagePoints =
    usageFromMaterials.length >= 2
      ? usageFromMaterials
      : usageFromMaterials.length === 1
        ? [0, usageFromMaterials[0]]
        : [0, overview.total_consumption_30d];

  const activeSpoolRows = spoolRows.filter((row) => {
    return !isSpoolStatusEmptyOrLost(row.spool.normalized_status);
  });
  const goalMetrics: DashboardGoalMetrics = {
    activeSpools: activeSpoolRows.length,
    placedActiveSpools: activeSpoolRows.filter((row) => Boolean((row.spool.location_id ?? "").trim())).length,
    totalJobs: printers.reduce((sum, printer) => sum + Math.max(0, printer.usage.total_jobs), 0),
    totalSlots: effectiveSlotTotals.totalSlots,
    loadedSlots: effectiveSlotTotals.loadedSlots,
  };

  const healthySpools = onHandRows.filter((row) => {
    const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? row.spool.initial_weight_g ?? 0;
    return remaining >= LOW_STOCK_GRAMS;
  }).length;
  const healthScore =
    onHandTotal === 0
      ? null
      : Math.min(100, Math.round((healthySpools / onHandTotal) * 100));
  const health: DashboardHealth = {
    score: healthScore,
    headline:
      healthScore === null
        ? t("dashboard.noInventoryData", "Not enough data")
        : healthScore >= 90
          ? t("dashboard.healthStable", "Stable supply")
          : healthScore >= 70
            ? t("dashboard.healthMonitor", "Monitor restock")
            : t("dashboard.healthRestock", "Restock recommended"),
    detail:
      healthScore === null
        ? t("dashboard.addRollsForHealth", "Add rolls to start health tracking.")
        : t(
            "dashboard.healthBalanceHint",
            "Watch low stock, loans, orders, and loaded slots together.",
          ),
    metrics: [
      {
        id: "lowStock",
        label: t("dashboard.lowStockShort", "low stock"),
        value: lowStockCount.toString(),
        tone: "rose",
      },
      {
        id: "loaned",
        label: t("dashboard.loaned", "loaned"),
        value: activeLoans.length.toString(),
        tone: "amber",
      },
      {
        id: "onOrder",
        label: t("dashboard.onOrder", "on order"),
        value: onOrderCount.toString(),
        tone: "sky",
      },
      {
        id: "loaded",
        label: t("dashboard.amsLoaded", "slots loaded"),
        value: effectiveSlotTotals.loadedSlots.toString(),
        tone: "emerald",
      },
    ],
  };

  return {
    stats,
    activity:
      activity.length > 0
        ? activity
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
    usagePoints,
    ownershipLowStock: {
      owned: ownedLowStockCount || overview.owned_low_stock,
      borrowedIn: borrowedInLowStockCount || overview.borrowed_in_low_stock,
    },
    ownershipOnHand: {
      total: onHandTotal || overview.total_spools,
      owned: onHandOwned || overview.total_owned_spools,
      borrowedIn: onHandBorrowedIn || overview.total_borrowed_in_spools,
      inUse: onHandInUse,
    },
    goalMetrics,
    health,
  };
}
