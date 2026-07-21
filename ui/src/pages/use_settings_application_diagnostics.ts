import { useCallback, useEffect, useReducer } from "react";
import { downloadTextFile } from "../lib/download_file";
import { toErrorMessage } from "../lib/error_text";
import {
  getApplicationDiagnostics,
  getSanitizedSupportBundleJson,
} from "../lib/tauri_client";
import {
  initialSettingsApplicationDiagnosticsState,
  settingsApplicationDiagnosticsReducer,
} from "./settings_application_diagnostics_model";

type TranslateFn = (key: string, fallback?: string) => string;

export function useSettingsApplicationDiagnostics({
  enabled,
  tauri,
  t,
}: {
  enabled: boolean;
  tauri: boolean;
  t: TranslateFn;
}) {
  const [state, dispatch] = useReducer(
    settingsApplicationDiagnosticsReducer,
    initialSettingsApplicationDiagnosticsState,
  );

  const refreshApplicationDiagnostics = useCallback(async () => {
    if (!tauri) {
      return;
    }
    dispatch({ type: "refresh_started" });
    try {
      const diagnostics = await getApplicationDiagnostics();
      dispatch({ type: "refresh_succeeded", diagnostics });
    } catch (error) {
      dispatch({
        type: "refresh_failed",
        error: toErrorMessage(
          error,
          t("settings.diagnosticsRefreshFailed", "Could not refresh application diagnostics."),
          t,
        ),
      });
    }
  }, [tauri, t]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void refreshApplicationDiagnostics();
  }, [enabled, refreshApplicationDiagnostics]);

  const downloadSanitizedSupportBundle = useCallback(async () => {
    if (!tauri) {
      return;
    }
    dispatch({ type: "support_started" });
    try {
      const content = await getSanitizedSupportBundleJson();
      downloadTextFile(
        content,
        `filament-manager-support-${Date.now()}.json`,
        "application/json;charset=utf-8",
      );
      dispatch({ type: "support_succeeded" });
    } catch (error) {
      dispatch({
        type: "support_failed",
        error: toErrorMessage(
          error,
          t(
            "settings.diagnosticsSupportDownloadFailed",
            "Could not download the sanitized support file.",
          ),
          t,
        ),
      });
    }
  }, [tauri, t]);

  return {
    ...state,
    downloadSanitizedSupportBundle,
    refreshApplicationDiagnostics,
  };
}
