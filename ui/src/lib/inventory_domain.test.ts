import test from "node:test";
import assert from "node:assert/strict";
import {
  isBorrowedInOwnership,
  isInboundLoanDirection,
  isLoanDirection,
  isOutboundLoanDirection,
  isSpoolStatusAssigned,
  isSpoolStatusDeleted,
  isSpoolStatusEmpty,
  isSpoolStatusEmptyOrLost,
  isSpoolStatusLoanable,
  isSpoolStatusMetadataMatchable,
  isSpoolStatusOnHand,
  isSpoolStatusRfidMatchable,
  isSpoolStatusUnavailableForSlot,
  isSpoolLowStock,
  isSpoolStockHealthy,
  normalizeLoanDirection,
  normalizeLoanStatus,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  parseSpoolStatus,
  resolveSpoolStockGrams,
} from "./inventory_domain";

test("inventory domain normalizers preserve legacy spool and ownership values", () => {
  assert.equal(parseSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(parseSpoolStatus("IN USE"), "ASSIGNED");
  assert.equal(parseSpoolStatus("missing"), "MISSING");
  assert.equal(parseSpoolStatus("deleted"), "DELETED");
  assert.equal(parseSpoolStatus("unknown"), null);
  assert.equal(normalizeSpoolStatus("IN_USE"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("assigned"), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("borrowed"), "BORROWED");
  assert.equal(normalizeSpoolStatus("loaned out"), "BORROWED");
  assert.equal(normalizeSpoolStatus("missing"), "MISSING");
  assert.equal(normalizeSpoolStatus("deleted"), "DELETED");
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
  assert.equal(isSpoolStatusEmpty("empty"), true);
  assert.equal(isSpoolStatusEmpty("lost"), false);
  assert.equal(isSpoolStatusEmptyOrLost("lost"), true);
  assert.equal(isSpoolStatusDeleted("deleted"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("BORROWED"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("loaned out"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("MISSING"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("DELETED"), true);
  assert.equal(isSpoolStatusUnavailableForSlot("LEGACY_ACTIVE"), false);
  assert.equal(isSpoolStatusRfidMatchable("EMPTY"), true);
  assert.equal(isSpoolStatusRfidMatchable("DELETED"), false);
  assert.equal(isSpoolStatusMetadataMatchable("EMPTY"), false);
  assert.equal(isSpoolStatusMetadataMatchable("LEGACY_ACTIVE"), true);
});

test("inventory domain centralizes low-stock boundaries and weight precedence", () => {
  const stock = (remainingGrams: number) => ({
    status: "IN_STOCK",
    remainingGrams,
    currentWeightGrams: 900,
    initialWeightGrams: 1000,
  });

  assert.equal(isSpoolLowStock(stock(0)), false);
  assert.equal(isSpoolLowStock(stock(1)), true);
  assert.equal(isSpoolLowStock(stock(199)), true);
  assert.equal(isSpoolLowStock(stock(200)), true);
  assert.equal(isSpoolLowStock(stock(201)), false);
  assert.equal(isSpoolStockHealthy(stock(200)), false);
  assert.equal(isSpoolStockHealthy(stock(201)), true);
  assert.equal(isSpoolLowStock({ ...stock(90), status: "EMPTY" }), false);
  assert.equal(isSpoolLowStock({ ...stock(90), status: "LOST" }), false);
  assert.equal(
    resolveSpoolStockGrams({
      remainingGrams: null,
      currentWeightGrams: 175,
      initialWeightGrams: 1000,
    }),
    175,
  );
  assert.equal(resolveSpoolStockGrams({ remainingGrams: Number.NaN }), 0);
});

test("inventory domain normalizers preserve loan direction and status semantics", () => {
  assert.equal(normalizeLoanDirection("inbound"), "INBOUND");
  assert.equal(normalizeLoanDirection("in-bound"), "INBOUND");
  assert.equal(normalizeLoanDirection("out-bound"), "OUTBOUND");
  assert.equal(normalizeLoanDirection("sideways"), "OUTBOUND");
  assert.equal(isInboundLoanDirection("in-bound"), true);
  assert.equal(isOutboundLoanDirection("sideways"), true);
  assert.equal(isLoanDirection("in bound", "INBOUND"), true);
  assert.equal(isLoanDirection("outbound", "INBOUND"), false);
  assert.equal(normalizeLoanStatus("returned"), "RETURNED");
  assert.equal(normalizeLoanStatus("active"), "ACTIVE");
  assert.equal(normalizeLoanStatus("lost"), "LOST");
  assert.equal(normalizeLoanStatus("cancelled"), "CANCELLED");
  assert.equal(normalizeLoanStatus("ACTIVE", "2026-07-01 10:00:00"), "RETURNED");
  assert.equal(normalizeLoanStatus(""), "ACTIVE");
});
