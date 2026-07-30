import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { AppUpdateCheckState } from "./app_update_check";
import {
  AppUpdateContext,
  type AppUpdateContextValue,
} from "./app_update_context";
import {
  APP_UPDATE_STARTUP_DELAY_MS,
  dismissAppUpdateVersion,
  isAutomaticAppUpdateCheckDue,
  readAppUpdatePreferences,
  recordAutomaticAppUpdateCheckAttempt,
  setAutomaticAppUpdateChecksEnabled,
  shouldShowAppUpdateNotification,
  writeAppUpdatePreferences,
  type AppUpdatePreferences,
} from "./app_update_preferences";
import { isTauri } from "./tauri_invoke";
import type { AppUpdateCheckResult } from "./tauri_maintenance_client";
import { useAppUpdateCheck } from "./use_app_update_check";

function successfulResult(state: AppUpdateCheckState): AppUpdateCheckResult | null {
  return state.status === "SUCCESS" ? state.result : null;
}

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { check, state } = useAppUpdateCheck();
  const [preferences, setPreferences] = useState<AppUpdatePreferences>(() =>
    readAppUpdatePreferences(),
  );

  const updatePreferences = useCallback(
    (update: (current: AppUpdatePreferences) => AppUpdatePreferences) => {
      setPreferences(update);
    },
    [],
  );

  useEffect(() => {
    writeAppUpdatePreferences(preferences);
  }, [preferences]);

  const automaticCheckDue = isAutomaticAppUpdateCheckDue(preferences);

  useEffect(() => {
    if (!isTauri() || !automaticCheckDue) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const attemptedAt = Date.now();
      updatePreferences((current) =>
        recordAutomaticAppUpdateCheckAttempt(current, attemptedAt),
      );
      void check({ silent: true });
    }, APP_UPDATE_STARTUP_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [
    automaticCheckDue,
    check,
    updatePreferences,
  ]);

  const checkManually = useCallback(async () => {
    updatePreferences((current) =>
      recordAutomaticAppUpdateCheckAttempt(current, Date.now()),
    );
    return check();
  }, [check, updatePreferences]);

  const setAutomaticChecksEnabled = useCallback(
    (enabled: boolean) => {
      updatePreferences((current) =>
        setAutomaticAppUpdateChecksEnabled(current, enabled),
      );
    },
    [updatePreferences],
  );

  const dismissAvailableUpdate = useCallback(() => {
    const result = successfulResult(state);
    const version = result?.latest_version;
    if (!version) {
      return;
    }
    updatePreferences((current) =>
      dismissAppUpdateVersion(current, version, Date.now()),
    );
  }, [state, updatePreferences]);

  const result = successfulResult(state);
  const value = useMemo<AppUpdateContextValue>(
    () => ({
      automaticChecksEnabled: preferences.automaticChecksEnabled,
      checkManually,
      dismissAvailableUpdate,
      setAutomaticChecksEnabled,
      showUpdateNotification: shouldShowAppUpdateNotification(
        result,
        preferences,
      ),
      state,
    }),
    [
      checkManually,
      dismissAvailableUpdate,
      preferences,
      result,
      setAutomaticChecksEnabled,
      state,
    ],
  );

  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}
