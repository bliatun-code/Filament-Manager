import test from "node:test";
import assert from "node:assert/strict";

import {
  PURCHASE_BATCH_CODE_MAX_LENGTH,
  PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH,
  buildPurchaseReceiptMetadataDraft,
  emptyPurchaseReceiptMetadataDraft,
  isEditableSpoolStatus,
  isValidPurchaseReceiptDate,
  isSpoolStatusAssigned,
  isSpoolStatusDeleted,
  isSpoolStatusLiveRfidCandidate,
  isSpoolStatusUnavailableForPrinterSlot,
  normalizeEditableSpoolStatus,
  normalizeLoanDirection,
  normalizeLoanStatus,
  normalizeOwnershipType,
  normalizeSpoolStatus,
  parseSpoolStatus,
  parsePurchaseReceiptMetadataDraft,
  preparePurchaseReceiptMetadataUpdate,
  purchaseReceiptMetadataHasValues,
} from "./companion_domain.js";

test("companion domain normalizes legacy spool status tokens", () => {
  assert.equal(parseSpoolStatus("in-use"), "ASSIGNED");
  assert.equal(parseSpoolStatus(" assigned "), "ASSIGNED");
  assert.equal(parseSpoolStatus("loaned out"), "BORROWED");
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
  assert.equal(isSpoolStatusUnavailableForPrinterSlot("loaned-out"), true);
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

test("companion domain normalizes loan tokens like the desktop boundary", () => {
  assert.equal(normalizeLoanDirection("inbound"), "INBOUND");
  assert.equal(normalizeLoanDirection("in bound"), "INBOUND");
  assert.equal(normalizeLoanDirection("in-bound"), "INBOUND");
  assert.equal(normalizeLoanDirection(""), "OUTBOUND");
  assert.equal(normalizeLoanStatus("returned"), "RETURNED");
  assert.equal(normalizeLoanStatus("active", "2026-07-01 10:00:00"), "RETURNED");
  assert.equal(normalizeLoanStatus("lost"), "LOST");
  assert.equal(normalizeLoanStatus("cancelled"), "CANCELLED");
  assert.equal(normalizeLoanStatus("loan-cancelled"), "ACTIVE");
  assert.equal(normalizeLoanStatus(""), "ACTIVE");
});

test("purchase receipt metadata normalizes the canonical five-field payload", () => {
  const parsed = parsePurchaseReceiptMetadataDraft({
    pricePerRoll: " 249.50 ",
    currency: " nok ",
    purchaseDate: " 2024-02-29 ",
    batchCode: " LOT-7 ",
    supplierReference: " PO-12345 ",
  });

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2024-02-29",
      batch_code: "LOT-7",
      supplier_reference: "PO-12345",
    },
  });
  assert.equal(purchaseReceiptMetadataHasValues(parsed.value), true);
  assert.equal(
    purchaseReceiptMetadataHasValues(
      parsePurchaseReceiptMetadataDraft(emptyPurchaseReceiptMetadataDraft()).value,
    ),
    false,
  );
});

test("purchase receipt validation rejects malformed price, currency, date, and Unicode limits", () => {
  const base = emptyPurchaseReceiptMetadataDraft();
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({ ...base, pricePerRoll: "Infinity" }),
    {
      ok: false,
      errors: {
        pricePerRoll: "price-invalid",
        currency: "currency-required",
      },
    },
  );
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({
      ...base,
      pricePerRoll: "-0.01",
      currency: "NOK",
    }),
    { ok: false, errors: { pricePerRoll: "price-negative" } },
  );
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({ ...base, currency: "NOK" }),
    { ok: false, errors: { currency: "currency-without-price" } },
  );
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({
      ...base,
      pricePerRoll: "0",
      currency: "N0K",
      purchaseDate: "2026-02-30",
      batchCode: "x".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH + 1),
      supplierReference: "x".repeat(PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH + 1),
    }),
    {
      ok: false,
      errors: {
        currency: "currency-invalid",
        purchaseDate: "purchase-date-invalid",
        batchCode: "batch-code-too-long",
        supplierReference: "supplier-reference-too-long",
      },
    },
  );
  assert.equal(isValidPurchaseReceiptDate("2000-02-29"), true);
  assert.equal(isValidPurchaseReceiptDate("1900-02-29"), false);
  assert.equal(isValidPurchaseReceiptDate("0000-01-01"), false);
  assert.equal(
    parsePurchaseReceiptMetadataDraft({
      ...base,
      batchCode: "🧵".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH),
    }).ok,
    true,
  );
});

test("detail receipt updates preserve legacy prices, omit unchanged data, and keep explicit clear", () => {
  const legacy = {
    purchase_price: 199,
    purchase_currency: null,
    purchase_date: "2026-08-21",
    batch_code: null,
    supplier_reference: null,
  };
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(legacy, {
      ...buildPurchaseReceiptMetadataDraft(legacy),
      batchCode: "LEGACY-BATCH",
    }),
    {
      ok: true,
      changed: true,
      value: { ...legacy, batch_code: "LEGACY-BATCH" },
    },
  );
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(legacy, {
      ...buildPurchaseReceiptMetadataDraft(legacy),
      pricePerRoll: "200",
    }),
    { ok: false, errors: { currency: "currency-required" } },
  );
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(
      legacy,
      buildPurchaseReceiptMetadataDraft(legacy),
    ),
    { ok: true, changed: false },
  );
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(legacy, emptyPurchaseReceiptMetadataDraft()),
    {
      ok: true,
      changed: true,
      value: {
        purchase_price: null,
        purchase_currency: null,
        purchase_date: null,
        batch_code: null,
        supplier_reference: null,
      },
    },
  );
});
