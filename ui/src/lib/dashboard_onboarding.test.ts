import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDashboardOnboardingState,
  DASHBOARD_ONBOARDING_STORAGE_KEY,
  dismissDashboardOnboarding,
  groupDashboardOnboardingTasks,
  readDashboardOnboardingDismissed,
  type DashboardOnboardingStorage,
} from "./dashboard_onboarding";

class MemoryStorage implements DashboardOnboardingStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("dashboard onboarding keeps task order and optional markers stable", () => {
  const result = buildDashboardOnboardingState({
    backupComplete: false,
    companionComplete: true,
    inventoryComplete: true,
    printerComplete: false,
  });

  assert.deepEqual(result.tasks.map((task) => task.id), [
    "INVENTORY",
    "PRINTER",
    "COMPANION",
    "BACKUP",
  ]);
  assert.deepEqual(result.tasks.map((task) => task.optional), [false, true, true, false]);
  assert.equal(result.completedCount, 2);
  assert.equal(result.totalCount, 4);
});

test("dashboard onboarding groups required, optional and completed tasks from live state", () => {
  const groups = groupDashboardOnboardingTasks(
    buildDashboardOnboardingState({
      backupComplete: false,
      companionComplete: true,
      inventoryComplete: true,
      printerComplete: false,
    }),
  );

  assert.deepEqual(
    groups.pendingRequired.map((task) => task.id),
    ["BACKUP"],
  );
  assert.deepEqual(
    groups.pendingOptional.map((task) => task.id),
    ["PRINTER"],
  );
  assert.deepEqual(
    groups.completed.map((task) => task.id),
    ["INVENTORY", "COMPANION"],
  );
  assert.equal(groups.requiredCompletedCount, 1);
  assert.equal(groups.requiredTotalCount, 2);
});

test("dashboard onboarding dismissal is versioned and validates timestamps", () => {
  const storage = new MemoryStorage();
  assert.equal(readDashboardOnboardingDismissed(storage), false);
  assert.equal(
    dismissDashboardOnboarding("2026-07-22T10:00:00Z", storage),
    true,
  );
  assert.equal(readDashboardOnboardingDismissed(storage), true);

  storage.values.set(
    DASHBOARD_ONBOARDING_STORAGE_KEY,
    JSON.stringify({ version: 2, dismissedAt: "2026-07-22T10:00:00Z" }),
  );
  assert.equal(readDashboardOnboardingDismissed(storage), false);
  storage.values.set(
    DASHBOARD_ONBOARDING_STORAGE_KEY,
    JSON.stringify({ version: 1, dismissedAt: "not-a-date" }),
  );
  assert.equal(readDashboardOnboardingDismissed(storage), false);
});

test("dashboard onboarding persistence failures never block session dismissal", () => {
  const throwingStorage: DashboardOnboardingStorage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(readDashboardOnboardingDismissed(throwingStorage), false);
  assert.equal(dismissDashboardOnboarding("2026-07-22T10:00:00Z", throwingStorage), true);
});
