import { useEffect } from "react";

type UseSettingsInitialLoadOptions = {
  loadTrustedLanCompanionStatus: () => Promise<unknown>;
  reloadSettings: () => Promise<void>;
  tauri: boolean;
};

export function useSettingsInitialLoad({
  loadTrustedLanCompanionStatus,
  reloadSettings,
  tauri,
}: UseSettingsInitialLoadOptions) {
  useEffect(() => {
    if (!tauri) {
      return;
    }
    void reloadSettings();
    void loadTrustedLanCompanionStatus();
  }, [loadTrustedLanCompanionStatus, reloadSettings, tauri]);
}
