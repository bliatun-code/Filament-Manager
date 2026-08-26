import type { SettingsTabKey } from "./settings_page_model";

export function settingsRouteOutletGridClass(activeTab: SettingsTabKey): string {
  if (activeTab === "FILAMENT_DEFAULTS") {
    return "mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]";
  }
  if (activeTab === "GENERAL") {
    return "mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
  }
  return "mt-4 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]";
}

export function settingsRouteOutletFallbackSpanClass(
  activeTab: SettingsTabKey,
): string {
  return activeTab === "FILAMENT_DEFAULTS" || activeTab === "GENERAL"
    ? "lg:col-span-2"
    : "xl:col-span-2";
}
