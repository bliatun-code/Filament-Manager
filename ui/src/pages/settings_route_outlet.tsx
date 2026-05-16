import type { ReactNode } from "react";
import type { SettingsTabKey } from "../App";

type SettingsRouteMap = Record<SettingsTabKey, ReactNode>;

type SettingsRouteOutletProps = {
  activeTab: SettingsTabKey;
  routes: SettingsRouteMap;
};

export function SettingsRouteOutlet({ activeTab, routes }: SettingsRouteOutletProps) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
      {routes[activeTab]}
    </div>
  );
}
