import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FILAMENT_LABEL_PREFERENCES,
  FILAMENT_LABEL_PREFERENCES_STORAGE_KEY,
  VISUAL_QA_FILAMENT_LABEL_PREFERENCES,
  normalizeFilamentLabelPreferences,
  readFilamentLabelPreferences,
  writeFilamentLabelPreferences,
} from "./filament_label_preferences";
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

test("filament label preferences remember the selected custom dimensions", () => {
  const storage = new MemoryStorage();
  const preferences = {
    selectedSize: "custom",
    customWidthMm: 72.5,
    customHeightMm: 30,
  } as const;

  assert.equal(writeFilamentLabelPreferences(preferences, { storage }), true);
  assert.deepEqual(readFilamentLabelPreferences({ storage }), preferences);
  assert.match(
    storage.values.get(FILAMENT_LABEL_PREFERENCES_STORAGE_KEY) ?? "",
    /"version":1/,
  );
});

test("filament label preferences reject unsafe or unsupported custom dimensions", () => {
  for (const value of [
    null,
    [],
    { selectedSize: "unknown", customWidthMm: 60, customHeightMm: 24 },
    { selectedSize: "custom", customWidthMm: 44.5, customHeightMm: 24 },
    { selectedSize: "custom", customWidthMm: 60.25, customHeightMm: 24 },
    { selectedSize: "custom", customWidthMm: 60, customHeightMm: 40 },
    { selectedSize: "custom", customWidthMm: Number.NaN, customHeightMm: 24 },
  ]) {
    assert.equal(normalizeFilamentLabelPreferences(value), null);
  }

  assert.deepEqual(
    normalizeFilamentLabelPreferences({
      selectedSize: "expanded",
      customWidthMm: 150,
      customHeightMm: 80,
    }),
    { selectedSize: "expanded", customWidthMm: 150, customHeightMm: 80 },
  );
});

test("malformed and future filament label preferences fall back safely", () => {
  const storage = new MemoryStorage();
  for (const value of [
    "not-json",
    JSON.stringify({
      value: { selectedSize: "custom", customWidthMm: 70, customHeightMm: 30 },
      version: 2,
    }),
    JSON.stringify({ value: null, version: 1 }),
  ]) {
    storage.setItem(FILAMENT_LABEL_PREFERENCES_STORAGE_KEY, value);
    assert.deepEqual(
      readFilamentLabelPreferences({ storage }),
      DEFAULT_FILAMENT_LABEL_PREFERENCES,
    );
  }
});

test("visual QA label preferences neither consume nor update local storage", () => {
  const storage = new MemoryStorage();
  writeFilamentLabelPreferences(
    { selectedSize: "expanded", customWidthMm: 80, customHeightMm: 30 },
    { storage },
  );
  const original = storage.values.get(FILAMENT_LABEL_PREFERENCES_STORAGE_KEY);

  assert.deepEqual(
    readFilamentLabelPreferences({ deterministic: true, storage }),
    VISUAL_QA_FILAMENT_LABEL_PREFERENCES,
  );
  assert.equal(
    writeFilamentLabelPreferences(
      { selectedSize: "custom", customWidthMm: 70, customHeightMm: 30 },
      { deterministic: true, storage },
    ),
    false,
  );
  assert.equal(storage.values.get(FILAMENT_LABEL_PREFERENCES_STORAGE_KEY), original);
});
