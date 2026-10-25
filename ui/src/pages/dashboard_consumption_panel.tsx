import { useEffect, type RefObject } from "react";
import { UsageChart } from "../components/dashboard_widgets";
import type { DashboardUsageMonth } from "../lib/dashboard_model";
import { useI18n } from "../lib/i18n";
import { formatGrams } from "../lib/weight_display";

export default function DashboardConsumptionPanel({
  consumptionPanelRef,
  onOpenStatistics,
  onReady,
  usageAvailable,
  usageMonths,
  usageTotal12m,
}: {
  consumptionPanelRef: RefObject<HTMLDivElement | null>;
  onOpenStatistics?: () => void;
  onReady: () => void;
  usageAvailable: boolean;
  usageMonths: DashboardUsageMonth[];
  usageTotal12m: number;
}) {
  const { t, locale } = useI18n();
  const annualUsageValue = usageAvailable ? formatGrams(usageTotal12m, "zero", locale) : "—";
  useEffect(() => { onReady(); }, [onReady]);
  return (
    <>
      <div ref={consumptionPanelRef} className="min-w-0" data-testid="dashboard-consumption-panel">
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
    </>
  );
}
