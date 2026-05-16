import { useEffect, useState } from "react";
import { getAppVersion } from "../lib/tauri_client";

export function useSettingsAppVersion(tauri: boolean): string | null {
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!tauri) {
      setAppVersion("dev-web");
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      try {
        const version = await getAppVersion();
        if (!cancelled) {
          setAppVersion(version);
        }
      } catch (versionError) {
        console.error(versionError);
        if (!cancelled) {
          setAppVersion(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tauri]);

  return appVersion;
}
