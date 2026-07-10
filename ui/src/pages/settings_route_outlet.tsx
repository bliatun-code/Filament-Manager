import { Suspense, type ReactNode } from "react";
import { useI18n } from "../lib/i18n";
import type { SettingsTabKey } from "./settings_page_model";
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
      className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]"
    >
      <Suspense
        fallback={
          <div className="surface-subtle xl:col-span-2 px-4 py-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            {t("app.loadingPage", "Loading page...")}
          </div>
        }
      >
        {routes[activeTab]}
      </Suspense>
    </div>
  );
}
