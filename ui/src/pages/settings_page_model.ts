export type SettingsPageMessageLabels = {
  desktopOnly: string;
  loadFailed: string;
};

export type SettingsPageChromeLabels = {
  desktopOnly: string;
  subtitle: string;
  title: string;
};

export type SettingsTabKey = "CATALOG" | "GENERAL" | "LIBRARY" | "MAINTENANCE" | "PRINTERS";
export type SettingsPageTabLabelMap = Record<SettingsTabKey, string>;
export type SettingsPageTabOption = {
  id: SettingsTabKey;
  label: string;
};

export function buildSettingsPageLoadErrorMessage(
  labels: Pick<SettingsPageMessageLabels, "loadFailed">,
): string {
  return labels.loadFailed;
}

export function buildSettingsPageChromeLabels(
  labels: SettingsPageChromeLabels,
): SettingsPageChromeLabels {
  return labels;
}

export function buildSettingsPageDesktopOnlyMessage(
  labels: Pick<SettingsPageMessageLabels, "desktopOnly">,
): string {
  return labels.desktopOnly;
}

export function buildSettingsPageTabLabels(labels: SettingsPageTabLabelMap): SettingsPageTabLabelMap {
  return labels;
}

export function buildSettingsPageTabs(labels: SettingsPageTabLabelMap): SettingsPageTabOption[] {
  return [
    { id: "GENERAL", label: labels.GENERAL },
    { id: "LIBRARY", label: labels.LIBRARY },
    { id: "PRINTERS", label: labels.PRINTERS },
    { id: "CATALOG", label: labels.CATALOG },
    { id: "MAINTENANCE", label: labels.MAINTENANCE },
  ];
}

export function normalizeSettingsInitialTab(initialTab: SettingsTabKey): SettingsTabKey {
  return initialTab;
}
