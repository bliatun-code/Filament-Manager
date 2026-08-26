import assert from "node:assert/strict";
import test from "node:test";

import {
  addHiddenDashboardLowStockProductKey,
  dashboardLowStockPreferencesStorageKey,
  DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES,
  MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS,
  MAX_DASHBOARD_LOW_STOCK_LIBRARY_ID_LENGTH,
  MAX_DASHBOARD_LOW_STOCK_PRODUCT_KEY_LENGTH,
  normalizeDashboardLowStockPreferences,
  readDashboardLowStockPreferences,
  removeHiddenDashboardLowStockProductKey,
  writeDashboardLowStockPreferences,
} from "./dashboard_low_stock_preferences";
import {
  MAX_LOCAL_PREFERENCE_LENGTH,
  type LocalPreferenceStorage,
} from "./local_preference_storage";

class MemoryStorage implements LocalPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("dashboard low-stock preferences round trip without leaking between libraries", () => {
  const storage = new MemoryStorage();

  assert.equal(
    writeDashboardLowStockPreferences(
      { hiddenProductKeys: ["master:alpha"] },
      { libraryId: " library-a ", storage },
    ),
    true,
  );
  assert.equal(
    writeDashboardLowStockPreferences(
      { hiddenProductKeys: ["master:beta"] },
      { libraryId: "library-b", storage },
    ),
    true,
  );

  assert.deepEqual(
    readDashboardLowStockPreferences({ libraryId: "library-a", storage }),
    { hiddenProductKeys: ["master:alpha"] },
  );
  assert.deepEqual(
    readDashboardLowStockPreferences({ libraryId: "library-b", storage }),
    { hiddenProductKeys: ["master:beta"] },
  );
  assert.equal(storage.values.size, 2);
});

test("missing, blank, and oversized library ids fail closed", () => {
  const storage = new MemoryStorage();
  const invalidLibraryIds = [
    undefined,
    null,
    "",
    "   ",
    "x".repeat(MAX_DASHBOARD_LOW_STOCK_LIBRARY_ID_LENGTH + 1),
  ];

  for (const libraryId of invalidLibraryIds) {
    assert.deepEqual(
      readDashboardLowStockPreferences({ libraryId, storage }),
      DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES,
    );
    assert.equal(
      writeDashboardLowStockPreferences(
        { hiddenProductKeys: ["master:must-not-persist"] },
        { libraryId, storage },
      ),
      false,
    );
    assert.equal(dashboardLowStockPreferencesStorageKey(libraryId), null);
  }
  assert.equal(storage.values.size, 0);
});

test("normalization trims, deduplicates, and filters invalid product keys", () => {
  assert.deepEqual(
    normalizeDashboardLowStockPreferences({
      hiddenProductKeys: [
        " master:alpha ",
        "master:alpha",
        "",
        "   ",
        null,
        42,
        "x".repeat(MAX_DASHBOARD_LOW_STOCK_PRODUCT_KEY_LENGTH + 1),
        "product:VENDOR\u001fPLA\u001fBASIC\u001fBLUE",
      ],
    }),
    {
      hiddenProductKeys: [
        "master:alpha",
        "product:VENDOR\u001fPLA\u001fBASIC\u001fBLUE",
      ],
    },
  );
  assert.equal(normalizeDashboardLowStockPreferences(null), null);
  assert.equal(normalizeDashboardLowStockPreferences([]), null);
  assert.equal(normalizeDashboardLowStockPreferences({}), null);
  assert.equal(
    normalizeDashboardLowStockPreferences({ hiddenProductKeys: "master:alpha" }),
    null,
  );
});

test("normalization bounds entry count and serialized envelope length", () => {
  const manyKeys = Array.from(
    { length: MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS + 40 },
    (_, index) => `master:${index}`,
  );
  const bounded = normalizeDashboardLowStockPreferences({
    hiddenProductKeys: manyKeys,
  });
  assert.ok(bounded);
  assert.equal(
    bounded.hiddenProductKeys.length,
    MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS,
  );

  const escapedKeys = Array.from(
    { length: MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS },
    (_, index) => `${index}:${"\\\"".repeat(250)}`,
  );
  const storage = new MemoryStorage();
  assert.equal(
    writeDashboardLowStockPreferences(
      { hiddenProductKeys: escapedKeys },
      { libraryId: "library-envelope", storage },
    ),
    true,
  );
  const key = dashboardLowStockPreferencesStorageKey("library-envelope");
  assert.ok(key);
  const serialized = storage.values.get(key);
  assert.ok(serialized);
  assert.ok(serialized.length <= MAX_LOCAL_PREFERENCE_LENGTH);
  assert.ok(
    readDashboardLowStockPreferences({
      libraryId: "library-envelope",
      storage,
    }).hiddenProductKeys.length < escapedKeys.length,
  );
});

test("reads reject wrong versions, malformed records, and oversized storage values", () => {
  const storage = new MemoryStorage();
  const key = dashboardLowStockPreferencesStorageKey("library-corrupt");
  assert.ok(key);
  const invalidValues = [
    "not-json",
    "null",
    "[]",
    JSON.stringify({
      value: { hiddenProductKeys: ["master:alpha"] },
      version: 2,
    }),
    JSON.stringify({ value: null, version: 1 }),
    JSON.stringify({ value: { hiddenProductKeys: "master:alpha" }, version: 1 }),
    "x".repeat(MAX_LOCAL_PREFERENCE_LENGTH + 1),
  ];

  for (const value of invalidValues) {
    storage.setItem(key, value);
    assert.deepEqual(
      readDashboardLowStockPreferences({
        libraryId: "library-corrupt",
        storage,
      }),
      DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES,
    );
  }
});

test("unavailable storage and deterministic mode bypass reads and writes", () => {
  const throwingStorage: LocalPreferenceStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(
    readDashboardLowStockPreferences({
      libraryId: "library-a",
      storage: throwingStorage,
    }),
    DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES,
  );
  assert.equal(
    writeDashboardLowStockPreferences(
      { hiddenProductKeys: ["master:alpha"] },
      { libraryId: "library-a", storage: throwingStorage },
    ),
    false,
  );

  const storage = new MemoryStorage();
  writeDashboardLowStockPreferences(
    { hiddenProductKeys: ["master:stored"] },
    { libraryId: "library-a", storage },
  );
  const key = dashboardLowStockPreferencesStorageKey("library-a");
  assert.ok(key);
  const original = storage.values.get(key);
  assert.deepEqual(
    readDashboardLowStockPreferences({
      deterministic: true,
      libraryId: "library-a",
      storage,
    }),
    DEFAULT_DASHBOARD_LOW_STOCK_PREFERENCES,
  );
  assert.equal(
    writeDashboardLowStockPreferences(
      { hiddenProductKeys: ["master:replacement"] },
      { deterministic: true, libraryId: "library-a", storage },
    ),
    false,
  );
  assert.equal(storage.values.get(key), original);
});

test("pure helpers add and restore normalized product keys", () => {
  const added = addHiddenDashboardLowStockProductKey(
    { hiddenProductKeys: ["master:alpha"] },
    " master:beta ",
  );
  assert.deepEqual(added, {
    hiddenProductKeys: ["master:alpha", "master:beta"],
  });
  assert.deepEqual(addHiddenDashboardLowStockProductKey(added, "master:beta"), added);
  assert.deepEqual(
    removeHiddenDashboardLowStockProductKey(added, " master:alpha "),
    { hiddenProductKeys: ["master:beta"] },
  );
  assert.deepEqual(removeHiddenDashboardLowStockProductKey(added, " "), added);
});

test("adding at the preference limit keeps the newly hidden product", () => {
  const full = {
    hiddenProductKeys: Array.from(
      { length: MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS },
      (_, index) => `master:${index}`,
    ),
  };

  const added = addHiddenDashboardLowStockProductKey(full, "master:newest");

  assert.equal(
    added.hiddenProductKeys.length,
    MAX_DASHBOARD_LOW_STOCK_HIDDEN_PRODUCT_KEYS,
  );
  assert.equal(added.hiddenProductKeys.includes("master:0"), false);
  assert.equal(added.hiddenProductKeys.at(-1), "master:newest");
});
