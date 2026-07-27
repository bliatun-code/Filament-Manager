import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_INVENTORY_PAGE_PREFERENCES,
  INVENTORY_PAGE_PREFERENCES_STORAGE_KEY,
  normalizeInventoryPagePreferences,
  readInventoryPagePreferences,
  writeInventoryPagePreferences,
} from "./inventory_page_preferences";
import type { LocalPreferenceStorage } from "./local_preference_storage";

class MemoryStorage implements LocalPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("inventory page preferences round trip with an explicit version", () => {
  const storage = new MemoryStorage();
  const preferences = { advancedFiltersOpen: true, inventoryView: "LIST" } as const;

  assert.equal(writeInventoryPagePreferences(preferences, { storage }), true);
  assert.deepEqual(readInventoryPagePreferences({ storage }), preferences);
  assert.match(
    storage.values.get(INVENTORY_PAGE_PREFERENCES_STORAGE_KEY) ?? "",
    /"version":1/,
  );
});

test("inventory page preference fields are independently sanitized", () => {
  assert.deepEqual(normalizeInventoryPagePreferences({ advancedFiltersOpen: true }), {
    advancedFiltersOpen: true,
    inventoryView: "CARDS",
  });
  assert.deepEqual(normalizeInventoryPagePreferences({ inventoryView: "LIST" }), {
    advancedFiltersOpen: false,
    inventoryView: "LIST",
  });
  assert.deepEqual(
    normalizeInventoryPagePreferences({ advancedFiltersOpen: "yes", inventoryView: "list" }),
    DEFAULT_INVENTORY_PAGE_PREFERENCES,
  );
  assert.equal(normalizeInventoryPagePreferences(null), null);
  assert.equal(normalizeInventoryPagePreferences([]), null);
  assert.equal(normalizeInventoryPagePreferences("LIST"), null);
});

test("inventory page preferences ignore malformed and future stored records", () => {
  const storage = new MemoryStorage();
  for (const value of [
    "not-json",
    JSON.stringify({ value: { advancedFiltersOpen: true, inventoryView: "LIST" }, version: 2 }),
    JSON.stringify({ value: null, version: 1 }),
  ]) {
    storage.setItem(INVENTORY_PAGE_PREFERENCES_STORAGE_KEY, value);
    assert.deepEqual(readInventoryPagePreferences({ storage }), DEFAULT_INVENTORY_PAGE_PREFERENCES);
  }
});

test("deterministic inventory preferences neither consume nor update storage", () => {
  const storage = new MemoryStorage();
  writeInventoryPagePreferences(
    { advancedFiltersOpen: true, inventoryView: "LIST" },
    { storage },
  );
  const original = storage.values.get(INVENTORY_PAGE_PREFERENCES_STORAGE_KEY);

  assert.deepEqual(readInventoryPagePreferences({ deterministic: true, storage }), {
    advancedFiltersOpen: false,
    inventoryView: "CARDS",
  });
  assert.equal(
    writeInventoryPagePreferences(
      { advancedFiltersOpen: false, inventoryView: "CARDS" },
      { deterministic: true, storage },
    ),
    false,
  );
  assert.equal(storage.values.get(INVENTORY_PAGE_PREFERENCES_STORAGE_KEY), original);
});
