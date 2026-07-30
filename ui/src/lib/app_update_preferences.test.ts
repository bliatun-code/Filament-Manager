import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_UPDATE_CHECK_INTERVAL_MS,
  APP_UPDATE_DISMISS_DURATION_MS,
  APP_UPDATE_PREFERENCES_STORAGE_KEY,
  APP_UPDATE_STARTUP_DELAY_MS,
  DEFAULT_APP_UPDATE_PREFERENCES,
  dismissAppUpdateVersion,
  isAutomaticAppUpdateCheckDue,
  normalizeAppUpdatePreferences,
  readAppUpdatePreferences,
  recordAutomaticAppUpdateCheckAttempt,
  setAutomaticAppUpdateChecksEnabled,
  shouldShowAppUpdateNotification,
  writeAppUpdatePreferences,
} from "./app_update_preferences";
import type { LocalPreferenceStorage } from "./local_preference_storage";
import type { AppUpdateCheckResult } from "./tauri_maintenance_client";

class MemoryStorage implements LocalPreferenceStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function updateResult(
  status: AppUpdateCheckResult["status"] = "UPDATE_AVAILABLE",
  latestVersion: string | null = "0.23.0",
): AppUpdateCheckResult {
  return {
    current_version: "0.22.0",
    latest_tag: latestVersion ? `v${latestVersion}` : null,
    latest_version: latestVersion,
    release_url: "https://github.com/example/releases/latest",
    status,
    update_channel:
      status === "UPDATE_CHANNEL_DISABLED" ? "DISABLED" : "PUBLIC_METADATA",
  };
}

test("automatic update checks default on with stable schedule constants", () => {
  assert.deepEqual(DEFAULT_APP_UPDATE_PREFERENCES, {
    automaticChecksEnabled: true,
    dismissedUntil: null,
    dismissedVersion: null,
    lastAutomaticCheckAt: null,
  });
  assert.equal(APP_UPDATE_STARTUP_DELAY_MS, 10_000);
  assert.equal(APP_UPDATE_CHECK_INTERVAL_MS, 24 * 60 * 60 * 1_000);
  assert.equal(APP_UPDATE_DISMISS_DURATION_MS, 7 * 24 * 60 * 60 * 1_000);
});

test("update preferences round trip every persisted field in a versioned record", () => {
  const storage = new MemoryStorage();
  const preferences = {
    automaticChecksEnabled: false,
    dismissedUntil: 1_800_000,
    dismissedVersion: "0.23.0",
    lastAutomaticCheckAt: 900_000,
  };

  assert.equal(writeAppUpdatePreferences(preferences, { storage }), true);
  assert.deepEqual(readAppUpdatePreferences({ storage }), preferences);
  const stored = storage.values.get(APP_UPDATE_PREFERENCES_STORAGE_KEY) ?? "";
  assert.match(stored, /"version":1/);
  assert.match(stored, /"lastAutomaticCheckAt":900000/);
  assert.match(stored, /"dismissedVersion":"0\.23\.0"/);
  assert.match(stored, /"dismissedUntil":1800000/);
});

test("preference normalization sanitizes fields and preserves no half-dismissal", () => {
  assert.deepEqual(
    normalizeAppUpdatePreferences({
      automaticChecksEnabled: "yes",
      dismissedUntil: 1_800_000,
      dismissedVersion: "   ",
      lastAutomaticCheckAt: Number.POSITIVE_INFINITY,
    }),
    DEFAULT_APP_UPDATE_PREFERENCES,
  );
  assert.deepEqual(
    normalizeAppUpdatePreferences({
      automaticChecksEnabled: false,
      dismissedUntil: 1_800_000,
      dismissedVersion: " 0.23.0 ",
      lastAutomaticCheckAt: 900_000,
    }),
    {
      automaticChecksEnabled: false,
      dismissedUntil: 1_800_000,
      dismissedVersion: "0.23.0",
      lastAutomaticCheckAt: 900_000,
    },
  );
  assert.deepEqual(
    normalizeAppUpdatePreferences({
      dismissedVersion: "0.23.0",
      lastAutomaticCheckAt: -1,
    }),
    DEFAULT_APP_UPDATE_PREFERENCES,
  );
  assert.equal(normalizeAppUpdatePreferences(null), null);
  assert.equal(normalizeAppUpdatePreferences([]), null);
  assert.equal(normalizeAppUpdatePreferences("enabled"), null);
});

test("malformed and future preference records fall back safely", () => {
  const storage = new MemoryStorage();
  for (const value of [
    "not-json",
    JSON.stringify({
      value: {
        automaticChecksEnabled: false,
        dismissedUntil: 1_800_000,
        dismissedVersion: "0.23.0",
        lastAutomaticCheckAt: 900_000,
      },
      version: 2,
    }),
    JSON.stringify({ value: null, version: 1 }),
  ]) {
    storage.setItem(APP_UPDATE_PREFERENCES_STORAGE_KEY, value);
    assert.deepEqual(
      readAppUpdatePreferences({ storage }),
      DEFAULT_APP_UPDATE_PREFERENCES,
    );
  }
});

test("automatic checks become due after 24 hours and recover from clock rollback", () => {
  const checkedAt = 1_000_000;
  const checked = {
    ...DEFAULT_APP_UPDATE_PREFERENCES,
    lastAutomaticCheckAt: checkedAt,
  };

  assert.equal(
    isAutomaticAppUpdateCheckDue(DEFAULT_APP_UPDATE_PREFERENCES, checkedAt),
    true,
  );
  assert.equal(
    isAutomaticAppUpdateCheckDue(checked, checkedAt + APP_UPDATE_CHECK_INTERVAL_MS - 1),
    false,
  );
  assert.equal(
    isAutomaticAppUpdateCheckDue(checked, checkedAt + APP_UPDATE_CHECK_INTERVAL_MS),
    true,
  );
  assert.equal(isAutomaticAppUpdateCheckDue(checked, checkedAt - 1), true);
  assert.equal(
    isAutomaticAppUpdateCheckDue(
      { ...checked, automaticChecksEnabled: false },
      checkedAt + APP_UPDATE_CHECK_INTERVAL_MS,
    ),
    false,
  );
  assert.equal(isAutomaticAppUpdateCheckDue(checked, Number.NaN), false);
});

test("attempt and toggle transitions preserve unrelated preferences", () => {
  const dismissed = {
    automaticChecksEnabled: true,
    dismissedUntil: 2_000_000,
    dismissedVersion: "0.23.0",
    lastAutomaticCheckAt: null,
  };

  const recorded = recordAutomaticAppUpdateCheckAttempt(dismissed, 1_000_000);
  assert.deepEqual(recorded, {
    ...dismissed,
    lastAutomaticCheckAt: 1_000_000,
  });
  assert.deepEqual(setAutomaticAppUpdateChecksEnabled(recorded, false), {
    ...recorded,
    automaticChecksEnabled: false,
  });
  assert.deepEqual(
    recordAutomaticAppUpdateCheckAttempt(recorded, Number.NaN),
    recorded,
  );
});

test("Later suppresses only the matching version for seven days", () => {
  const dismissedAt = 1_000_000;
  const preferences = dismissAppUpdateVersion(
    DEFAULT_APP_UPDATE_PREFERENCES,
    " 0.23.0 ",
    dismissedAt,
  );

  assert.deepEqual(preferences, {
    ...DEFAULT_APP_UPDATE_PREFERENCES,
    dismissedUntil: dismissedAt + APP_UPDATE_DISMISS_DURATION_MS,
    dismissedVersion: "0.23.0",
  });
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult(),
      preferences,
      dismissedAt + APP_UPDATE_DISMISS_DURATION_MS - 1,
    ),
    false,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult(),
      preferences,
      dismissedAt + APP_UPDATE_DISMISS_DURATION_MS,
    ),
    true,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult("UPDATE_AVAILABLE", "0.24.0"),
      preferences,
      dismissedAt + 1,
    ),
    true,
  );
});

test("notification visibility requires a valid UPDATE_AVAILABLE result", () => {
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult(),
      DEFAULT_APP_UPDATE_PREFERENCES,
      1_000_000,
    ),
    true,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult("UP_TO_DATE"),
      DEFAULT_APP_UPDATE_PREFERENCES,
      1_000_000,
    ),
    false,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult("UPDATE_AVAILABLE", null),
      DEFAULT_APP_UPDATE_PREFERENCES,
      1_000_000,
    ),
    false,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      null,
      DEFAULT_APP_UPDATE_PREFERENCES,
      1_000_000,
    ),
    false,
  );
  assert.equal(
    shouldShowAppUpdateNotification(
      updateResult(),
      DEFAULT_APP_UPDATE_PREFERENCES,
      Number.NaN,
    ),
    false,
  );
});
