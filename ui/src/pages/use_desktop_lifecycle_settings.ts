import { useCallback, useEffect, useState } from "react";
import {
  getDesktopLifecycleSettings,
  setContinueInBackground,
  setLaunchAtLogin,
  type DesktopLifecycleSettings,
} from "../lib/tauri_maintenance_client";

type UseDesktopLifecycleSettingsInput = {
  tauri: boolean;
};

export function useDesktopLifecycleSettings({ tauri }: UseDesktopLifecycleSettingsInput) {
  const [settings, setSettings] = useState<DesktopLifecycleSettings | null>(null);
  const [loading, setLoading] = useState(tauri);
  const [updating, setUpdating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!tauri) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError(null);
    void getDesktopLifecycleSettings()
      .then((nextSettings) => {
        if (active) {
          setSettings(nextSettings);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          console.error("Failed to load desktop lifecycle settings.", reason);
          setLoadError(String(reason));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [loadAttempt, tauri]);

  const update = useCallback(
    async (operation: () => Promise<DesktopLifecycleSettings>) => {
      setUpdating(true);
      setUpdateError(null);
      try {
        setSettings(await operation());
      } catch (reason) {
        console.error("Failed to update desktop lifecycle settings.", reason);
        setUpdateError(String(reason));
      } finally {
        setUpdating(false);
      }
    },
    [],
  );

  const handleRetryLoad = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const handleContinueInBackground = useCallback(
    (enabled: boolean) => update(() => setContinueInBackground(enabled)),
    [update],
  );
  const handleLaunchAtLogin = useCallback(
    (enabled: boolean) => update(() => setLaunchAtLogin(enabled)),
    [update],
  );

  return {
    handleContinueInBackground,
    handleLaunchAtLogin,
    handleRetryLoad,
    loadError,
    loading,
    settings,
    updateError,
    updating,
  };
}
