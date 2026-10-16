import { useEffect, useMemo, type ReactNode, type RefObject } from "react";
import { BadgePanel, UsageChart } from "../components/dashboard_widgets";
import type { DashboardGoalMetrics, DashboardHealth, DashboardUsageMonth } from "../lib/dashboard_model";
import { buildDashboardBadges } from "../lib/dashboard_badges";
import { useI18n } from "../lib/i18n";
import { formatGrams } from "../lib/weight_display";
import { InventoryHealthPanel, OwnershipSnapshotPanel } from "./dashboard_panels";

export default function DashboardLibraryDetails({
  consumptionPanelRef,
  goalMetrics,
  health,
  lowStock,
  onAddFirstSpool,
  onOpenStatistics,
  onReady,
  onHand,
  onboardingChecklist,
  usageAvailable,
  usageMonths,
  usageTotal12m,
}: {
  consumptionPanelRef: RefObject<HTMLDivElement | null>;
  goalMetrics: DashboardGoalMetrics;
  health: DashboardHealth;
  lowStock: { owned: number; borrowedIn: number };
  onAddFirstSpool?: () => void;
  onOpenStatistics?: () => void;
  onReady: () => void;
  onHand: { total: number; owned: number; borrowedIn: number; inUse: number };
  onboardingChecklist: ReactNode;
  usageAvailable: boolean;
  usageMonths: DashboardUsageMonth[];
  usageTotal12m: number;
}) {
  const { t, locale } = useI18n();
  const badges = useMemo(() => buildDashboardBadges({ goalMetrics, locale, t }), [goalMetrics, locale, t]);
  const annualUsageValue = usageAvailable ? formatGrams(usageTotal12m, "zero", locale) : "—";
  useEffect(() => { onReady(); }, [onReady]);
  return (
    <div className="space-y-4 border-t border-slate-200 px-3 pb-4 dark:border-slate-700 sm:px-4">
      {onboardingChecklist}
      <OwnershipSnapshotPanel locale={locale} lowStock={lowStock} onHand={onHand} t={t} />
      <InventoryHealthPanel health={health} locale={locale} onAddFirstSpool={onAddFirstSpool} t={t} />
      <div ref={consumptionPanelRef} className="mt-8" data-testid="dashboard-consumption-panel">
        <UsageChart
          title={t("dashboard.consumption", "Filament Consumption")}
          value={annualUsageValue}
          period={t("dashboard.last12Months", "Last 12 months")}
          caption={t("dashboard.consumptionCaption", "Recorded printer jobs and Bambu Live sessions.")}
          months={usageMonths}
          unavailableMessage={usageAvailable ? null : t("dashboard.annualUsageUnavailable", "Update the host to show 12-month history.")}
          onClick={onOpenStatistics}
        />
      </div>
      <BadgePanel badges={badges} />
    </div>
  );
}
