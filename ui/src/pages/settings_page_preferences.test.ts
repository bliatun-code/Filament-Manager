import assert from "node:assert/strict";
import test from "node:test";

import type { LocalPreferenceStorage } from "../lib/local_preference_storage";
import { SETTINGS_PAGE_TAB_ORDER } from "./settings_page_model";
import {
  DEFAULT_SETTINGS_PAGE_PREFERENCES,
  SETTINGS_PAGE_PREFERENCES_STORAGE_KEY,
  normalizeSettingsPagePreferences,
  readSettingsPagePreferences,
  resolveSettingsActiveTab,
  writeSettingsPagePreferences,
} from "./settings_page_preferences";

class MemoryStorage implements LocalPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("settings page preferences accept every current tab and persist a version", () => {
  const storage = new MemoryStorage();

  for (const activeTab of SETTINGS_PAGE_TAB_ORDER) {
    assert.deepEqual(normalizeSettingsPagePreferences({ activeTab }), { activeTab });
    assert.equal(writeSettingsPagePreferences({ activeTab }, { storage }), true);
    assert.deepEqual(readSettingsPagePreferences({ storage }), { activeTab });
  }
  assert.match(storage.values.get(SETTINGS_PAGE_PREFERENCES_STORAGE_KEY) ?? "", /"version":1/);
});

test("settings page preferences reject malformed and unknown tabs", () => {
  assert.equal(normalizeSettingsPagePreferences(null), null);
  assert.equal(normalizeSettingsPagePreferences([]), null);
  assert.equal(normalizeSettingsPagePreferences({ activeTab: "library" }), null);
  assert.equal(normalizeSettingsPagePreferences({ activeTab: "UNKNOWN" }), null);
  assert.equal(normalizeSettingsPagePreferences({}), null);

  const storage = new MemoryStorage();
  for (const value of [
    "not-json",
    JSON.stringify({ value: { activeTab: "LIBRARY" }, version: 2 }),
    JSON.stringify({ value: { activeTab: "UNKNOWN" }, version: 1 }),
  ]) {
    storage.setItem(SETTINGS_PAGE_PREFERENCES_STORAGE_KEY, value);
    assert.deepEqual(readSettingsPagePreferences({ storage }), DEFAULT_SETTINGS_PAGE_PREFERENCES);
  }
});

test("explicit Settings navigation wins over storage and stored tabs win over General", () => {
  const storage = new MemoryStorage();
  writeSettingsPagePreferences({ activeTab: "CATALOG" }, { storage });

  assert.equal(resolveSettingsActiveTab("LIBRARY", { storage }), "LIBRARY");
  assert.equal(resolveSettingsActiveTab(null, { storage }), "CATALOG");
});

test("deterministic Settings navigation ignores and does not modify storage", () => {
  const storage = new MemoryStorage();
  writeSettingsPagePreferences({ activeTab: "MAINTENANCE" }, { storage });
  const original = storage.values.get(SETTINGS_PAGE_PREFERENCES_STORAGE_KEY);

  assert.equal(resolveSettingsActiveTab("PRINTERS", { deterministic: true, storage }), "PRINTERS");
  assert.equal(resolveSettingsActiveTab(null, { deterministic: true, storage }), "GENERAL");
  assert.equal(
    writeSettingsPagePreferences(
      { activeTab: "GENERAL" },
      { deterministic: true, storage },
    ),
    false,
  );
  assert.equal(storage.values.get(SETTINGS_PAGE_PREFERENCES_STORAGE_KEY), original);
});
