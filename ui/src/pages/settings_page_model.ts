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
