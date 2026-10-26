import { Suspense, useState, type ReactNode } from "react";
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
  // Mount sections on first visit and retain their drafts until Settings closes.
  // Keep effects mounted too: leaving a section must not cancel an in-flight save.
  const [visitedTabs, setVisitedTabs] = useState<SettingsTabKey[]>([activeTab]);
  if (!visitedTabs.includes(activeTab)) {
    setVisitedTabs([...visitedTabs, activeTab]);
  }

  return (
    <>
      {visitedTabs.map((tab) => (
        <div
          key={tab}
          hidden={tab !== activeTab}
          style={tab !== activeTab ? { display: "none" } : undefined}
          id={settingsTabPanelId(tab)}
          role="tabpanel"
          aria-labelledby={settingsTabId(tab)}
          tabIndex={0}
          className={settingsRouteOutletGridClass(tab)}
        >
          <Suspense
            fallback={
              <div className={`surface-subtle px-4 py-6 text-sm font-medium text-slate-600 dark:text-slate-300 ${settingsRouteOutletFallbackSpanClass(tab)}`}>
                {t("app.loadingPage", "Loading page...")}
              </div>
            }
          >
            {routes[tab]}
          </Suspense>
        </div>
      ))}
    </>
  );
}
