import type { ReactNode } from "react";
import { dashboardOverviewStyles } from "../lib/dashboard_overview_styles";
import type { DashboardStockPreviewRow } from "../lib/dashboard_overview_data";
import { formatFilamentDisplayTitle as formatInventoryDisplayTitle } from "../lib/display_format";
import { useI18n } from "../lib/i18n";
import { formatGrams } from "../lib/weight_display";
import { InventorySwatchChip } from "./inventory_swatch_chip";

export function DashboardStockOverview({
  items,
  onOpenLowStock,
  available = true,
  children,
}: {
  items: DashboardStockPreviewRow[];
  onOpenLowStock?: () => void;
  available?: boolean;
  children?: ReactNode;
}) {
  const { locale, t } = useI18n();

  return (
    <section className="min-w-0" aria-labelledby="dashboard-stock-overview-title">
      <div className={`mb-3 ${dashboardOverviewStyles.between}`}>
        <h2 id="dashboard-stock-overview-title" className={dashboardOverviewStyles.heading}>
          {t("dashboard.lowStock", "Low Stock")}
        </h2>
        <button type="button" onClick={onOpenLowStock} className={`rounded ${dashboardOverviewStyles.action}`}>
          {t("dashboard.openInventory", "Open inventory")} <span aria-hidden="true">→</span>
        </button>
      </div>
      <div className={dashboardOverviewStyles.card}>
        <p className={`text-xs ${dashboardOverviewStyles.muted}`}>
          {t("dashboard.lowStockOverviewHint", "Spools at or below your low-stock thresholds.")}
        </p>
        {!available ? <p className={`mt-3 text-sm ${dashboardOverviewStyles.muted}`}>{t("dashboard.overviewDetailsUnavailable", "Details are unavailable in this snapshot. Refresh to load them.")}</p> : items.length === 0 ? <p className={`mt-3 text-sm ${dashboardOverviewStyles.muted}`}>{t("dashboard.noLowStock", "No low-stock spools.")}</p> : <ul className={`mt-3 ${dashboardOverviewStyles.rows}`}>
          {items.map((item) => (
            <li key={item.spoolId} className="flex items-center gap-3 py-3">
              <InventorySwatchChip swatchColor={item.hexColor} className="h-10 w-10 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className={`break-words text-sm font-semibold ${dashboardOverviewStyles.primary}`}>
                  {formatInventoryDisplayTitle(item.material, item.filamentName, item.colorName)}
                </p>
                <p className={`mt-0.5 break-words text-xs ${dashboardOverviewStyles.muted}`}>{item.vendor}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold tabular-nums ${dashboardOverviewStyles.primary}`}>{formatGrams(item.remainingG, "zero", locale)}</span>
            </li>
          ))}
        </ul>}
        {children}
      </div>
    </section>
  );
}
