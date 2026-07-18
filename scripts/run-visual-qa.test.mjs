import assert from "node:assert/strict";
import test from "node:test";

import { shouldSpawnVisualQaNpmThroughShell } from "./run-visual-qa.mjs";

test("visual QA starts npm through the Windows command shell", () => {
  assert.equal(shouldSpawnVisualQaNpmThroughShell("win32"), true);
  assert.equal(shouldSpawnVisualQaNpmThroughShell("darwin"), false);
  assert.equal(shouldSpawnVisualQaNpmThroughShell("linux"), false);
});
