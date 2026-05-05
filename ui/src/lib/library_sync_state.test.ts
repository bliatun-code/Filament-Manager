import assert from "node:assert/strict";
import test from "node:test";

import { deriveLibrarySyncPageState } from "./library_sync_state";
import type { LibrarySyncSettings } from "./tauri_client";

function syncSettings(overrides: Partial<LibrarySyncSettings> = {}): LibrarySyncSettings {
  return {
    mode: "STANDALONE",
    device_name: "desktop",
    library_id: "library-1",
    client_auth_paired: false,
    ...overrides,
  };
}

test("deriveLibrarySyncPageState maps client sync settings for write-capable pages", () => {
  const state = deriveLibrarySyncPageState(
    syncSettings({
      mode: "CLIENT",
      host_base_url: "http://host",
      host_device_name: "Host",
      client_auth_paired: true,
    }),
  );

  assert.deepEqual(state, {
    clientReadOnly: true,
    clientHostWritePaired: true,
    clientHostDeviceName: "Host",
    clientHostBaseUrl: "http://host",
    clientLibraryId: "library-1",
  });
});

test("deriveLibrarySyncPageState can require complete host details for read-only client loading", () => {
  const incompleteState = deriveLibrarySyncPageState(
    syncSettings({
      mode: "CLIENT",
      host_base_url: null,
      library_id: "library-1",
    }),
    { requireHostForClientReadOnly: true },
  );
  const completeState = deriveLibrarySyncPageState(
    syncSettings({
      mode: "CLIENT",
      host_base_url: "http://host",
      library_id: "library-1",
    }),
    { requireHostForClientReadOnly: true },
  );

  assert.equal(incompleteState.clientReadOnly, false);
  assert.equal(completeState.clientReadOnly, true);
});
