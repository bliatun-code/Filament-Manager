import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLibrarySyncPageState,
  loadLibrarySyncPageState,
} from "./library_sync_state";
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

test("deriveLibrarySyncPageState keeps incomplete client settings in client mode", () => {
  const state = deriveLibrarySyncPageState(
    syncSettings({
      mode: "CLIENT",
      host_base_url: null,
      library_id: "library-1",
    }),
  );

  assert.equal(state.clientReadOnly, true);
  assert.equal(state.clientHostBaseUrl, null);
  assert.equal(state.clientLibraryId, "library-1");
});

test("loadLibrarySyncPageState loads and maps sync settings", async () => {
  const state = await loadLibrarySyncPageState(
    {
      loadSyncSettings: async () =>
        syncSettings({
          mode: "CLIENT",
          host_base_url: "http://host",
          host_device_name: "Host",
          client_auth_paired: true,
        }),
    },
  );

  assert.equal(state.clientReadOnly, true);
  assert.equal(state.clientHostWritePaired, true);
  assert.equal(state.clientHostDeviceName, "Host");
  assert.equal(state.clientHostBaseUrl, "http://host");
});
