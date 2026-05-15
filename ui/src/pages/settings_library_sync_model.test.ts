import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibrarySyncActionMessage,
  buildLibrarySyncPairingMessage,
  buildLibrarySyncPairingSettingsInput,
  buildLibrarySyncSaveSettingsInput,
  buildLibrarySyncClientState,
  buildLibraryRoleChangeState,
  buildLibrarySyncMigrationModel,
  buildLibrarySyncVisibilityState,
  normalizeLibrarySyncMode,
  shouldShowLibraryWebappDetails,
} from "./settings_library_sync_model";
import type { LibrarySyncSettings } from "../lib/tauri_client";

function librarySettings(overrides: Partial<LibrarySyncSettings> = {}): LibrarySyncSettings {
  return {
    mode: "CLIENT",
    device_name: "Desk",
    library_id: "library-1",
    host_base_url: "http://host.local",
    host_device_name: "Host",
    client_auth_paired: true,
    client_auth_paired_at: "2026-01-01T00:00:00Z",
    client_auth_expires_at: "2026-02-01T00:00:00Z",
    ...overrides,
  };
}

test("normalizeLibrarySyncMode falls back for unknown persisted values", () => {
  assert.equal(normalizeLibrarySyncMode("HOST"), "HOST");
  assert.equal(normalizeLibrarySyncMode("CLIENT"), "CLIENT");
  assert.equal(normalizeLibrarySyncMode("STANDALONE"), "STANDALONE");
  assert.equal(normalizeLibrarySyncMode("legacy"), "STANDALONE");
  assert.equal(normalizeLibrarySyncMode(null), "STANDALONE");
});

test("buildLibrarySyncActionMessage returns stable action feedback copy", () => {
  const labels = {
    clientAuthCleared: "Desktop client pairing was removed from this device.",
    clientPaired: "Desktop client paired successfully and is now using the detected host.",
    hostCheckPassed: "Host check passed.",
    renewPairing: "Saved pairing was cleared. Paste a fresh pairing link from the host to continue.",
    settingsSaved: "Library role settings saved.",
    snapshotRefreshed: "Host snapshot refreshed.",
  };

  assert.equal(buildLibrarySyncActionMessage("settingsSaved", labels), labels.settingsSaved);
  assert.equal(buildLibrarySyncActionMessage("hostCheckPassed", labels), labels.hostCheckPassed);
  assert.equal(buildLibrarySyncActionMessage("clientPaired", labels), labels.clientPaired);
  assert.equal(
    buildLibrarySyncActionMessage("clientAuthCleared", labels),
    labels.clientAuthCleared,
  );
  assert.equal(buildLibrarySyncActionMessage("renewPairing", labels), labels.renewPairing);
  assert.equal(
    buildLibrarySyncActionMessage("snapshotRefreshed", labels),
    labels.snapshotRefreshed,
  );
});

test("buildLibrarySyncPairingMessage returns stable pairing feedback copy", () => {
  const labels = {
    pairHostFailed: "Failed to pair this desktop client with the host.",
    pairingInvalid: "Invalid pairing link. Create a new pairing link on the host and try again.",
    pairingLinkRequired:
      "Paste the full pairing link from the host so the client can detect the host automatically.",
  };

  assert.equal(
    buildLibrarySyncPairingMessage("pairingLinkRequired", labels),
    labels.pairingLinkRequired,
  );
  assert.equal(buildLibrarySyncPairingMessage("pairingInvalid", labels), labels.pairingInvalid);
  assert.equal(buildLibrarySyncPairingMessage("pairHostFailed", labels), labels.pairHostFailed);
});

test("buildLibrarySyncClientState derives client write and repair state", () => {
  assert.deepEqual(
    buildLibrarySyncClientState({
      mode: "CLIENT",
      hostBaseUrl: "http://host.local",
      libraryId: "library-1",
      clientAuthPaired: true,
      pairingChecked: true,
      pairingValid: false,
    }),
    {
      savedMode: "CLIENT",
      readOnly: true,
      hostBaseUrl: "http://host.local",
      libraryId: "library-1",
      hostWritePaired: true,
      hostNeedsRepair: true,
      hostPairingValid: false,
    },
  );

  assert.deepEqual(
    buildLibrarySyncClientState({
      mode: "HOST",
      hostBaseUrl: undefined,
      libraryId: undefined,
      clientAuthPaired: false,
      pairingChecked: true,
      pairingValid: false,
    }),
    {
      savedMode: "HOST",
      readOnly: false,
      hostBaseUrl: null,
      libraryId: null,
      hostWritePaired: false,
      hostNeedsRepair: false,
      hostPairingValid: true,
    },
  );
});

test("buildLibrarySyncSaveSettingsInput preserves client auth only for client mode", () => {
  assert.deepEqual(
    buildLibrarySyncSaveSettingsInput({
      current: librarySettings(),
      targetMode: "CLIENT",
      deviceName: "Client Desk",
      hostBaseUrlDraft: "http://new-host.local",
    }),
    {
      mode: "CLIENT",
      device_name: "Client Desk",
      library_id: "library-1",
      host_base_url: "http://new-host.local",
      host_device_name: "Host",
      client_auth_paired: true,
      client_auth_paired_at: "2026-01-01T00:00:00Z",
      client_auth_expires_at: "2026-02-01T00:00:00Z",
    },
  );

  assert.deepEqual(
    buildLibrarySyncSaveSettingsInput({
      current: librarySettings(),
      targetMode: "HOST",
      deviceName: "Host Desk",
      hostBaseUrlDraft: "http://ignored.local",
    }),
    {
      mode: "HOST",
      device_name: "Host Desk",
      library_id: "library-1",
      host_base_url: null,
      host_device_name: null,
      client_auth_paired: false,
      client_auth_paired_at: null,
      client_auth_expires_at: null,
    },
  );
});

test("buildLibrarySyncPairingSettingsInput creates unpaired client handoff settings", () => {
  assert.deepEqual(
    buildLibrarySyncPairingSettingsInput({
      deviceName: "Client Desk",
      libraryId: "library-2",
      hostBaseUrl: "http://host.local",
      hostDeviceName: undefined,
    }),
    {
      mode: "CLIENT",
      device_name: "Client Desk",
      library_id: "library-2",
      host_base_url: "http://host.local",
      host_device_name: null,
      client_auth_paired: false,
      client_auth_paired_at: null,
      client_auth_expires_at: null,
    },
  );
});

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

test("buildLibrarySyncVisibilityState groups library settings presentation flags", () => {
  const base = {
    draftMode: "STANDALONE" as const,
    trustedLanEnabledDraft: false,
    trustedLanStatusEnabled: false,
    showTrustedLanNetworkEditor: false,
    hasTrustedLanPairingLink: false,
    pairedBrowserCount: 0,
    lastCheckedAt: null,
    lastReachableAt: null,
    lastValidationMessage: null,
    hasSnapshot: false,
  };

  assert.deepEqual(buildLibrarySyncVisibilityState(base), {
    showDeviceFields: false,
    showWebappDetails: false,
    standaloneWebappEnabled: false,
    clientHasStatusDetails: false,
    clientHasSnapshot: false,
  });

  assert.deepEqual(
    buildLibrarySyncVisibilityState({
      ...base,
      draftMode: "HOST",
      trustedLanStatusEnabled: true,
      lastValidationMessage: "Host unreachable",
      hasSnapshot: true,
    }),
    {
      showDeviceFields: true,
      showWebappDetails: true,
      standaloneWebappEnabled: false,
      clientHasStatusDetails: true,
      clientHasSnapshot: true,
    },
  );

  assert.equal(
    buildLibrarySyncVisibilityState({ ...base, trustedLanEnabledDraft: true })
      .standaloneWebappEnabled,
    true,
  );
});
