import {
  MAX_LOCAL_PREFERENCE_LENGTH,
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

export type DashboardLowStockPreferences = {
  hiddenProductKeys: string[];
};

export type DashboardLowStockPreferenceOptions = {
  deterministic?: boolean;
  libraryId?: string | null;
  storage?: LocalPreferenceStorage | null;
};

export const DASHBOARD_LOW_STOCK_PREFERENCES_STORAGE_KEY_PREFIX =
  "filament-manager:dashboard-low-stock-preferences";
export const DASHBOARD_LOW_STOCK_PREFERENCES_VERSION = 1;
export const MAX_DASHBOARD_LOW_STOCK_LIBRARY_ID_LENGTH = 256;
export const MAX_DASHBOARD_LOW_STOCK_PRODUCT_KEY_LENGTH = 512;
export const MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS = 256;

export const DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES: Readonly<{
  hiddenProductKeys: readonly string[];
}> = Object.freeze({
  hiddenProductKeys: Object.freeze([]),
});

function defaultPreferences(): DashboardLowStockPreferences {
  return { hiddenProductKeys: [] };
}

function normalizeLibraryId(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized &&
    normalized.length <= MAX_DASHBOARD_LOW_STOCK_LIBRARY_ID_LENGTH
    ? normalized
    : null;
}

function normalizedProductKey(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized &&
    normalized.length <= MAX_DASHBOARD_LOW_STOCK_PRODUCT_KEY_LENGTH
    ? normalized
    : null;
}

function preferenceEnvelopeLength(hiddenProductKeys: string[]): number {
  return JSON.stringify({
    value: { hiddenProductKeys },
    version: DASHBOARD_LOW_STOCK_PREFERENCES_VERSION,
  }).length;
}

export function normalizeDashboardLowStockPreferences(
  value: unknown,
): DashboardLowStockPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const rawKeys = (value as { hiddenProductKeys?: unknown }).hiddenProductKeys;
  if (!Array.isArray(rawKeys)) {
    return null;
  }

  const hiddenProductKeys: string[] = [];
  const seen = new Set<string>();
  for (const rawKey of rawKeys) {
    const productKey = normalizedProductKey(rawKey);
    if (!productKey || seen.has(productKey)) {
      continue;
    }
    if (hiddenProductKeys.length >= MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS) {
      break;
    }
    const candidate = [...hiddenProductKeys, productKey];
    if (preferenceEnvelopeLength(candidate) > MAX_LOCAL_PREFERENCE_LENGTH) {
      break;
    }
    hiddenProductKeys.push(productKey);
    seen.add(productKey);
  }
  return { hiddenProductKeys };
}

export function dashboardLowStockPreferencesStorageKey(
  libraryId: string | null | undefined,
): string | null {
  const normalizedLibraryId = normalizeLibraryId(libraryId);
  return normalizedLibraryId
    ? `${DASHBOARD_LOW_STOCK_PREFERENCES_STORAGE_KEY_PREFIX}:${normalizedLibraryId}`
    : null;
}

export function readDashboardLowStockPreferences({
  deterministic = false,
  libraryId,
  storage,
}: DashboardLowStockPreferenceOptions = {}): DashboardLowStockPreferences {
  const key = dashboardLowStockPreferencesStorageKey(libraryId);
  if (deterministic || !key) {
    return defaultPreferences();
  }
  return readVersionedLocalPreference({
    fallback: defaultPreferences(),
    key,
    normalize: normalizeDashboardLowStockPreferences,
    storage,
    version: DASHBOARD_LOW_STOCK_PREFERENCES_VERSION,
  });
}

export function writeDashboardLowStockPreferences(
  value: DashboardLowStockPreferences,
  {
    deterministic = false,
    libraryId,
    storage,
  }: DashboardLowStockPreferenceOptions = {},
): boolean {
  const key = dashboardLowStockPreferencesStorageKey(libraryId);
  if (deterministic || !key) {
    return false;
  }
  return writeVersionedLocalPreference({
    key,
    normalize: normalizeDashboardLowStockPreferences,
    storage,
    value,
    version: DASHBOARD_LOW_STOCK_PREFERENCES_VERSION,
  });
}

export function addHiddenDashboardLowStockProductKey(
  preferences: DashboardLowStockPreferences,
  productKey: string,
): DashboardLowStockPreferences {
  const normalizedPreferences =
    normalizeDashboardLowStockPreferences(preferences) ?? defaultPreferences();
  const normalizedKey = normalizedProductKey(productKey);
  if (!normalizedKey) {
    return normalizedPreferences;
  }

  const candidates = [
    ...normalizedPreferences.hiddenProductKeys.filter(
      (candidate) => candidate !== normalizedKey,
    ),
    normalizedKey,
  ];
  const hiddenProductKeys: string[] = [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = [candidates[index], ...hiddenProductKeys];
    if (
      candidate.length <= MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS &&
      preferenceEnvelopeLength(candidate) <= MAX_LOCAL_PREFERENCE_LENGTH
    ) {
      hiddenProductKeys.unshift(candidates[index]);
    }
  }
  return { hiddenProductKeys };
}

export function removeHiddenDashboardLowStockProductKey(
  preferences: DashboardLowStockPreferences,
  productKey: string,
): DashboardLowStockPreferences {
  const normalizedPreferences =
    normalizeDashboardLowStockPreferences(preferences) ?? defaultPreferences();
  const normalizedKey = normalizedProductKey(productKey);
  if (!normalizedKey) {
    return normalizedPreferences;
  }
  return {
    hiddenProductKeys: normalizedPreferences.hiddenProductKeys.filter(
      (candidate) => candidate !== normalizedKey,
    ),
  };
}
