import test from "node:test";
import assert from "node:assert/strict";

import {
  LOAN_DIRECTIONS,
  LOAN_STATUSES,
  OWNERSHIP_TYPES,
  SPOOL_STATUSES,
  isCanonicalLoanDirection,
  isCanonicalLoanStatus,
  isCanonicalOwnershipType,
  isCanonicalSpoolStatus,
  isLowStockMaterialOverride,
  isLowStockPolicy,
} from "./shared_contracts.generated.js";

test("generated Companion enums expose only canonical serialized tokens", () => {
  assert.deepEqual(SPOOL_STATUSES, [
    "IN_STOCK",
    "ASSIGNED",
    "BORROWED",
    "EMPTY",
    "LOST",
    "MISSING",
    "DELETED",
  ]);
  assert.deepEqual(OWNERSHIP_TYPES, ["OWNED", "BORROWED_IN"]);
  assert.deepEqual(LOAN_DIRECTIONS, ["OUTBOUND", "INBOUND"]);
  assert.deepEqual(LOAN_STATUSES, ["ACTIVE", "RETURNED", "LOST", "CANCELLED"]);

  assert.equal(isCanonicalSpoolStatus("ASSIGNED"), true);
  assert.equal(isCanonicalSpoolStatus("IN_USE"), false);
  assert.equal(isCanonicalOwnershipType("BORROWED_IN"), true);
  assert.equal(isCanonicalOwnershipType("BORROWED-IN"), false);
  assert.equal(isCanonicalLoanDirection("INBOUND"), true);
  assert.equal(isCanonicalLoanDirection("IN_BOUND"), false);
  assert.equal(isCanonicalLoanStatus("CANCELLED"), true);
  assert.equal(isCanonicalLoanStatus("CANCELED"), false);
});

test("generated Companion validators enforce the low-stock DTO wire shape", () => {
  const override = {
    material_key: "PETG CF",
    material: "PETG CF",
    threshold_g: 350,
  };
  assert.equal(isLowStockMaterialOverride(override), true);
  assert.equal(isLowStockMaterialOverride({ ...override, threshold_g: 350.5 }), false);
  assert.equal(
    isLowStockPolicy({
      default_threshold_g: 200,
      material_overrides: [override],
    }),
    true,
  );
  assert.equal(
    isLowStockPolicy({
      default_threshold_g: "200",
      material_overrides: [override],
    }),
    false,
  );
});
