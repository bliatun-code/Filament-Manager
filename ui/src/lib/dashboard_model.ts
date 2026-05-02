import type { ActivityItem } from "../components/dashboard_widgets";
import { LOW_STOCK_GRAMS } from "./inventory_constants";
import { isActiveOutboundLoan } from "./loan_state";
import { summarizeEffectivePrinterSlots } from "./printer_profiles";
import type {
  InventoryOverview,
  MaterialUsageRow,
  PrinterOverviewRow,
  SpoolLoanDetailsRow,
  SpoolWithMasterRow,
  WishlistItemRow,
} from "./tauri_client";

type TranslateFn = (key: string, fallback: string) => string;

export type DashboardGoalMetrics = {
  activeSpools: number;
  placedActiveSpools: number;
  totalJobs: number;
  totalSlots: number;
  loadedSlots: number;
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
  score: number;
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

export function buildDashboardDerivedState(params: {
  overview: InventoryOverview;
  printers: PrinterOverviewRow[];
  spoolRows: SpoolWithMasterRow[];
  loans: SpoolLoanDetailsRow[];
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
  const onHandRows = spoolRows.filter((row) => {
    const status = (row.spool.status ?? "").trim().toUpperCase();
    return status === "IN_STOCK" || status === "IN_USE" || status === "ASSIGNED";
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
    return status === "IN_USE" || status === "ASSIGNED";
  }).length;
  const lowStockRows = spoolRows
    .filter((row) => {
      const status = (row.spool.status ?? "").trim().toUpperCase();
      const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
      return status !== "EMPTY" && status !== "LOST" && remaining > 0 && remaining <= LOW_STOCK_GRAMS;
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
    return status !== "EMPTY" && status !== "LOST" && ownershipType !== "BORROWED_IN" && remaining > 0 && remaining <= LOW_STOCK_GRAMS;
  }).length;
  const borrowedInLowStockCount = spoolRows.filter((row) => {
    const status = (row.spool.status ?? "").trim().toUpperCase();
    const ownershipType = (row.spool.ownership_type ?? "OWNED").trim().toUpperCase();
    const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? 0;
    return status !== "EMPTY" && status !== "LOST" && ownershipType === "BORROWED_IN" && remaining > 0 && remaining <= LOW_STOCK_GRAMS;
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
          ? t("dashboard.allConfiguredActive", "All configured printers are active")
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
      trend: `${Math.round(overview.total_consumption_30d / 30)} g/day`,
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
    const status = row.spool.status.trim().toUpperCase();
    return status !== "EMPTY" && status !== "LOST";
  });
  const goalMetrics: DashboardGoalMetrics = {
    activeSpools: activeSpoolRows.length,
    placedActiveSpools: activeSpoolRows.filter((row) => Boolean((row.spool.location_id ?? "").trim())).length,
    totalJobs: printers.reduce((sum, printer) => sum + Math.max(0, printer.usage.total_jobs), 0),
    totalSlots: effectiveSlotTotals.totalSlots,
    loadedSlots: effectiveSlotTotals.loadedSlots,
  };

  const healthySpools = spoolRows.filter((row) => {
    const remaining = row.spool.remaining_g ?? row.spool.current_weight_g ?? row.spool.initial_weight_g ?? 0;
    return row.spool.status !== "EMPTY" && row.spool.status !== "LOST" && remaining >= 200;
  }).length;
  const healthScore = onHandTotal === 0 ? 100 : Math.round((healthySpools / onHandTotal) * 100);
  const health: DashboardHealth = {
    score: healthScore,
    headline:
      healthScore >= 90
        ? t("dashboard.healthStable", "Stable supply")
        : healthScore >= 70
          ? t("dashboard.healthMonitor", "Monitor restock")
          : t("dashboard.healthRestock", "Restock recommended"),
    detail: t("dashboard.healthBalanceHint", "Watch low stock, loans, orders, and loaded slots together."),
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
