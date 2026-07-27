import assert from "node:assert/strict";
import test from "node:test";

import {
  SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY,
  readLatestFullBackupExport,
  recordLatestFullBackupExport,
  type SettingsFullBackupActivityStorage,
} from "./settings_full_backup_activity";

class MemoryStorage implements SettingsFullBackupActivityStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("full-backup activity survives a new read from the same local storage", () => {
  const storage = new MemoryStorage();
  const exportedAt = "2026-07-21T12:34:56.000Z";

  assert.equal(readLatestFullBackupExport(storage), null);
  assert.equal(recordLatestFullBackupExport(exportedAt, storage), exportedAt);
  assert.equal(readLatestFullBackupExport(storage), exportedAt);
  assert.match(
    storage.values.get(SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY) ?? "",
    /"version":1/,
  );
});

test("full-backup activity tolerates unavailable and throwing storage", () => {
  const exportedAt = "2026-07-21T12:34:56.000Z";
  const throwingStorage: SettingsFullBackupActivityStorage = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };

  assert.equal(readLatestFullBackupExport(null), null);
  assert.equal(readLatestFullBackupExport(throwingStorage), null);
  assert.equal(recordLatestFullBackupExport(exportedAt, null), exportedAt);
  assert.equal(recordLatestFullBackupExport(exportedAt, throwingStorage), exportedAt);
});

test("full-backup activity ignores malformed, unsupported and invalid stored values", () => {
  const storage = new MemoryStorage();
  const invalidValues = [
    "not-json",
    "null",
    JSON.stringify({ version: 2, exportedAt: "2026-07-21T12:34:56.000Z" }),
    JSON.stringify({ version: 1, exportedAt: "not-a-date" }),
    JSON.stringify({ version: 1, exportedAt: 123 }),
  ];

  for (const value of invalidValues) {
    storage.setItem(SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY, value);
    assert.equal(readLatestFullBackupExport(storage), null);
  }
  assert.equal(recordLatestFullBackupExport("not-a-date", storage), null);
});
