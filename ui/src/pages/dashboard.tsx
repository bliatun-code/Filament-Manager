import { useMemo } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  StatCard,
  UsageChart,
} from "../components/dashboard_widgets";
import { useI18n } from "../lib/i18n";
import { useDashboardPageData } from "./use_dashboard_page_data";
import type { PageKey } from "../App";

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

export default function DashboardPage({
  onNavigate,
  onOpenLowStock,
  onOpenCompanionSettings,
}: DashboardPageProps) {
  const { t } = useI18n();
  const {
    activity,
    clientHostCompanionTone,
    clientHostDisplayName,
    clientHostNeedsRepair,
    companionStatus,
    dashboardSyncMode,
    goalMetrics,
    health,
    lastSyncLabel,
    ownershipLowStock,
    ownershipOnHand,
    stats,
    usagePoints,
  } = useDashboardPageData(t);
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
        : clientHostNeedsRepair
          ? t("settings.librarySyncClientAuthNeedsRepair", "Re-pair required")
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
  const monthlyUsageValue = stats.find((stat) => stat.id === "monthlyUsage")?.value ?? "0 g";

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
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300/70 bg-white/86 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-300/25 backdrop-blur transition hover:bg-white dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:shadow-none dark:hover:bg-slate-900"
            title={t("dashboard.openCompanionSettings", "Open companion settings")}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${companionDotClass}`} />
            {companionLabel}
          </button>
          <div className="rounded-lg border border-slate-300/70 bg-white/72 px-3 py-2 text-sm text-slate-600 shadow-sm shadow-slate-300/20 backdrop-blur dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:shadow-none">
            {lastSyncLabel}
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard
            key={stat.id}
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
          <div className="rounded-lg border border-sky-200/80 bg-sky-50/58 px-3 py-3 dark:border-sky-400/22 dark:bg-sky-500/[0.08]">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipOnHand.owned}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.ownedOnHand", "Owned on hand")}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200/80 bg-amber-50/58 px-3 py-3 dark:border-amber-400/22 dark:bg-amber-500/[0.08]">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipOnHand.borrowedIn}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.borrowedInOnHand", "Borrowed in on hand")}
            </div>
          </div>
          <div className="rounded-lg border border-rose-200/80 bg-rose-50/58 px-3 py-3 dark:border-rose-400/22 dark:bg-rose-500/[0.08]">
            <div className="text-lg font-semibold text-slate-950 dark:text-slate-50">
              {ownershipLowStock.owned}
            </div>
            <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              {t("dashboard.ownedLowStock", "Owned low stock")}
            </div>
          </div>
          <div className="rounded-lg border border-orange-200/80 bg-orange-50/58 px-3 py-3 dark:border-orange-400/22 dark:bg-orange-500/[0.08]">
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
          key={monthlyUsageValue}
          title={t("dashboard.consumption", "Filament Consumption")}
          value={monthlyUsageValue}
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
                className={`rounded-lg border px-3 py-3 ${
                  metric.tone === "rose"
                    ? "border-rose-200/80 bg-rose-50/58 dark:border-rose-400/22 dark:bg-rose-500/[0.08]"
                    : metric.tone === "amber"
                      ? "border-amber-200/80 bg-amber-50/58 dark:border-amber-400/22 dark:bg-amber-500/[0.08]"
                      : metric.tone === "sky"
                        ? "border-sky-200/80 bg-sky-50/58 dark:border-sky-400/22 dark:bg-sky-500/[0.08]"
                        : "border-emerald-200/80 bg-emerald-50/58 dark:border-emerald-400/22 dark:bg-emerald-500/[0.08]"
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
