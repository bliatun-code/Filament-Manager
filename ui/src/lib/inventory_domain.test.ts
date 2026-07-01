import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLoanDirection,
  normalizeLoanStatus,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  parseSpoolStatus,
} from "./inventory_domain";

test("inventory domain normalizers preserve legacy spool and ownership values", () => {
  assert.equal(parseSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(parseSpoolStatus("unknown"), null);
  assert.equal(normalizeSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("assigned"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("borrowed"), "BORROWED");
  assert.equal(normalizeSpoolStatus("unknown"), "IN_STOCK");
  assert.equal(normalizeOwnershipType("borrowed-in"), "BORROWED_IN");
  assert.equal(normalizeOwnershipType(null), "OWNED");
});

test("inventory domain normalizers preserve loan direction and status semantics", () => {
  assert.equal(normalizeLoanDirection("inbound"), "INBOUND");
  assert.equal(normalizeLoanDirection("sideways"), "OUTBOUND");
  assert.equal(normalizeLoanStatus("returned"), "RETURNED");
  assert.equal(normalizeLoanStatus("active"), "ACTIVE");
  assert.equal(normalizeLoanStatus("ACTIVE", "2026-07-01 10:00:00"), "RETURNED");
  assert.equal(normalizeLoanStatus(""), "ACTIVE");
});
