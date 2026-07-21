import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_backup_export_actions.ts", import.meta.url),
  "utf8",
);

test("full-backup activity is recorded only after validation and download succeed", () => {
  const validationIndex = source.indexOf("validateFullBackupJson(payload.content)");
  const downloadIndex = source.indexOf("downloadTextFile(", validationIndex);
  const recordIndex = source.indexOf("recordFullBackupExport(exportedAt)", downloadIndex);

  assert.ok(validationIndex >= 0, "full backup validation must remain present");
  assert.ok(downloadIndex > validationIndex, "download must follow validation");
  assert.ok(recordIndex > downloadIndex, "activity must not be recorded before download returns");
});
