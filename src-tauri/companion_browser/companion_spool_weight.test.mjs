import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultSpoolTareWeightForVendor,
  resolveSpoolRowTareWeight,
  resolveSpoolTareWeight,
} from "./companion_spool_weight.js";

test("companion spool weight resolves known vendor defaults", () => {
  assert.equal(defaultSpoolTareWeightForVendor("Bambu Lab"), 250);
  assert.equal(defaultSpoolTareWeightForVendor("eSUN"), 224);
  assert.equal(defaultSpoolTareWeightForVendor("Generic"), 0);
});

test("companion spool weight prefers explicit finite tare values", () => {
  assert.equal(resolveSpoolTareWeight({ spool_tare_weight_g: 198.6 }, "Bambu Lab"), 199);
  assert.equal(resolveSpoolTareWeight({ spool_tare_weight_g: -10 }, "Bambu Lab"), 0);
});

test("companion spool row tare helper reads spool and master shape", () => {
  assert.equal(
    resolveSpoolRowTareWeight({
      spool: { spool_tare_weight_g: null },
      master: { vendor: "eSUN" },
    }),
    224,
  );
});
