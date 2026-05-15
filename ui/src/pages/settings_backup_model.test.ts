import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsBackupExportSuccessMessage,
  buildSettingsBackupValidationState,
  buildSettingsImportSuccessMessage,
  buildSettingsInventoryExportSuccessMessage,
  type SettingsImportMessageLabels,
} from "./settings_backup_model";
import type { BackupValidationStats, ImportDataStats } from "../lib/tauri_client";

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

function importStats(overrides: Partial<ImportDataStats> = {}): ImportDataStats {
  return {
    created_count: 2,
    detected_format: "INVENTORY_CSV",
    imported_count: 5,
    updated_count: 3,
    ...overrides,
  };
}

const importLabels: SettingsImportMessageLabels = {
  backupImported: "Full backup imported successfully.",
  created: "created",
  importDetectedInventoryCsv: "Inventory CSV",
  importDetectedInventoryJson: "Inventory JSON",
  importSource: "Source",
  inventoryImportDone: "Inventory import completed.",
  librarySyncImportedOnClientHint:
    "This device is now prepared as the next host. Review Library roles and save when ready to take over.",
  rows: "Rows",
  updated: "updated",
};

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

test("settings import success message describes full backup imports", () => {
  assert.equal(
    buildSettingsImportSuccessMessage({
      importedOnClient: false,
      labels: importLabels,
      result: importStats({ detected_format: "FULL_BACKUP", imported_count: 42 }),
    }),
    "Full backup imported successfully. Rows: 42.",
  );

  assert.equal(
    buildSettingsImportSuccessMessage({
      importedOnClient: true,
      labels: importLabels,
      result: importStats({ detected_format: "FULL_BACKUP", imported_count: 42 }),
    }),
    "Full backup imported successfully. Rows: 42. This device is now prepared as the next host. Review Library roles and save when ready to take over.",
  );
});

test("settings backup export success message includes auto validation guidance", () => {
  assert.equal(
    buildSettingsBackupExportSuccessMessage({
      backupExported: "Full backup exported (inventory, history and printers).",
      librarySyncBackupAutoValidated:
        "The exported backup was validated automatically and is ready to use in the guided role-change flow.",
    }),
    "Full backup exported (inventory, history and printers). The exported backup was validated automatically and is ready to use in the guided role-change flow.",
  );
});

test("settings inventory export success message follows the selected format", () => {
  const labels = {
    inventoryCsvExported: "Inventory CSV exported.",
    inventoryJsonExported: "Inventory JSON exported.",
  };

  assert.equal(
    buildSettingsInventoryExportSuccessMessage("csv", labels),
    labels.inventoryCsvExported,
  );
  assert.equal(
    buildSettingsInventoryExportSuccessMessage("json", labels),
    labels.inventoryJsonExported,
  );
});

test("settings import success message describes inventory imports", () => {
  assert.equal(
    buildSettingsImportSuccessMessage({
      importedOnClient: false,
      labels: importLabels,
      result: importStats({
        created_count: 4,
        detected_format: "INVENTORY_CSV",
        imported_count: 6,
        updated_count: 2,
      }),
    }),
    "Inventory import completed. Source: Inventory CSV. Rows: 6 (created 4, updated 2).",
  );

  assert.equal(
    buildSettingsImportSuccessMessage({
      importedOnClient: false,
      labels: importLabels,
      result: importStats({
        created_count: 1,
        detected_format: "INVENTORY_JSON",
        imported_count: 3,
        updated_count: 2,
      }),
    }),
    "Inventory import completed. Source: Inventory JSON. Rows: 3 (created 1, updated 2).",
  );
});
