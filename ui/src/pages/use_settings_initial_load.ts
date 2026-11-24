import { useEffect } from "react";

type UseSettingsInitialLoadOptions = {
  dataSourceReady: boolean;
  loadTrustedLanCompanionStatus: () => Promise<unknown>;
  reloadSettings: (options?: { tabChange: boolean }) => Promise<void>;
  spoolRowsPending: boolean;
  tauri: boolean;
};

export function useSettingsInitialLoad({
  dataSourceReady,
  loadTrustedLanCompanionStatus,
  reloadSettings,
  spoolRowsPending,
  tauri,
}: UseSettingsInitialLoadOptions) {
  useEffect(() => {
    if (!tauri) {
      return;
    }
    if (!dataSourceReady) {
      void reloadSettings();
    } else if (spoolRowsPending) {
      void reloadSettings({ tabChange: true });
    }
    void loadTrustedLanCompanionStatus();
  }, [dataSourceReady, loadTrustedLanCompanionStatus, reloadSettings, spoolRowsPending, tauri]);
}
