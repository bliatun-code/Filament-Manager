import {
  readVersionedLocalPreference,
  writeVersionedLocalPreference,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

export type InventoryViewMode = "CARDS" | "LIST";

export type InventoryPagePreferences = {
  advancedFiltersOpen: boolean;
  inventoryView: InventoryViewMode;
};

export const INVENTORY_PAGE_PREFERENCES_STORAGE_KEY =
  "filament-manager:inventory-page-preferences";
const INVENTORY_PAGE_PREFERENCES_VERSION = 1;

export const DEFAULT_INVENTORY_PAGE_PREFERENCES: InventoryPagePreferences = Object.freeze({
  advancedFiltersOpen: false,
  inventoryView: "CARDS",
});

type InventoryPagePreferenceOptions = {
  deterministic?: boolean;
  storage?: LocalPreferenceStorage | null;
};

export function normalizeInventoryPagePreferences(
  value: unknown,
): InventoryPagePreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<Record<keyof InventoryPagePreferences, unknown>>;
  return {
    advancedFiltersOpen:
      typeof candidate.advancedFiltersOpen === "boolean"
        ? candidate.advancedFiltersOpen
        : DEFAULT_INVENTORY_PAGE_PREFERENCES.advancedFiltersOpen,
    inventoryView:
      candidate.inventoryView === "CARDS" || candidate.inventoryView === "LIST"
        ? candidate.inventoryView
        : DEFAULT_INVENTORY_PAGE_PREFERENCES.inventoryView,
  };
}

export function readInventoryPagePreferences({
  deterministic = false,
  storage,
}: InventoryPagePreferenceOptions = {}): InventoryPagePreferences {
  if (deterministic) {
    return { ...DEFAULT_INVENTORY_PAGE_PREFERENCES };
  }
  return readVersionedLocalPreference({
    fallback: { ...DEFAULT_INVENTORY_PAGE_PREFERENCES },
    key: INVENTORY_PAGE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeInventoryPagePreferences,
    storage,
    version: INVENTORY_PAGE_PREFERENCES_VERSION,
  });
}

export function writeInventoryPagePreferences(
  value: InventoryPagePreferences,
  { deterministic = false, storage }: InventoryPagePreferenceOptions = {},
): boolean {
  if (deterministic) {
    return false;
  }
  return writeVersionedLocalPreference({
    key: INVENTORY_PAGE_PREFERENCES_STORAGE_KEY,
    normalize: normalizeInventoryPagePreferences,
    storage,
    value,
    version: INVENTORY_PAGE_PREFERENCES_VERSION,
  });
}
