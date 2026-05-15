import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibraryRoleChangeState,
  buildLibrarySyncMigrationModel,
  shouldShowLibraryWebappDetails,
} from "./settings_library_sync_model";

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

test("buildLibraryRoleChangeState requires export and validation when leaving local host data", () => {
  const pending = buildLibraryRoleChangeState({
    target: "CLIENT",
    savedMode: "HOST",
    hasExportedFullBackup: false,
    hasImportedFullBackup: false,
    hasValidatedFullBackup: false,
    hasValidatedLatestFullBackup: false,
  });

  assert.equal(pending.requiresExport, true);
  assert.equal(pending.requiresValidate, true);
  assert.equal(pending.ready, false);

  const ready = buildLibraryRoleChangeState({
    target: "CLIENT",
    savedMode: "HOST",
    hasExportedFullBackup: true,
    hasImportedFullBackup: false,
    hasValidatedFullBackup: true,
    hasValidatedLatestFullBackup: false,
  });

  assert.equal(ready.validateDone, true);
  assert.equal(ready.ready, true);
});

test("buildLibraryRoleChangeState lets clients leave host mode without local export gate", () => {
  const state = buildLibraryRoleChangeState({
    target: "STANDALONE",
    savedMode: "CLIENT",
    hasExportedFullBackup: false,
    hasImportedFullBackup: false,
    hasValidatedFullBackup: false,
    hasValidatedLatestFullBackup: false,
  });

  assert.equal(state.fromClient, true);
  assert.equal(state.toStandalone, true);
  assert.equal(state.requiresExport, false);
  assert.equal(state.ready, true);
});

test("shouldShowLibraryWebappDetails keeps webapp details visible for active contexts", () => {
  const base = {
    draftMode: "STANDALONE" as const,
    trustedLanEnabledDraft: false,
    trustedLanStatusEnabled: false,
    showTrustedLanNetworkEditor: false,
    hasTrustedLanPairingLink: false,
    pairedBrowserCount: 0,
  };

  assert.equal(shouldShowLibraryWebappDetails(base), false);
  assert.equal(shouldShowLibraryWebappDetails({ ...base, draftMode: "HOST" }), true);
  assert.equal(shouldShowLibraryWebappDetails({ ...base, trustedLanEnabledDraft: true }), true);
  assert.equal(shouldShowLibraryWebappDetails({ ...base, trustedLanStatusEnabled: true }), true);
  assert.equal(
    shouldShowLibraryWebappDetails({ ...base, showTrustedLanNetworkEditor: true }),
    true,
  );
  assert.equal(shouldShowLibraryWebappDetails({ ...base, hasTrustedLanPairingLink: true }), true);
  assert.equal(shouldShowLibraryWebappDetails({ ...base, pairedBrowserCount: 1 }), true);
});
