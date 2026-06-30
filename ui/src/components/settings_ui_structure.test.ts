import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./settings_ui.tsx", import.meta.url), "utf8");

test("Settings UI primitives use shared section label typography", () => {
  assert.match(source, /settingsSectionLabelClass/);
  assert.doesNotMatch(source, /tracking-\[0\.22em\]/);
});
