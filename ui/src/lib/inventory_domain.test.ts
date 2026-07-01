import test from "node:test";
import assert from "node:assert/strict";
import {
  isBorrowedInOwnership,
  isSpoolStatusAssigned,
  isSpoolStatusDeleted,
  isSpoolStatusEmptyOrLost,
  isSpoolStatusLoanable,
  isSpoolStatusMetadataMatchable,
  isSpoolStatusOnHand,
  isSpoolStatusRfidMatchable,
  isSpoolStatusUnavailableForSlot,
  normalizeLoanDirection,
  normalizeLoanStatus,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  parseSpoolStatus,
} from "./inventory_domain";

test("inventory domain normalizers preserve legacy spool and ownership values", () => {
  assert.equal(parseSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(parseSpoolStatus("IN USE"), "ASSIGNED");
  assert.equal(parseSpoolStatus("unknown"), null);
  assert.equal(normalizeSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("assigned"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("borrowed"), "BORROWED");
  assert.equal(normalizeSpoolStatus("unknown"), "IN_STOCK");
  assert.equal(normalizeOwnershipType("borrowed-in"), "BORROWED_IN");
  assert.equal(normalizeOwnershipType("borrowed in"), "BORROWED_IN");
  assert.equal(normalizeOwnershipType(null), "OWNED");
  assert.equal(isBorrowedInOwnership("borrowed-in"), true);
  assert.equal(isBorrowedInOwnership("borrowed in"), true);
  assert.equal(isBorrowedInOwnership("owned"), false);
});

test("inventory domain status helpers preserve contextual legacy semantics", () => {
  assert.equal(isSpoolStatusOnHand("IN_STOCK"), true);
  assert.equal(isSpoolStatusOnHand("IN_USE"), true);
  assert.equal(isSpoolStatusOnHand("LEGACY_ACTIVE"), false);
  assert.equal(isSpoolStatusAssigned("IN_USE"), true);
  assert.equal(isSpoolStatusLoanable("in-stock"), true);
  assert.equal(isSpoolStatusEmptyOrLost("lost"), true);
  assert.equal(isSpoolStatusDeleted("deleted"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("BORROWED"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("MISSING"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("LEGACY_ACTIVE"), false);
  assert.equal(isSpoolStatusRfidMatchable("EMPTY"), true);
  assert.equal(isSpoolStatusRfidMatchable("DELETED"), false);
  assert.equal(isSpoolStatusMetadataMatchable("EMPTY"), false);
  assert.equal(isSpoolStatusMetadataMatchable("LEGACY_ACTIVE"), true);
});

test("inventory domain normalizers preserve loan direction and status semantics", () => {
  assert.equal(normalizeLoanDirection("inbound"), "INBOUND");
  assert.equal(normalizeLoanDirection("sideways"), "OUTBOUND");
  assert.equal(normalizeLoanStatus("returned"), "RETURNED");
  assert.equal(normalizeLoanStatus("active"), "ACTIVE");
  assert.equal(normalizeLoanStatus("lost"), "LOST");
  assert.equal(normalizeLoanStatus("cancelled"), "CANCELLED");
  assert.equal(normalizeLoanStatus("ACTIVE", "2026-07-01 10:00:00"), "RETURNED");
  assert.equal(normalizeLoanStatus(""), "ACTIVE");
});
