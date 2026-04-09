import assert from "node:assert/strict";
import test from "node:test";

import { buildLibrarySyncMigrationModel } from "./settings_library_sync_model";

test("buildLibrarySyncMigrationModel reports stable host handoff steps for an active host", () => {
  const model = buildLibrarySyncMigrationModel({
    draftMode: "HOST",
    savedMode: "HOST",
    hostReadyForClients: true,
    hasValidatedFullBackup: false,
    hasExportedFullBackup: true,
    hasImportedFullBackup: false,
  });

  assert.equal(model.kind, "host");
  assert.equal(model.showSaveAction, false);
  assert.deepEqual(model.steps, [
    { id: "host_access", done: true },
    { id: "export", done: true },
  ]);
});

test("buildLibrarySyncMigrationModel keeps client handoff prep focused on validate and import", () => {
  const model = buildLibrarySyncMigrationModel({
    draftMode: "CLIENT",
    savedMode: "CLIENT",
    hostReadyForClients: false,
    hasValidatedFullBackup: true,
    hasExportedFullBackup: false,
    hasImportedFullBackup: false,
  });

  assert.equal(model.kind, "client");
  assert.equal(model.showSaveAction, false);
  assert.deepEqual(model.steps, [
    { id: "validate", done: true },
    { id: "import", done: false },
  ]);
});

test("buildLibrarySyncMigrationModel switches to takeover mode when a client prepares host role", () => {
  const model = buildLibrarySyncMigrationModel({
    draftMode: "HOST",
    savedMode: "CLIENT",
    hostReadyForClients: false,
    hasValidatedFullBackup: true,
    hasExportedFullBackup: false,
    hasImportedFullBackup: true,
  });

  assert.equal(model.kind, "takeover");
  assert.equal(model.showSaveAction, true);
  assert.deepEqual(model.steps, [
    { id: "validate", done: true },
    { id: "import", done: true },
    { id: "save", done: false },
  ]);
});
