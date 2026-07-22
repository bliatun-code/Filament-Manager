import type { SettingsTabKey } from "./settings_page_model";
import type { Dispatch, SetStateAction } from "react";
import { useSettingsActiveTab } from "./use_settings_active_tab";
import { useSettingsAppVersion } from "./use_settings_app_version";
import { useSettingsPageChrome } from "./use_settings_page_chrome";
import { useSettingsPageTabs } from "./use_settings_page_tabs";
import { useSettingsTransientInfo } from "./use_settings_transient_info";

type TranslateFn = (key: string, fallback?: string) => string;

type UseSettingsPageShellStateInput = {
  activeTabPersistenceEnabled?: boolean;
  initialTab: SettingsTabKey | null;
  setInfo: Dispatch<SetStateAction<string | null>>;
  tauri: boolean;
  t: TranslateFn;
};

export function useSettingsPageShellState({
  activeTabPersistenceEnabled = true,
  initialTab,
  setInfo,
  tauri,
  t,
}: UseSettingsPageShellStateInput) {
  const appVersion = useSettingsAppVersion(tauri);
  const { activeTab, setActiveTab } = useSettingsActiveTab(initialTab, {
    persistenceEnabled: activeTabPersistenceEnabled,
  });
  const { pageChromeLabels, settingsPageMessageLabels } = useSettingsPageChrome(t);
  const { settingsTabButtons } = useSettingsPageTabs(activeTab, t);
  const { showTransientInfo } = useSettingsTransientInfo(setInfo);

  return {
    activeTab,
    appVersion,
    pageChromeLabels,
    setActiveTab,
    settingsPageMessageLabels,
    settingsTabButtons,
    showTransientInfo,
  };
}
