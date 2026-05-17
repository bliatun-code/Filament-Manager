import { useMemo } from "react";
import {
  ActivityTimeline,
  BadgePanel,
  StatCard,
  UsageChart,
} from "../components/dashboard_widgets";
import {
  buildDashboardBadges,
  buildDashboardCompanionPresentation,
} from "../lib/dashboard_model";
import { useI18n } from "../lib/i18n";
import {
  InventoryHealthPanel,
  OwnershipSnapshotPanel,
} from "./dashboard_panels";
import { useDashboardPageData } from "./use_dashboard_page_data";
import type { PageKey } from "../App";

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
  const badges = useMemo(
    () => buildDashboardBadges({ goalMetrics, t }),
    [goalMetrics, t],
  );
  const companionPresentation = useMemo(
    () =>
      buildDashboardCompanionPresentation({
        clientHostCompanionTone,
        clientHostDisplayName,
        clientHostNeedsRepair,
        companionStatus,
        dashboardSyncMode,
        t,
      }),
    [
      clientHostCompanionTone,
      clientHostDisplayName,
      clientHostNeedsRepair,
      companionStatus,
      dashboardSyncMode,
      t,
    ],
  );
  const companionDotClass =
    companionPresentation.tone === "live"
      ? "bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.14)]"
      : companionPresentation.tone === "warn"
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
            {companionPresentation.label}
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

      <OwnershipSnapshotPanel
        lowStock={ownershipLowStock}
        onHand={ownershipOnHand}
        t={t}
      />

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
        <InventoryHealthPanel health={health} t={t} />
      </div>

      <div className="mt-8">
        <BadgePanel badges={badges} />
      </div>
    </div>
  );
}
