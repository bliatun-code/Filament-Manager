import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMeasuredTotalWeightDraft,
  parseWeightInput,
  prepareMeasuredWeightUpdate,
} from "./printer_slot_model";

test("parseWeightInput accepts non-negative integer grams and rejects empty or invalid values", () => {
  assert.equal(parseWeightInput(" 42 "), 42);
  assert.equal(parseWeightInput(""), null);
  assert.equal(parseWeightInput("-1"), null);
  assert.equal(parseWeightInput("abc"), null);
});

test("buildMeasuredTotalWeightDraft combines remaining filament and empty spool weight", () => {
  assert.equal(buildMeasuredTotalWeightDraft(750, 250), "1000");
  assert.equal(buildMeasuredTotalWeightDraft(-50, 20), "0");
  assert.equal(buildMeasuredTotalWeightDraft(null, 250), "");
});

test("prepareMeasuredWeightUpdate separates host usage and local no-op decisions", () => {
  assert.deepEqual(prepareMeasuredWeightUpdate(800, 950, 200), {
    safeMeasuredTotal: 950,
    safeTareWeight: 200,
    measuredFilament: 750,
    baseline: 800,
    usedGrams: 50,
    clientAction: "record_usage",
    localAction: "record_usage",
  });
  assert.equal(prepareMeasuredWeightUpdate(750, 950, 200).localAction, "none");
  assert.equal(prepareMeasuredWeightUpdate(null, 950, 200).localAction, "update_weight");
});
