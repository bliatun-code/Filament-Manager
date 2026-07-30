import type { AppUpdateCheckResult } from "./tauri_maintenance_client";
import {
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

export type AppUpdatePreferences = {
  automaticChecksEnabled: boolean;
  dismissedUntil: number | null;
  dismissedVersion: string | null;
  lastAutomaticCheckAt: number | null;
};

export const APP_UPDATE_PREFERENCES_STORAGE_KEY =
  "filament-manager:app-update-preferences";
const APP_UPDATE_PREFERENCES_VERSION = 1;

export const APP_UPDATE_STARTUP_DELAY_MS = 10_000;
export const APP_UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const APP_UPDATE_DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export const DEFAULT_APP_UPDATE_PREFERENCES: AppUpdatePreferences = Object.freeze({
  automaticChecksEnabled: true,
  dismissedUntil: null,
  dismissedVersion: null,
  lastAutomaticCheckAt: null,
});

type AppUpdatePreferenceOptions = {
  storage?: LocalPreferenceStorage | null;
};

function normalizeTimestamp(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function normalizeVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized && normalized.length <= 128 ? normalized : null;
}

export function normalizeAppUpdatePreferences(
  value: unknown,
): AppUpdatePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Partial<Record<keyof AppUpdatePreferences, unknown>>;
  const dismissedVersion = normalizeVersion(candidate.dismissedVersion);
  const dismissedUntil = normalizeTimestamp(candidate.dismissedUntil);
  const hasValidDismissal =
    dismissedVersion !== null && dismissedUntil !== null;

  return {
    automaticChecksEnabled:
      typeof candidate.automaticChecksEnabled === "boolean"
        ? candidate.automaticChecksEnabled
        : DEFAULT_APP_UPDATE_PREFERENCES.automaticChecksEnabled,
    dismissedUntil: hasValidDismissal ? dismissedUntil : null,
    dismissedVersion: hasValidDismissal ? dismissedVersion : null,
    lastAutomaticCheckAt: normalizeTimestamp(candidate.lastAutomaticCheckAt),
  };
}

function normalizedPreferences(value: unknown): AppUpdatePreferences {
  return (
    normalizeAppUpdatePreferences(value) ?? {
      ...DEFAULT_APP_UPDATE_PREFERENCES,
    }
  );
}

export function readAppUpdatePreferences({
  storage,
}: AppUpdatePreferenceOptions = {}): AppUpdatePreferences {
  return readVersionedLocalPreference({
    fallback: { ...DEFAULT_APP_UPDATE_PREFERENCES },
    key: APP_UPDATE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeAppUpdatePreferences,
    storage,
    version: APP_UPDATE_PREFERENCES_VERSION,
  });
}

export function writeAppUpdatePreferences(
  value: AppUpdatePreferences,
  { storage }: AppUpdatePreferenceOptions = {},
): boolean {
  return writeVersionedLocalPreference({
    key: APP_UPDATE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeAppUpdatePreferences,
    storage,
    value,
    version: APP_UPDATE_PREFERENCES_VERSION,
  });
}

export function isAutomaticAppUpdateCheckDue(
  preferences: AppUpdatePreferences,
  now = Date.now(),
): boolean {
  const currentTime = normalizeTimestamp(now);
  if (currentTime === null) {
    return false;
  }

  const normalized = normalizedPreferences(preferences);
  if (!normalized.automaticChecksEnabled) {
    return false;
  }
  if (normalized.lastAutomaticCheckAt === null) {
    return true;
  }
  if (currentTime < normalized.lastAutomaticCheckAt) {
    return true;
  }
  return (
    currentTime - normalized.lastAutomaticCheckAt >=
    APP_UPDATE_CHECK_INTERVAL_MS
  );
}

export function recordAutomaticAppUpdateCheckAttempt(
  preferences: AppUpdatePreferences,
  attemptedAt = Date.now(),
): AppUpdatePreferences {
  const normalized = normalizedPreferences(preferences);
  const timestamp = normalizeTimestamp(attemptedAt);
  return timestamp === null
    ? normalized
    : { ...normalized, lastAutomaticCheckAt: timestamp };
}

export function setAutomaticAppUpdateChecksEnabled(
  preferences: AppUpdatePreferences,
  enabled: boolean,
): AppUpdatePreferences {
  return {
    ...normalizedPreferences(preferences),
    automaticChecksEnabled: enabled,
  };
}

export function dismissAppUpdateVersion(
  preferences: AppUpdatePreferences,
  version: string,
  dismissedAt = Date.now(),
): AppUpdatePreferences {
  const normalized = normalizedPreferences(preferences);
  const normalizedDismissedAt = normalizeTimestamp(dismissedAt);
  const normalizedVersion = normalizeVersion(version);
  if (
    normalizedDismissedAt === null ||
    normalizedVersion === null ||
    normalizedDismissedAt >
      Number.MAX_SAFE_INTEGER - APP_UPDATE_DISMISS_DURATION_MS
  ) {
    return normalized;
  }

  return {
    ...normalized,
    dismissedUntil:
      normalizedDismissedAt + APP_UPDATE_DISMISS_DURATION_MS,
    dismissedVersion: normalizedVersion,
  };
}

export function shouldShowAppUpdateNotification(
  result: AppUpdateCheckResult | null,
  preferences: AppUpdatePreferences,
  now = Date.now(),
): boolean {
  if (result?.status !== "UPDATE_AVAILABLE") {
    return false;
  }

  const availableVersion = normalizeVersion(result.latest_version);
  const currentTime = normalizeTimestamp(now);
  if (availableVersion === null || currentTime === null) {
    return false;
  }

  const normalized = normalizedPreferences(preferences);
  return (
    normalized.dismissedVersion !== availableVersion ||
    normalized.dismissedUntil === null ||
    currentTime >= normalized.dismissedUntil
  );
}
