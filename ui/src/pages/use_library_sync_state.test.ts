import assert from "node:assert/strict";
import test from "node:test";

import { resolveLibrarySyncUiState } from "./use_library_sync_state";

test("role resolution fails closed when persisted sync settings cannot be read", async () => {
  const originalConsoleError = console.error;
  console.error = () => undefined;
  try {
    const state = await resolveLibrarySyncUiState(true, {
      loadPageState: async () => {
        throw new Error("database unavailable");
      },
    });

    assert.equal(state.librarySyncResolution, "ERROR");
    assert.equal(state.clientReadOnly, true);
    assert.equal(state.clientHostWritePaired, false);
    assert.equal(state.clientHostBaseUrl, null);
    assert.equal(state.clientLibraryId, null);
    assert.equal(state.clientTargetGeneration, null);
  } finally {
    console.error = originalConsoleError;
  }
});

test("role resolution exposes the target generation only after a successful read", async () => {
  const state = await resolveLibrarySyncUiState(true, {
    loadPageState: async () => ({
      clientReadOnly: true,
      clientHostWritePaired: true,
      clientHostDeviceName: "Host",
      clientHostBaseUrl: "http://host",
      clientLibraryId: "library-host",
      clientTargetGeneration: 17,
    }),
  });

  assert.equal(state.librarySyncResolution, "READY");
  assert.equal(state.clientReadOnly, true);
  assert.equal(state.clientTargetGeneration, 17);
});
