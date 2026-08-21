import assert from "node:assert/strict";
import test from "node:test";

import {
  effectivePolicyThreshold,
  normalizeLowStockMaterialKey,
  normalizeLowStockPolicy,
  resolveSpoolLowStockThreshold,
} from "./low_stock_policy";

test("policy normalization keeps display names and deterministic material keys", () => {
  const policy = normalizeLowStockPolicy({
    default_threshold_g: 240,
    material_overrides: [
      {
        material_key: "untrusted-key",
        material: "  PETG   CF  ",
        threshold_g: 360,
      },
    ],
  });

  assert.equal(normalizeLowStockMaterialKey(" petg   cf "), "PETG CF");
  assert.deepEqual(policy.material_overrides, [
    {
      material_key: "PETG CF",
      material: "PETG CF",
      threshold_g: 360,
    },
  ]);
  assert.equal(effectivePolicyThreshold(policy, "petg cf"), 360);
  assert.equal(effectivePolicyThreshold(policy, "PLA"), 240);
});

test("missing or invalid older-Host thresholds use the explicit 200 g compatibility value", () => {
  assert.deepEqual(resolveSpoolLowStockThreshold({}), {
    thresholdGrams: 200,
    legacyFallback: true,
  });
  assert.deepEqual(resolveSpoolLowStockThreshold({ low_stock_threshold_g: 0 }), {
    thresholdGrams: 200,
    legacyFallback: true,
  });
  assert.deepEqual(resolveSpoolLowStockThreshold({ low_stock_threshold_g: 325 }), {
    thresholdGrams: 325,
    legacyFallback: false,
  });
});
