import {
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "../lib/local_preference_storage";
import {
  isSettingsTabKey,
  type SettingsTabKey,
} from "./settings_page_model";

export type SettingsPagePreferences = {
  activeTab: SettingsTabKey;
};

export const SETTINGS_PAGE_PREFERENCES_STORAGE_KEY =
  "filament-manager:settings-page-preferences";
const SETTINGS_PAGE_PREFERENCES_VERSION = 1;

export const DEFAULT_SETTINGS_PAGE_PREFERENCES: SettingsPagePreferences = Object.freeze({
  activeTab: "GENERAL",
});

type SettingsPagePreferenceOptions = {
  deterministic?: boolean;
  storage?: LocalPreferenceStorage | null;
};

export function normalizeSettingsPagePreferences(
  value: unknown,
): SettingsPagePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const activeTab = (value as { activeTab?: unknown }).activeTab;
  return isSettingsTabKey(activeTab) ? { activeTab } : null;
}

export function readSettingsPagePreferences({
  deterministic = false,
  storage,
}: SettingsPagePreferenceOptions = {}): SettingsPagePreferences {
  if (deterministic) {
    return { ...DEFAULT_SETTINGS_PAGE_PREFERENCES };
  }
  return readVersionedLocalPreference({
    fallback: { ...DEFAULT_SETTINGS_PAGE_PREFERENCES },
    key: SETTINGS_PAGE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeSettingsPagePreferences,
    storage,
    version: SETTINGS_PAGE_PREFERENCES_VERSION,
  });
}

export function writeSettingsPagePreferences(
  value: SettingsPagePreferences,
  { deterministic = false, storage }: SettingsPagePreferenceOptions = {},
): boolean {
  if (deterministic) {
    return false;
  }
  return writeVersionedLocalPreference({
    key: SETTINGS_PAGE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeSettingsPagePreferences,
    storage,
    value,
    version: SETTINGS_PAGE_PREFERENCES_VERSION,
  });
}

export function resolveSettingsActiveTab(
  requestedTab: unknown,
  options: SettingsPagePreferenceOptions = {},
): SettingsTabKey {
  if (isSettingsTabKey(requestedTab)) {
    return requestedTab;
  }
  return readSettingsPagePreferences(options).activeTab;
}
