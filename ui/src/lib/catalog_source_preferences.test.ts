import assert from "node:assert/strict";
import test from "node:test";
import type { LocalPreferenceStorage } from "./local_preference_storage";
import {
  catalogSourcePreferencesStorageKey,
  emptyCatalogSourcePreferences,
  normalizeCatalogSourcePreferences,
  readCatalogSourcePreferences,
  replaceCatalogSourceMaterials,
  writeCatalogSourcePreferences,
} from "./catalog_source_preferences";

class MemoryStorage implements LocalPreferenceStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("catalog source preferences keep successful discoveries isolated by library", () => {
  const storage = new MemoryStorage();
  const preferences = replaceCatalogSourceMaterials(
    emptyCatalogSourcePreferences(),
    "Bambu",
    ["PLA", "PETG", "PLA"],
  );

  assert.equal(
    writeCatalogSourcePreferences(preferences, { cacheScope: "library-a", storage }),
    true,
  );
  assert.deepEqual(
    readCatalogSourcePreferences({ cacheScope: "library-a", storage }),
    { Bambu: ["PETG", "PLA"], eSUN: [] },
  );
  assert.deepEqual(
    readCatalogSourcePreferences({ cacheScope: "library-b", storage }),
    emptyCatalogSourcePreferences(),
  );
});

test("catalog source preferences normalize material names defensively", () => {
  assert.deepEqual(
    normalizeCatalogSourcePreferences({
      Bambu: [" PLA ", "pla", "PETG", 123],
      eSUN: ["TPU", " ABS "],
    }),
    { Bambu: ["PETG", "PLA"], eSUN: ["ABS", "TPU"] },
  );
  assert.equal(normalizeCatalogSourcePreferences({ Bambu: [] }), null);
  assert.equal(normalizeCatalogSourcePreferences(null), null);
});

test("catalog source preferences require a bounded cache scope", () => {
  assert.equal(catalogSourcePreferencesStorageKey(null), null);
  assert.equal(catalogSourcePreferencesStorageKey("  "), null);
  assert.equal(
    catalogSourcePreferencesStorageKey("local"),
    "filament-manager:catalog-source-materials:local",
  );
});
