import assert from "node:assert/strict";
import test from "node:test";

import {
  PURCHASE_BATCH_CODE_MAX_LENGTH,
  PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH,
  buildPurchaseReceiptMetadataDraft,
  emptyPurchaseReceiptMetadataDraft,
  isValidIsoCalendarDate,
  parsePurchaseReceiptMetadataDraft,
  preparePurchaseReceiptMetadataUpdate,
  purchaseReceiptMetadataDraftChanged,
  purchaseReceiptMetadataKeepsLegacyCurrencylessPrice,
} from "./purchase_receipt_metadata";

test("empty receipt metadata remains valid and legacy fields hydrate without loss", () => {
  assert.deepEqual(parsePurchaseReceiptMetadataDraft(emptyPurchaseReceiptMetadataDraft()), {
    ok: true,
    value: {
      purchase_price: null,
      purchase_currency: null,
      purchase_date: null,
      batch_code: null,
      supplier_reference: null,
    },
  });

  const legacyMetadata = {
    purchase_date: "2026-08-21",
    purchase_price: 249.5,
    batch_code: "BATCH-42",
  };
  const legacyDraft = buildPurchaseReceiptMetadataDraft(legacyMetadata);
  assert.deepEqual(legacyDraft, {
    pricePerRoll: "249.5",
    currency: "",
    purchaseDate: "2026-08-21",
    batchCode: "BATCH-42",
    supplierReference: "",
  });
});

test("unchanged historical price without currency can be saved while any price change is strict", () => {
  const baseline = {
    purchase_price: 249.5,
    purchase_currency: null,
    purchase_date: "2026-08-21",
    batch_code: "BATCH-42",
    supplier_reference: null,
  };
  const draft = {
    ...buildPurchaseReceiptMetadataDraft(baseline),
    batchCode: "BATCH-43",
  };

  assert.deepEqual(parsePurchaseReceiptMetadataDraft(draft, { baseline }), {
    ok: true,
    value: {
      ...baseline,
      batch_code: "BATCH-43",
    },
  });
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft(
      { ...draft, pricePerRoll: "250" },
      { baseline },
    ),
    { ok: false, errors: { currency: "currency-required" } },
  );
  assert.deepEqual(parsePurchaseReceiptMetadataDraft(draft), {
    ok: false,
    errors: { currency: "currency-required" },
  });
  assert.equal(
    purchaseReceiptMetadataKeepsLegacyCurrencylessPrice(baseline, draft),
    true,
  );
  assert.equal(
    purchaseReceiptMetadataKeepsLegacyCurrencylessPrice(baseline, {
      ...draft,
      pricePerRoll: "250",
    }),
    false,
  );
});

test("metadata normalization trims text, uppercases currency, and keeps price per roll singular", () => {
  const result = parsePurchaseReceiptMetadataDraft({
    pricePerRoll: " 249.50 ",
    currency: " nok ",
    purchaseDate: " 2024-02-29 ",
    batchCode: " LOT-7 ",
    supplierReference: " PO-12345 ",
  });

  assert.deepEqual(result, {
    ok: true,
    value: {
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2024-02-29",
      batch_code: "LOT-7",
      supplier_reference: "PO-12345",
    },
  });
});

test("price is optional but must be finite and non-negative with currency when present", () => {
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
    parsePurchaseReceiptMetadataDraft({
      ...base,
      pricePerRoll: "0",
      currency: "N0K",
    }),
    { ok: false, errors: { currency: "currency-invalid" } },
  );
  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({ ...base, currency: "NOK" }),
    { ok: false, errors: { currency: "currency-without-price" } },
  );
});

test("purchase date accepts only real ISO calendar dates", () => {
  assert.equal(isValidIsoCalendarDate("2024-02-29"), true);
  assert.equal(isValidIsoCalendarDate("2000-02-29"), true);
  assert.equal(isValidIsoCalendarDate("1900-02-29"), false);
  assert.equal(isValidIsoCalendarDate("2026-02-30"), false);
  assert.equal(isValidIsoCalendarDate("2026-8-21"), false);
  assert.equal(isValidIsoCalendarDate("2026-08-21T10:00:00Z"), false);
  assert.equal(isValidIsoCalendarDate("0000-01-01"), false);
});

test("batch and supplier reference enforce trimmed Unicode length limits", () => {
  const base = emptyPurchaseReceiptMetadataDraft();
  const valid = parsePurchaseReceiptMetadataDraft({
    ...base,
    batchCode: ` ${"🧵".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH)} `,
    supplierReference: "x".repeat(PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH),
  });
  assert.equal(valid.ok, true);

  assert.deepEqual(
    parsePurchaseReceiptMetadataDraft({
      ...base,
      batchCode: "x".repeat(PURCHASE_BATCH_CODE_MAX_LENGTH + 1),
      supplierReference: "x".repeat(PURCHASE_SUPPLIER_REFERENCE_MAX_LENGTH + 1),
    }),
    {
      ok: false,
      errors: {
        batchCode: "batch-code-too-long",
        supplierReference: "supplier-reference-too-long",
      },
    },
  );
});

test("detail editing round-trips normalized metadata and ignores presentation-only changes", () => {
  const baseline = buildPurchaseReceiptMetadataDraft({
    purchase_price: 199,
    purchase_currency: "NOK",
    purchase_date: "2026-08-21",
    batch_code: "LOT-8",
    supplier_reference: "PO-9",
  });
  assert.equal(
    purchaseReceiptMetadataDraftChanged(baseline, {
      ...baseline,
      pricePerRoll: "0199.00",
      currency: " nok ",
      batchCode: " LOT-8 ",
    }),
    false,
  );
  assert.equal(
    purchaseReceiptMetadataDraftChanged(baseline, {
      ...baseline,
      supplierReference: "PO-10",
    }),
    true,
  );
});

test("detail updates omit untouched metadata but preserve explicit clearing", () => {
  const baseline = {
    purchase_price: 249.5,
    purchase_currency: "NOK",
    purchase_date: "2026-08-21",
    batch_code: "LOT-7",
    supplier_reference: "PO-42",
  };

  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(
      baseline,
      buildPurchaseReceiptMetadataDraft(baseline),
    ),
    { ok: true, changed: false },
  );
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(
      baseline,
      emptyPurchaseReceiptMetadataDraft(),
    ),
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

test("detail update requires currency only when a legacy price changes", () => {
  const baseline = {
    purchase_price: 199,
    purchase_currency: null,
  };
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(baseline, {
      ...buildPurchaseReceiptMetadataDraft(baseline),
      batchCode: "LEGACY-BATCH",
    }),
    {
      ok: true,
      changed: true,
      value: {
        purchase_price: 199,
        purchase_currency: null,
        purchase_date: null,
        batch_code: "LEGACY-BATCH",
        supplier_reference: null,
      },
    },
  );
  assert.deepEqual(
    preparePurchaseReceiptMetadataUpdate(baseline, {
      ...buildPurchaseReceiptMetadataDraft(baseline),
      pricePerRoll: "200",
    }),
    { ok: false, errors: { currency: "currency-required" } },
  );
});
