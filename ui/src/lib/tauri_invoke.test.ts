import assert from "node:assert/strict";
import test from "node:test";

import { hasTauriRuntime } from "./tauri_invoke";

test("hasTauriRuntime is safe outside browser contexts", () => {
  const previousWindow = globalThis.window;

  try {
    delete (globalThis as typeof globalThis & { window?: Window }).window;
    assert.equal(hasTauriRuntime(), false);
  } finally {
    globalThis.window = previousWindow;
  }
});
