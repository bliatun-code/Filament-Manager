import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveLibrarySyncPageState,
  loadLibrarySyncPageState,
} from "./library_sync_state";
import type { LibrarySyncPageStatus } from "./tauri_client";

function syncSettings(overrides: Partial<LibrarySyncPageStatus> = {}): LibrarySyncPageStatus {
  return {
    mode: "STANDALONE",
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
    clientTargetGeneration: null,
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

test("pages request fresh compact status after changing Host", async () => {
  const previousWindow = globalThis.window;
  let status = syncSettings({
    mode: "CLIENT", host_base_url: "http://first.test", host_device_name: "First",
    target_generation: 3, client_auth_paired: true,
  });
  globalThis.window = {
    __TAURI__: { invoke: async (command: string) => {
      assert.equal(command, "get_library_sync_page_status");
      return status;
    } },
  } as unknown as Window & typeof globalThis;
  try {
    assert.equal((await loadLibrarySyncPageState()).clientHostWritePaired, true);
    status = syncSettings({
      mode: "CLIENT", library_id: "replacement", host_base_url: "http://second.test",
      host_device_name: "Second", target_generation: 4, client_auth_paired: false,
    });
    assert.deepEqual(await loadLibrarySyncPageState(), {
      clientReadOnly: true, clientHostWritePaired: false, clientHostDeviceName: "Second",
      clientHostBaseUrl: "http://second.test", clientLibraryId: "replacement", clientTargetGeneration: 4,
    });
  } finally {
    globalThis.window = previousWindow;
  }
});
