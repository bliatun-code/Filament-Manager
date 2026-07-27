import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./use_settings_backup_file_actions.ts", import.meta.url),
  "utf8",
);

test("full backup file import validates and confirms before restore", () => {
  const validationIndex = source.indexOf("validateFullBackupJson(content)");
  const confirmationIndex = source.indexOf("window.confirm(");
  const importIndex = source.indexOf("importDataFile(content)");

  assert.ok(validationIndex >= 0, "full backup preflight validation must remain present");
  assert.ok(confirmationIndex > validationIndex, "confirmation must follow validation");
  assert.ok(importIndex > confirmationIndex, "restore must not start before confirmation");
  assert.match(source, /settings\.confirmImportBackup/);
});
