import assert from "node:assert/strict";
import test from "node:test";

import { defaultSpoolTareWeightForVendor, resolveSpoolTareWeight } from "./spool_weight";

test("defaultSpoolTareWeightForVendor resolves known vendor defaults", () => {
  assert.equal(defaultSpoolTareWeightForVendor("Bambu Lab"), 250);
  assert.equal(defaultSpoolTareWeightForVendor("eSUN"), 224);
  assert.equal(defaultSpoolTareWeightForVendor("Generic"), 0);
});

test("resolveSpoolTareWeight prefers explicit finite values", () => {
  assert.equal(resolveSpoolTareWeight(198.6, "Bambu Lab"), 199);
  assert.equal(resolveSpoolTareWeight(-10, "Bambu Lab"), 0);
});

test("resolveSpoolTareWeight falls back to vendor default when explicit value is missing", () => {
  assert.equal(resolveSpoolTareWeight(null, "eSUN"), 224);
  assert.equal(resolveSpoolTareWeight(undefined, "Unknown"), 0);
});
