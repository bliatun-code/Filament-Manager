import test from "node:test";
import assert from "node:assert/strict";

import {
  formatInventoryHistoryEventDetails,
  formatInventoryHistoryEventType,
} from "./inventory_history";
import { loadLocaleDictionary, lookup } from "./i18n";
import type { DictionaryNode, Locale } from "./i18n";

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

test("price-standard, price-protection and location-merge history stay semantic and localized", async () => {
  const localeDictionaries = new Map<Locale, DictionaryNode>();
  for (const locale of ["en", "nb", "de", "fr", "es"] as const) {
    localeDictionaries.set(locale, await loadLocaleDictionary(locale));
  }
  const translate = (locale: Locale) => (key: string, fallback: string) =>
    lookup(localeDictionaries.get(locale)!, key) ?? fallback;

  assert.equal(
    formatInventoryHistoryEventType("PURCHASE_PRICE_STANDARD_APPLIED", translate("en")),
    "Group price applied",
  );
  assert.equal(
    formatInventoryHistoryEventType("PURCHASE_PRICE_STANDARD_APPLIED", translate("nb")),
    "Gruppepris brukt",
  );
  assert.equal(
    formatInventoryHistoryEventType("PURCHASE_PRICE_STANDARD_APPLIED", translate("de")),
    "Gruppenpreis angewendet",
  );
  assert.equal(
    formatInventoryHistoryEventType("PURCHASE_PRICE_STANDARD_APPLIED", translate("fr")),
    "Prix de groupe appliqué",
  );
  assert.equal(
    formatInventoryHistoryEventType("PURCHASE_PRICE_STANDARD_APPLIED", translate("es")),
    "Group price applied",
    "draft locales inherit new history copy from the maintained English dictionary",
  );

  const norwegianDeps = {
    ...formatterDeps,
    t: translate("nb"),
    formatStatusLabel: (status: string) => (status === "EMPTY" ? "Tom" : status),
    locale: "nb" as const,
  };
  const priceDetails = formatInventoryHistoryEventDetails(
    {
      id: "history-price-standard",
      spool_id: "spool-1",
      event_type: "PURCHASE_PRICE_STANDARD_APPLIED",
      payload_json: {
        mode: "MISSING_ONLY",
        group_key: "technical-group-key",
        before: {
          purchase_price: null,
          purchase_currency: null,
          purchase_price_source: null,
          purchase_price_batch_locked: false,
        },
        after: {
          purchase_price: 349,
          purchase_currency: "NOK",
          purchase_price_source: "STANDARD_BATCH",
          purchase_price_batch_locked: false,
        },
      },
      created_at: "2026-08-25T10:00:00Z",
    },
    norwegianDeps,
  );
  assert.match(priceDetails, /Pris per rull: — → 349 NOK/);
  assert.match(priceDetails, /Prisoppdatering: Bare manglende priser/);
  assert.doesNotMatch(priceDetails, /group_key|purchase_price_source|\{|\}/);

  const protectionDetails = formatInventoryHistoryEventDetails(
    {
      id: "history-price-protection",
      spool_id: "spool-1",
      event_type: "PURCHASE_PRICE_BATCH_LOCK_UPDATED",
      payload_json: {
        before: false,
        after: true,
        reason: "HISTORICAL_STATUS",
        status: "EMPTY",
        source: "STARTUP_BACKFILL",
      },
      created_at: "2026-08-25T10:01:00Z",
    },
    norwegianDeps,
  );
  assert.match(protectionDetails, /Beskyttelse mot gruppepris: Av → På/);
  assert.match(protectionDetails, /Status: Tom/);
  assert.doesNotMatch(protectionDetails, /HISTORICAL_STATUS|STARTUP_BACKFILL|\{|\}/);

  const locationDetails = formatInventoryHistoryEventDetails(
    {
      id: "history-location-merge",
      spool_id: "spool-1",
      event_type: "LOCATION_MERGED",
      payload_json: {
        source_location_id: "location-source",
        source_location_name: "Hylle xx",
        target_location_id: "location-target",
        target_location_name: "Hylle 1",
        moved_current_location: true,
        moved_home_location: false,
      },
      created_at: "2026-08-25T10:02:00Z",
    },
    norwegianDeps,
  );
  assert.equal(locationDetails, "Lokasjon: Hylle xx → Hylle 1");
  assert.doesNotMatch(locationDetails, /location-source|location-target|\{|\}/);
});
