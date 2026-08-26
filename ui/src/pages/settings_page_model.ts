import type { SettingsPageData } from "../lib/settings_data_source";
import { buildSettingsSwatchDrafts } from "./settings_catalog_model";
import { normalizeLibrarySyncMode, type LibrarySyncMode } from "./settings_library_sync_model";

export type SettingsPageMessageLabels = {
  desktopOnly: string;
  loadFailed: string;
};

export type SettingsPageChromeLabels = {
  desktopOnly: string;
  subtitle: string;
  title: string;
};

export const SETTINGS_PAGE_TAB_ORDER = [
  "GENERAL",
  "FILAMENT_DEFAULTS",
  "LIBRARY",
  "PRINTERS",
  "CATALOG",
  "MAINTENANCE",
] as const;

export type SettingsTabKey = (typeof SETTINGS_PAGE_TAB_ORDER)[number];
export type SettingsPageTabLabelMap = Record<SettingsTabKey, string>;
export type SettingsPageTabOption = {
  id: SettingsTabKey;
  label: string;
};
export type SettingsPageTabButton = SettingsPageTabOption & {
  active: boolean;
};

export type SettingsPageDataModel = {
  bambuLiveIntegrations: SettingsPageData["bambuLiveIntegrations"];
  catalogRows: SettingsPageData["catalogRows"];
  librarySyncDeviceNameDraft: string;
  librarySyncHostBaseUrlDraft: string;
  librarySyncModeDraft: LibrarySyncMode;
  librarySyncSettings: SettingsPageData["syncSettings"];
  librarySyncSnapshot: SettingsPageData["librarySyncSnapshot"];
  printerOverview: SettingsPageData["overviewRows"];
  printers: SettingsPageData["snapshot"]["printers"];
  revisionPollComplete: SettingsPageData["revisionPollComplete"];
  spoolRows: SettingsPageData["spoolRows"];
  swatchDraftById: Record<string, string>;
};

type SettingsPagePrinterSnapshot<Printer> = {
  printers: Printer[];
};

type SettingsPagePrinterOverviewRow<Printer> = {
  printer: Printer;
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
  return SETTINGS_PAGE_TAB_ORDER.map((id) => ({ id, label: labels[id] }));
}

export function buildSettingsPageTabButtons(
  tabs: SettingsPageTabOption[],
  activeTab: SettingsTabKey,
): SettingsPageTabButton[] {
  return tabs.map((tab) => ({
    ...tab,
    active: tab.id === activeTab,
  }));
}

export function isSettingsTabKey(value: unknown): value is SettingsTabKey {
  return SETTINGS_PAGE_TAB_ORDER.some((tab) => tab === value);
}

export function normalizeSettingsInitialTab(initialTab: unknown): SettingsTabKey {
  return isSettingsTabKey(initialTab) ? initialTab : "GENERAL";
}

export function resolveSettingsPagePrinters<Printer>({
  overviewRows,
  snapshot,
  syncMode,
}: {
  overviewRows: Array<SettingsPagePrinterOverviewRow<Printer>>;
  snapshot: SettingsPagePrinterSnapshot<Printer>;
  syncMode: string | null | undefined;
}): Printer[] {
  return syncMode === "CLIENT" ? overviewRows.map((row) => row.printer) : snapshot.printers;
}

export function buildSettingsPageDataModel(data: SettingsPageData): SettingsPageDataModel {
  return {
    bambuLiveIntegrations: data.bambuLiveIntegrations,
    catalogRows: data.catalogRows,
    librarySyncDeviceNameDraft: data.syncSettings.device_name ?? "",
    librarySyncHostBaseUrlDraft: data.syncSettings.host_base_url ?? "",
    librarySyncModeDraft: normalizeLibrarySyncMode(data.syncSettings.mode),
    librarySyncSettings: data.syncSettings,
    librarySyncSnapshot: data.librarySyncSnapshot,
    printerOverview: data.overviewRows,
    printers: resolveSettingsPagePrinters({
      overviewRows: data.overviewRows,
      snapshot: data.snapshot,
      syncMode: data.syncSettings.mode,
    }),
    revisionPollComplete: data.revisionPollComplete,
    spoolRows: data.spoolRows,
    swatchDraftById: buildSettingsSwatchDrafts(data.catalogRows),
  };
}
