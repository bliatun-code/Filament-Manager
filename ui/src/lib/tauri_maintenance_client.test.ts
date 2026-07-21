import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { openExternalUrl } from "./tauri_maintenance_client";

const source = readFileSync(new URL("./tauri_maintenance_client.ts", import.meta.url), "utf8");

test("maintenance client exposes typed application diagnostics commands", () => {
  assert.match(source, /invoke<ApplicationDiagnostics>\("get_application_diagnostics"\)/);
  assert.match(source, /invoke<string>\("get_sanitized_support_bundle_json"\)/);
  assert.match(source, /quick_check: DiagnosticCheckStatus/);
  assert.match(source, /local_db_path: string/);
});

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
