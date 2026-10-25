import type { ActivityItem } from "../components/dashboard_widgets";
import type { MessageParams } from "../../../src-tauri/companion_browser/message_format.js";
import {
  isBorrowedInOwnership,
  isSpoolLowStock,
  isSpoolStockHealthy,
  isSpoolStatusAssigned,
  isSpoolStatusEmptyOrLost,
  isSpoolStatusOnHand,
} from "./inventory_domain";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";
import { isActiveOutboundLoan } from "./loan_state";
import { summarizeEffectivePrinterSlots } from "./printer_profiles";
import type {
  InventoryOverview,
  PrinterOverviewRow,
  WishlistItemRow,
} from "./tauri_client";
import type { NormalizedSpoolWithMasterRow } from "./spool_row_normalization";
import {
  formatDisplayInteger,
  type NumberDisplayLocale,
} from "./number_display";
import { formatFilamentDisplayTitle } from "./display_format";
import { formatGrams } from "./weight_display";
import { resolveSpoolLowStockThreshold } from "./low_stock_policy";

type TranslateFn = (
  key: string,
  fallback: string,
  params?: MessageParams,
) => string;

export type DashboardGoalMetrics = {
  totalSpools: number;
  configuredPrinters: number;
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

export type DashboardUsageMonth = {
  month: string;
  usedGrams: number;
};

export type DashboardDerivedState = {
  stats: DashboardStat[];
  activity: ActivityItem[];
  usageMonths: DashboardUsageMonth[];
  usageTotal12m: number;
  usageAvailable: boolean;
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
  locale?: NumberDisplayLocale;
  now?: Date;
  t: TranslateFn;
}): DashboardDerivedState {
  const {
    overview,
    printers,
    spoolRows,
    loans,
    wishlist,
    locale = "en",
    now = new Date(),
    t,
  } = params;
  const activeLoans = loans.filter(isActiveOutboundLoan);
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
  const thresholdResolutions = onHandRows.map(resolveSpoolLowStockThreshold);
  const thresholdValues = new Set(
    thresholdResolutions.map((resolution) => resolution.thresholdGrams),
  );
  const usesLegacyThresholdFallback = thresholdResolutions.some(
    (resolution) => resolution.legacyFallback,
  ) || (onHandRows.length === 0 && overview.low_stock_policy == null);
  const lowStockCandidates = spoolRows.filter((row) => {
    const threshold = resolveSpoolLowStockThreshold(row);
    return isSpoolLowStock(
      {
        status: row.spool.normalized_status,
        remainingGrams: row.spool.remaining_g,
        currentWeightGrams: row.spool.current_weight_g,
        initialWeightGrams: row.spool.initial_weight_g,
      },
      threshold.thresholdGrams,
    );
  });
  const lowStockRows = [...lowStockCandidates]
    .sort((left, right) => (left.spool.remaining_g ?? 0) - (right.spool.remaining_g ?? 0))
    .slice(0, 5)
    .map((row) => ({
      id: row.spool.id,
      name: row.master.filament_name,
      color: row.master.color_name,
      remaining: formatGrams(row.spool.remaining_g ?? 0, "zero", locale),
    }));
  const lowStockCount = lowStockCandidates.length;
  const ownedLowStockCount = lowStockCandidates.filter(
    (row) => !isBorrowedInOwnership(row.spool.ownership_type),
  ).length;
  const borrowedInLowStockCount = lowStockCandidates.filter((row) =>
    isBorrowedInOwnership(row.spool.ownership_type),
  ).length;
  const fallbackThreshold = overview.low_stock_policy?.default_threshold_g ?? 200;
  const onlyThreshold = thresholdValues.values().next().value ?? fallbackThreshold;
  const lowStockSubtitle = usesLegacyThresholdFallback
    ? t(
        "dashboard.legacyLowStockFallback",
        "200 g fallback for older Host",
      )
    : thresholdValues.size <= 1
      ? t("dashboard.atOrBelowThreshold", "At or below {count, number} g", {
          count: onlyThreshold,
        })
      : t("dashboard.materialLowStockThresholds", "Thresholds by material");

  const activity: ActivityItem[] = [
    ...activeLoans.map((loan) => ({
      id: `loan-${loan.loan.id}`,
      title: `${t("dashboard.loanedTo", "Loaned to")} ${loan.loan.borrower_name}`,
      detail: `${formatFilamentDisplayTitle(loan.material, loan.filament_name, loan.color_name)} · ${formatGrams(loan.loan.grams_out, "zero", locale)}`,
      tone: "amber" as const,
    })),

  ];

  const stats: DashboardStat[] = [
    {
      id: "total",
      title: t("dashboard.spoolsOnHand", "Spools on hand"),
      value: formatDisplayInteger(onHandTotal, locale),
      subtitle: t("dashboard.totalSpoolsSubtitle", "Across all locations"),
      trend: `${formatDisplayInteger(onHandInUse, locale)} ${t("dashboard.assigned", "assigned")}`,
      accent: "sky",
    },
    {
      id: "outboundLoans",
      title: t("dashboard.outboundLoans", "Spools on loan"),
      value: formatDisplayInteger(activeLoans.length, locale),
      subtitle: t("dashboard.outboundLoansSubtitle", "Active outbound loans"),
      trend: "",
      accent: "emerald",
    },
    {
      id: "lowStock",
      title: t("dashboard.lowStock", "Low Stock"),
      value: formatDisplayInteger(lowStockCount, locale),
      subtitle: lowStockSubtitle,
      trend: lowStockRows.length > 0 ? `${lowStockRows[0].remaining} ${t("dashboard.lowest", "lowest")}` : t("dashboard.noAlerts", "No alerts"),
      accent: "rose",
    },
    {
      id: "monthlyUsage",
      title: t("dashboard.usageLast30Days", "Consumption in the last 30 days"),
      value: formatGrams(overview.total_consumption_30d, "zero", locale),
      subtitle: t("dashboard.last30", "Last 30 days"),
      trend: t("dashboard.gramsPerDay", "{count} g/day", {
        count: formatDisplayInteger(overview.total_consumption_30d / 30, locale),
      }),
      accent: "amber",
    },
  ];

  const usageMonths = normalizeDashboardUsageMonths(overview.consumption_12m, now);
  const usageAvailable = overview.consumption_12m_available === true;
  // Keep the headline and bars on one source of truth. The backend also reports
  // a total, but summing the normalized buckets prevents an older or partially
  // upgraded cache from reintroducing a headline/chart mismatch.
  const usageTotal12m = usageMonths.reduce(
    (sum, item) => sum + item.usedGrams,
    0,
  );

  const activeSpoolRows = spoolRows.filter((row) => {
    return !isSpoolStatusEmptyOrLost(row.spool.normalized_status);
  });
  const goalMetrics: DashboardGoalMetrics = {
    totalSpools: Math.max(spoolRows.length, overview.total_spools),
    configuredPrinters: printers.length,
    activeSpools: activeSpoolRows.length,
    placedActiveSpools: activeSpoolRows.filter((row) => Boolean((row.spool.location_id ?? "").trim())).length,
    totalJobs: printers.reduce((sum, printer) => sum + Math.max(0, printer.usage.total_jobs), 0),
    totalSlots: effectiveSlotTotals.totalSlots,
    loadedSlots: effectiveSlotTotals.loadedSlots,
  };

  const healthySpools = onHandRows.filter((row) => {
    const threshold = resolveSpoolLowStockThreshold(row);
    return isSpoolStockHealthy(
      {
        status: row.spool.normalized_status,
        remainingGrams: row.spool.remaining_g,
        currentWeightGrams: row.spool.current_weight_g,
        initialWeightGrams: row.spool.initial_weight_g,
      },
      threshold.thresholdGrams,
    );
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
        value: formatDisplayInteger(lowStockCount, locale),
        tone: "rose",
      },
      {
        id: "loaned",
        label: t("dashboard.loaned", "loaned"),
        value: formatDisplayInteger(activeLoans.length, locale),
        tone: "amber",
      },
      {
        id: "onOrder",
        label: t("dashboard.onOrder", "on order"),
        value: formatDisplayInteger(onOrderCount, locale),
        tone: "sky",
      },
      {
        id: "loaded",
        label: t("dashboard.amsLoaded", "slots loaded"),
        value: formatDisplayInteger(effectiveSlotTotals.loadedSlots, locale),
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
    usageMonths,
    usageTotal12m,
    usageAvailable,
    ownershipLowStock: {
      owned: spoolRows.length > 0 ? ownedLowStockCount : overview.owned_low_stock,
      borrowedIn:
        spoolRows.length > 0 ? borrowedInLowStockCount : overview.borrowed_in_low_stock,
    },
    ownershipOnHand: {
      total: spoolRows.length > 0 ? onHandTotal : overview.total_spools,
      owned: spoolRows.length > 0 ? onHandOwned : overview.total_owned_spools,
      borrowedIn:
        spoolRows.length > 0 ? onHandBorrowedIn : overview.total_borrowed_in_spools,
      inUse: onHandInUse,
    },
    goalMetrics,
    health,
  };
}

const DASHBOARD_USAGE_MONTH_COUNT = 12;
const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

function usageMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function dashboardCalendarMonthKey(now = new Date()): string {
  const validNow = Number.isFinite(now.getTime()) ? now : new Date();
  return usageMonthKey(validNow.getFullYear(), validNow.getMonth());
}

export function dashboardCalendarMonthChanged(
  lastLoadedMonth: string,
  now = new Date(),
): boolean {
  return lastLoadedMonth !== dashboardCalendarMonthKey(now);
}

/**
 * Builds a stable calendar-month series for the current month and the eleven
 * preceding months. Missing, duplicate, invalid, and negative buckets from an
 * older or partially upgraded host are handled without breaking the dashboard.
 */
export function normalizeDashboardUsageMonths(
  rows: InventoryOverview["consumption_12m"],
  now = new Date(),
): DashboardUsageMonth[] {
  const validNow = Number.isFinite(now.getTime()) ? now : new Date();
  const currentMonth = new Date(validNow.getFullYear(), validNow.getMonth(), 1);
  const expectedMonths = Array.from(
    { length: DASHBOARD_USAGE_MONTH_COUNT },
    (_, index) => {
      const month = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - (DASHBOARD_USAGE_MONTH_COUNT - 1 - index),
        1,
      );
      return usageMonthKey(month.getFullYear(), month.getMonth());
    },
  );
  const expectedSet = new Set(expectedMonths);
  const usedByMonth = new Map<string, number>();

  for (const row of rows ?? []) {
    const month = row?.month?.trim();
    const usedGrams = row?.used_grams;
    if (
      !YEAR_MONTH_PATTERN.test(month ?? "") ||
      !expectedSet.has(month ?? "") ||
      typeof usedGrams !== "number" ||
      !Number.isFinite(usedGrams)
    ) {
      continue;
    }
    usedByMonth.set(
      month!,
      (usedByMonth.get(month!) ?? 0) + Math.max(0, usedGrams),
    );
  }

  return expectedMonths.map((month) => ({
    month,
    usedGrams: usedByMonth.get(month) ?? 0,
  }));
}
