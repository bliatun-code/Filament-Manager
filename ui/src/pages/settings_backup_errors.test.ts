import assert from "node:assert/strict";
import test from "node:test";
import { settingsBackupFileError } from "./settings_backup_errors";
const t = (_key: string, fallback?: string) => fallback ?? _key;

test("file validation errors explain recovery without exposing parser or SQL details", () => {
  for (const [code, expected] of [
    ["document.file_empty", /file is empty/],
    ["document.json_invalid", /damaged or incomplete/],
    ["document.backup_unsupported", /Update Filament Manager/],
    ["document.backup_invalid", /full backup JSON/],
    ["document.inventory_invalid", /spool_id.*non-negative whole grams/],
  ] as const) {
    const message = settingsBackupFileError(JSON.stringify({code, safe_detail:"private content"}), "chosen.json", "Failed", t);
    assert.match(message, /^chosen.json: /);
    assert.match(message, expected);
    assert.doesNotMatch(message, /private content/);
  }
});

test("an actual database failure retains the internal-error treatment", () => {
  const message = settingsBackupFileError(JSON.stringify({code:"common.internal",safe_detail:null,diagnostic_id:"fm-test"}), "chosen.csv", "Failed", t);
  assert.match(message, /Something went wrong/);
  assert.doesNotMatch(message, /Invalid inventory|empty|damaged/);
});
