import test from "node:test";
import assert from "node:assert/strict";
import { buildMeasuredWeightUpdatePlan } from "./inventory_spool_weight_update_model";

test("measured weight plan records printer usage when remaining filament dropped", () => {
  assert.deepEqual(
    buildMeasuredWeightUpdatePlan({
      previousRemaining: 800,
      measuredTotalWeight: 950,
      tareWeight: 200,
      jobName: "  Benchy  ",
    }),
    { kind: "usage", usedGrams: 50, jobName: "Benchy" },
  );
});

test("measured weight plan updates total weight when filament increased or no baseline exists", () => {
  assert.deepEqual(
    buildMeasuredWeightUpdatePlan({
      previousRemaining: 700,
      measuredTotalWeight: 950,
      tareWeight: 200,
    }),
    { kind: "weight", measuredTotalWeight: 950 },
  );
  assert.deepEqual(
    buildMeasuredWeightUpdatePlan({
      previousRemaining: null,
      measuredTotalWeight: 949.6,
      tareWeight: 200,
    }),
    { kind: "weight", measuredTotalWeight: 950 },
  );
});

test("measured weight plan does nothing when measured filament matches baseline", () => {
  assert.deepEqual(
    buildMeasuredWeightUpdatePlan({
      previousRemaining: 750,
      measuredTotalWeight: 950,
      tareWeight: 200,
      jobName: "ignored",
    }),
    { kind: "none" },
  );
});
