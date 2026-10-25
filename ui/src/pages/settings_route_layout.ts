import type { SettingsTabKey } from "./settings_page_model";

export function settingsRouteOutletGridClass(activeTab: SettingsTabKey): string {
  if (activeTab === "FILAMENT_DEFAULTS") {
    return "grid min-w-0 grid-cols-1";
  }
  if (activeTab === "GENERAL" || activeTab === "LIBRARY" || activeTab === "PRINTERS" || activeTab === "CATALOG" || activeTab === "MAINTENANCE") {
    return "grid min-w-0 grid-cols-1";
  }
  return "mt-4 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]";
}

export function settingsRouteOutletFallbackSpanClass(
  activeTab: SettingsTabKey,
): string {
  if (activeTab === "GENERAL" || activeTab === "FILAMENT_DEFAULTS" || activeTab === "LIBRARY" || activeTab === "PRINTERS" || activeTab === "CATALOG" || activeTab === "MAINTENANCE") return "";
  return "xl:col-span-2";
}
