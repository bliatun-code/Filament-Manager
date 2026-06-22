import assert from "node:assert/strict";
import test from "node:test";

import { openExternalUrl } from "./tauri_maintenance_client";

test("openExternalUrl falls back to browser open outside Tauri", async () => {
  const previousWindow = globalThis.window;
  const opened: string[] = [];

  globalThis.window = {
    open: (url: string) => {
      opened.push(url);
      return null;
    },
  } as unknown as Window & typeof globalThis;

  try {
    await openExternalUrl("https://example.com/license");
  } finally {
    globalThis.window = previousWindow;
  }

  assert.deepEqual(opened, ["https://example.com/license"]);
});
