import test from "node:test";
import assert from "node:assert/strict";

import {
  formatInventoryHistoryEventDetails,
  formatInventoryHistoryEventType,
} from "./inventory_history";

const formatterDeps = {
  t: (_key: string, fallback: string) => fallback,
  formatDateTime: (raw: string) => raw,
  formatStatusLabel: (status: string) => status,
  locale: "en" as const,
  printerNameById: new Map<string, string>(),
  slotLabelById: new Map<string, string>(),
};

test("accepted AMS weight history uses a localized source label", () => {
  const details = formatInventoryHistoryEventDetails(
    {
      id: "history-1",
      spool_id: "spool-1",
      event_type: "WEIGHT_UPDATED",
      payload_json: {
        grams: 843,
        source: "BAMBU_AMS_ACCEPTED",
      },
      created_at: "2026-08-15T10:00:00Z",
    },
    {
      t: (key, fallback) =>
        key === "settings.bambuLiveAmsWeightEstimate" ? "AMS-estimat" : fallback,
      formatDateTime: (raw) => raw,
      formatStatusLabel: (status) => status,
      locale: "nb",
      printerNameById: new Map(),
      slotLabelById: new Map(),
    },
  );

  assert.match(details, /AMS-estimat/);
  assert.doesNotMatch(details, /BAMBU_AMS_ACCEPTED|BAMBU AMS ACCEPTED/);
});

test("purchase receipt history presents nested metadata as readable fields", () => {
  assert.equal(
    formatInventoryHistoryEventType(
      "PURCHASE_RECEIPT_RECORDED",
      (_key, fallback) => fallback,
    ),
    "Purchase receipt recorded",
  );
  const details = formatInventoryHistoryEventDetails(
    {
      id: "history-purchase-1",
      spool_id: "spool-1",
      event_type: "PURCHASE_RECEIPT_RECORDED",
      payload_json: {
        wishlist_item_id: "wish-1",
        initial_weight_g: 1000,
        purchase_metadata: {
          purchase_price: 249.5,
          purchase_currency: "NOK",
          purchase_date: "2026-08-21",
          batch_code: "LOT-7",
          supplier_reference: "PO-42",
        },
      },
      created_at: "2026-08-21T10:00:00Z",
    },
    formatterDeps,
  );

  assert.match(details, /Price per roll: 249\.5 NOK/);
  assert.match(details, /Purchase date: 2026-08-21/);
  assert.match(details, /Batch code: LOT-7/);
  assert.match(details, /Supplier reference: PO-42/);
  assert.match(details, /Initial weight \(g\): 1,000 g/);
  assert.doesNotMatch(details, /wishlist_item_id|purchase_metadata|\{/);
});

test("purchase metadata update history shows changed values and explicit clearing", () => {
  assert.equal(
    formatInventoryHistoryEventType(
      "PURCHASE_METADATA_UPDATED",
      (_key, fallback) => fallback,
    ),
    "Purchase details updated",
  );
  const details = formatInventoryHistoryEventDetails(
    {
      id: "history-purchase-2",
      spool_id: "spool-1",
      event_type: "PURCHASE_METADATA_UPDATED",
      payload_json: {
        before: {
          purchase_price: 249.5,
          purchase_currency: "NOK",
          purchase_date: "2026-08-21",
          batch_code: "LOT-7",
          supplier_reference: "PO-42",
        },
        after: {
          purchase_price: null,
          purchase_currency: null,
          purchase_date: "2026-08-22",
          batch_code: null,
          supplier_reference: null,
        },
      },
      created_at: "2026-08-22T10:00:00Z",
    },
    formatterDeps,
  );

  assert.match(details, /Price per roll: 249\.5 NOK → —/);
  assert.match(details, /Purchase date: 2026-08-21 → 2026-08-22/);
  assert.match(details, /Batch code: LOT-7 → —/);
  assert.match(details, /Supplier reference: PO-42 → —/);
  assert.doesNotMatch(details, /"before"|"after"|\{/);
});
