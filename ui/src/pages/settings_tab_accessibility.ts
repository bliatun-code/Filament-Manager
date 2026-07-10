import type { SettingsTabKey } from "./settings_page_model";

export function settingsTabId(tab: SettingsTabKey): string {
  return `settings-tab-${tab.toLowerCase()}`;
}

export function settingsTabPanelId(tab: SettingsTabKey): string {
  return `settings-panel-${tab.toLowerCase()}`;
}

export function resolveSettingsTabNavigationIndex(
  currentIndex: number,
  tabCount: number,
  key: string,
): number | null {
  if (tabCount <= 0) {
    return null;
  }
  if (key === "Home") {
    return 0;
  }
  if (key === "End") {
    return tabCount - 1;
  }
  if (key === "ArrowRight") {
    return (currentIndex + 1) % tabCount;
  }
  if (key === "ArrowLeft") {
    return (currentIndex - 1 + tabCount) % tabCount;
  }
  return null;
}
