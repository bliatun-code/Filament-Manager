export type SettingsPageMessageLabels = {
  loadFailed: string;
};

export type SettingsTabKey = "CATALOG" | "GENERAL" | "LIBRARY" | "MAINTENANCE" | "PRINTERS";
export type SettingsPageTabLabelMap = Record<SettingsTabKey, string>;

export function buildSettingsPageLoadErrorMessage(
  labels: Pick<SettingsPageMessageLabels, "loadFailed">,
): string {
  return labels.loadFailed;
}

export function buildSettingsPageTabLabels(labels: SettingsPageTabLabelMap): SettingsPageTabLabelMap {
  return labels;
}
