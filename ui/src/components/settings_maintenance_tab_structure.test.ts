import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./settings_maintenance_tab.tsx", import.meta.url),
  "utf8",
);

test("SettingsMaintenanceTab reset actions reuse shared settings action buttons", () => {
  assert.match(source, /settingsActionButtonClass\("warning", "comfortable"\)/);
  assert.match(source, /settingsActionButtonClass\("danger", "comfortable"\)/);
  assert.doesNotMatch(source, /rounded-xl border border-amber-400 bg-amber-200/);
  assert.doesNotMatch(source, /rounded-xl border border-rose-400 bg-rose-200/);
});
