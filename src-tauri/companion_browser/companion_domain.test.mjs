import test from "node:test";
import assert from "node:assert/strict";

import {
  isEditableSpoolStatus,
  isSpoolStatusAssigned,
  isSpoolStatusDeleted,
  isSpoolStatusLiveRfidCandidate,
  isSpoolStatusUnavailableForPrinterSlot,
  normalizeEditableSpoolStatus,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  parseSpoolStatus,
} from "./companion_domain.js";

test("companion domain normalizes legacy spool status tokens", () => {
  assert.equal(parseSpoolStatus("in-use"), "ASSIGNED");
  assert.equal(parseSpoolStatus(" assigned "), "ASSIGNED");
  assert.equal(normalizeSpoolStatus("unknown_status"), "IN_STOCK");
  assert.equal(isSpoolStatusAssigned("IN USE"), true);
});

test("companion domain keeps editable status choices narrow", () => {
  assert.equal(isEditableSpoolStatus("in-stock"), true);
  assert.equal(isEditableSpoolStatus("empty"), true);
  assert.equal(isEditableSpoolStatus("lost"), true);
  assert.equal(isEditableSpoolStatus("assigned"), false);
  assert.equal(normalizeEditableSpoolStatus("assigned"), "IN_STOCK");
});

test("companion domain filters unavailable printer and RFID candidates consistently", () => {
  assert.equal(isSpoolStatusUnavailableForPrinterSlot("borrowed"), true);
  assert.equal(isSpoolStatusUnavailableForPrinterSlot("missing"), true);
  assert.equal(isSpoolStatusDeleted(" deleted "), true);
  assert.equal(isSpoolStatusDeleted("missing"), false);
  assert.equal(isSpoolStatusLiveRfidCandidate("deleted"), false);
  assert.equal(isSpoolStatusLiveRfidCandidate("in-use"), true);
});

test("companion domain normalizes ownership type aliases", () => {
  assert.equal(normalizeOwnershipType("borrowed in"), "BORROWED_IN");
  assert.equal(normalizeOwnershipType("borrowed-in"), "BORROWED_IN");
  assert.equal(normalizeOwnershipType(""), "OWNED");
});
