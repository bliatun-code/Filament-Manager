import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const activityHookSource = readFileSync(
  new URL("./use_settings_full_backup_activity.ts", import.meta.url),
  "utf8",
);
const guidedProgressSource = readFileSync(
  new URL("./use_settings_backup_validation_state.ts", import.meta.url),
  "utf8",
);

test("full-backup activity initializes from storage and keeps successful writes in state", () => {
  assert.match(activityHookSource, /useState<string \| null>\(\s*readLatestFullBackupExport/);
  assert.match(activityHookSource, /recordLatestFullBackupExport\(exportedAt\)/);
  assert.match(activityHookSource, /if \(normalized\) \{\s*setLatestFullBackupExportedAt\(normalized\)/);
});

test("guided role-change cleanup remains session-only", () => {
  const clearStart = guidedProgressSource.indexOf("function clearFullBackupProgress()");
  const clearEnd = guidedProgressSource.indexOf("function clearBackupValidation()", clearStart);
  assert.ok(clearStart >= 0 && clearEnd > clearStart);
  const clearFunction = guidedProgressSource.slice(clearStart, clearEnd);

  assert.doesNotMatch(clearFunction, /localStorage|SETTINGS_FULL_BACKUP_ACTIVITY_STORAGE_KEY/);
  assert.doesNotMatch(guidedProgressSource, /settings_full_backup_activity/);
});
