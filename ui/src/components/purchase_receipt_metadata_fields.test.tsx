import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PurchaseReceiptMetadataFields,
} from "./purchase_receipt_metadata_fields";
import type { PurchaseReceiptMetadataFieldsCopy } from "../lib/purchase_receipt_metadata_copy";
import { emptyPurchaseReceiptMetadataDraft } from "../lib/purchase_receipt_metadata";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const copy: PurchaseReceiptMetadataFieldsCopy = {
  title: "Receipt details",
  appliesToQuantity: (quantity) =>
    `These details are saved to each of the ${quantity} received rolls.`,
  optional: "(optional)",
  pricePerRollLabel: "Price per roll",
  pricePerRollHint: "Enter the unit price, not the order total.",
  currencyLabel: "Currency",
  currencyHint: "Three-letter code, for example NOK or EUR.",
  purchaseDateLabel: "Purchase date",
  batchCodeLabel: "Batch",
  supplierReferenceLabel: "Supplier reference",
  validationMessages: {
    "price-invalid": "Enter a finite price.",
    "price-negative": "Price cannot be negative.",
    "currency-required": "Currency is required when a price is entered.",
    "currency-invalid": "Use a three-letter currency code.",
    "currency-without-price": "Enter a price or clear the currency.",
    "purchase-date-invalid": "Enter a real calendar date.",
    "batch-code-too-long": "Batch is too long.",
    "supplier-reference-too-long": "Supplier reference is too long.",
  },
};

function renderFields(
  overrides: Partial<React.ComponentProps<typeof PurchaseReceiptMetadataFields>> = {},
) {
  return renderToStaticMarkup(
    <PurchaseReceiptMetadataFields
      copy={copy}
      draft={emptyPurchaseReceiptMetadataDraft()}
      onChange={() => {}}
      selectedQuantity={3}
      {...overrides}
    />,
  );
}

function inputTag(html: string, name: string): string {
  const match = new RegExp(`<input[^>]*name="${name}"[^>]*>`).exec(html);
  assert.ok(match, `missing ${name} input`);
  return match[0];
}

test("receipt fields make per-roll pricing and shared selected-quantity semantics explicit", () => {
  const html = renderFields();

  assert.match(html, /<fieldset[^>]*aria-describedby=/);
  assert.match(html, />Receipt details</);
  assert.match(html, /saved to each of the 3 received rolls/);
  assert.match(html, />Price per roll/);
  assert.match(html, /unit price, not the order total/);
  assert.match(inputTag(html, "purchase_price"), /type="number"/);
  assert.match(inputTag(html, "purchase_price"), /min="0"/);
  assert.match(inputTag(html, "purchase_currency"), /maxLength="3"/);
  assert.match(inputTag(html, "purchase_date"), /type="date"/);
  assert.doesNotMatch(inputTag(html, "batch_code"), /maxLength=/);
  assert.doesNotMatch(inputTag(html, "supplier_reference"), /maxLength=/);
  assert.doesNotMatch(inputTag(html, "purchase_currency"), /required=""/);
});

test("currency becomes required with a price and validation errors are accessible", () => {
  const html = renderFields({
    draft: {
      ...emptyPurchaseReceiptMetadataDraft(),
      pricePerRoll: "249.50",
    },
    errors: {
      currency: "currency-required",
      purchaseDate: "purchase-date-invalid",
    },
  });

  assert.match(inputTag(html, "purchase_currency"), /required=""/);
  assert.match(inputTag(html, "purchase_currency"), /aria-invalid="true"/);
  assert.match(inputTag(html, "purchase_date"), /aria-invalid="true"/);
  assert.equal((html.match(/role="alert"/g) ?? []).length, 2);
  assert.match(html, /Currency is required when a price is entered/);
  assert.match(html, /Enter a real calendar date/);
});

test("unchanged legacy detail price keeps currency optional for assistive technology", () => {
  const html = renderFields({
    draft: {
      ...emptyPurchaseReceiptMetadataDraft(),
      pricePerRoll: "199",
    },
    legacyCurrencylessPriceUnchanged: true,
  });

  assert.doesNotMatch(inputTag(html, "purchase_currency"), /required=""/);
  assert.match(html, />Currency[\s\S]*\(optional\)/i);
});

test("disabled receipt metadata uses native fieldset semantics for every field", () => {
  const html = renderFields({ disabled: true });
  assert.match(html, /<fieldset[^>]*disabled=""/);
});
