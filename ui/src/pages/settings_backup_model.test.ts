import assert from "node:assert/strict";
import test from "node:test";
import { buildSettingsBackupValidationState } from "./settings_backup_model";
import type { BackupValidationStats } from "../lib/tauri_client";

function backupValidation(overrides: Partial<BackupValidationStats> = {}): BackupValidationStats {
  return {
    checked_at: "2026-05-15T10:00:00Z",
    expected_tables: ["spools", "printers"],
    extra_tables: [],
    format: "FULL_BACKUP",
    missing_tables: [],
    present_tables: ["spools", "printers"],
    table_counts: { printers: 1, spools: 12 },
    ...overrides,
  };
}

test("settings backup validation state reports warnings and full backup format", () => {
  assert.deepEqual(
    buildSettingsBackupValidationState({
      lastBackupValidation: backupValidation({
        extra_tables: ["scratch"],
        missing_tables: ["printers"],
      }),
      lastFullBackupExportedAt: null,
      lastFullBackupValidatedAt: null,
    }),
    {
      hasExtraTables: true,
      hasMissingTables: true,
      hasValidatedFullBackup: true,
      hasValidatedLatestFullBackup: true,
      hasWarnings: true,
    },
  );

  assert.deepEqual(
    buildSettingsBackupValidationState({
      lastBackupValidation: backupValidation({ format: "INVENTORY_EXPORT" }),
      lastFullBackupExportedAt: null,
      lastFullBackupValidatedAt: null,
    }),
    {
      hasExtraTables: false,
      hasMissingTables: false,
      hasValidatedFullBackup: false,
      hasValidatedLatestFullBackup: false,
      hasWarnings: false,
    },
  );
});

test("settings backup validation state requires validation after latest export", () => {
  assert.equal(
    buildSettingsBackupValidationState({
      lastBackupValidation: backupValidation(),
      lastFullBackupExportedAt: "2026-05-15T10:00:00Z",
      lastFullBackupValidatedAt: "2026-05-15T10:01:00Z",
    }).hasValidatedLatestFullBackup,
    true,
  );
  assert.equal(
    buildSettingsBackupValidationState({
      lastBackupValidation: backupValidation(),
      lastFullBackupExportedAt: "2026-05-15T10:00:00Z",
      lastFullBackupValidatedAt: "2026-05-15T09:59:00Z",
    }).hasValidatedLatestFullBackup,
    false,
  );
  assert.equal(
    buildSettingsBackupValidationState({
      lastBackupValidation: backupValidation(),
      lastFullBackupExportedAt: "not-a-date",
      lastFullBackupValidatedAt: "2026-05-15T10:01:00Z",
    }).hasValidatedLatestFullBackup,
    false,
  );
});
