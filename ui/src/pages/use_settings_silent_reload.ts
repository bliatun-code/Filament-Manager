import { useEffect } from "react";

type UseSettingsSilentReloadInput = {
  reloadSettings: (options?: { silent?: boolean }) => void;
  tauri: boolean;
};

export function useSettingsSilentReload({
  reloadSettings,
  tauri,
}: UseSettingsSilentReloadInput) {
  useEffect(() => {
    if (!tauri) {
      return;
    }
    const timer = window.setInterval(() => {
      reloadSettings({ silent: true });
    }, 15000);
    return () => window.clearInterval(timer);
  }, [reloadSettings, tauri]);
}
