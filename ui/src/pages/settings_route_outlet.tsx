import { Suspense, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import type { SettingsTabKey } from "./settings_page_model";
import {
  settingsRouteOutletFallbackSpanClass,
  settingsRouteOutletGridClass,
} from "./settings_route_layout";
import { settingsTabId, settingsTabPanelId } from "./settings_tab_accessibility";

type SettingsRouteMap = Record<SettingsTabKey, ReactNode>;

type SettingsRouteOutletProps = {
  activeTab: SettingsTabKey;
  routes: SettingsRouteMap;
};

export function SettingsRouteOutlet({ activeTab, routes }: SettingsRouteOutletProps) {
  const { t } = useI18n();

  return (
    <div
      id={settingsTabPanelId(activeTab)}
      role="tabpanel"
      aria-labelledby={settingsTabId(activeTab)}
      tabIndex={0}
      className={settingsRouteOutletGridClass(activeTab)}
    >
      <Suspense
        fallback={
          <div
            className={`surface-subtle px-4 py-6 text-sm font-medium text-slate-600 dark:text-slate-300 ${settingsRouteOutletFallbackSpanClass(activeTab)}`}
          >
            {t("app.loadingPage", "Loading page...")}
          </div>
        }
      >
        {routes[activeTab]}
      </Suspense>
    </div>
  );
}
