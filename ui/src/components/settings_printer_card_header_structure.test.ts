import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("./settings_printer_card_header.tsx", import.meta.url),
  "utf8",
);

test("settings printer card header uses shared settings action buttons", () => {
  assert.match(source, /settingsActionButtonClass\("neutral", "compact"\)/);
  assert.match(source, /settingsActionButtonClass\(isEditing \? "accent" : "neutral", "compact"\)/);
  assert.match(source, /settingsActionButtonClass\(confirmDelete \? "danger" : "dangerQuiet", "compact"\)/);
  assert.doesNotMatch(source, /rounded border px-2 py-1/);
  assert.doesNotMatch(source, /rounded border border-slate-300 px-2 py-1/);
});
