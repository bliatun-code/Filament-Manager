import { useEffect } from "react";

type UseSettingsInitialLoadOptions = {
  dataSourceReady: boolean;
  loadTrustedLanCompanionStatus: () => Promise<unknown>;
  reloadSettings: () => Promise<void>;
  tauri: boolean;
};

export function useSettingsInitialLoad({
  dataSourceReady,
  loadTrustedLanCompanionStatus,
  reloadSettings,
  tauri,
}: UseSettingsInitialLoadOptions) {
  useEffect(() => {
    if (!tauri) {
      return;
    }
    if (!dataSourceReady) {
      void reloadSettings();
    }
    void loadTrustedLanCompanionStatus();
  }, [dataSourceReady, loadTrustedLanCompanionStatus, reloadSettings, tauri]);
}
