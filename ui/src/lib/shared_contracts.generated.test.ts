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
  type LowStockPolicy,
} from "./shared_contracts.generated";

test("generated TypeScript contracts expose canonical Rust tokens", () => {
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

  assert.equal(isCanonicalSpoolStatus("BORROWED"), true);
  assert.equal(isCanonicalSpoolStatus("LOANED_OUT"), false);
  assert.equal(isCanonicalOwnershipType("OWNED"), true);
  assert.equal(isCanonicalOwnershipType("owned"), false);
  assert.equal(isCanonicalLoanDirection("INBOUND"), true);
  assert.equal(isCanonicalLoanDirection("IN_BOUND"), false);
  assert.equal(isCanonicalLoanStatus("RETURNED"), true);
  assert.equal(isCanonicalLoanStatus("returned"), false);
});

test("generated low-stock DTOs retain the serde wire field names", () => {
  const policy: LowStockPolicy = {
    default_threshold_g: 200,
    material_overrides: [
      {
        material_key: "PLA",
        material: "PLA",
        threshold_g: 150,
      },
    ],
  };

  assert.deepEqual(Object.keys(policy), ["default_threshold_g", "material_overrides"]);
  assert.deepEqual(Object.keys(policy.material_overrides[0] ?? {}), [
    "material_key",
    "material",
    "threshold_g",
  ]);
  assert.equal(isLowStockPolicy(policy), true);
  assert.equal(
    isLowStockMaterialOverride({
      ...policy.material_overrides[0],
      threshold_g: 150.5,
    }),
    false,
  );
  assert.equal(
    isLowStockPolicy({
      ...policy,
      default_threshold_g: "200",
    }),
    false,
  );
});
