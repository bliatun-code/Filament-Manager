import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilamentPriceBatchInput,
  mapFilamentPriceBatchReceipt,
  mapFilamentStandardsSnapshotRows,
  refreshAfterFilamentPriceBatch,
  requireWritableFilamentStandardsSnapshot,
  settingsWithDefaultPurchaseCurrency,
  settingsWithGroupPriceDefault,
} from "./settings_filament_defaults_data_source";
import { appErrorCode, toErrorMessage } from "./error_text";
import { lookup, type DictionaryNode } from "./i18n";
import { deDictionary } from "./i18n_locales/locales/de";
import { frDictionary } from "./i18n_locales/locales/fr";
import type { FilamentStandardsSnapshot } from "./tauri_filament_standards_client";

function snapshot(): FilamentStandardsSnapshot {
  return {
    settings_valid: true,
    settings: {
      schema_version: 1,
      default_purchase_currency: "NOK",
      price_standards: [],
    },
    groups: [
      {
        group_key: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
        vendor: "Bambu Lab",
        material: "PLA",
        filament_name: "PLA Basic",
        nominal_weight_g: 1000,
        spool_count: 1,
        owned_spool_count: 1,
        borrowed_in_spool_count: 0,
        missing_price_count: 1,
        missing_currency_count: 1,
        manual_price_count: 0,
        standard_batch_price_count: 0,
        locked_count: 0,
        standard: null,
        spools: [
          {
            spool_id: "spool-white",
            master_id: "master-white",
            color_name: "Jade White",
            status: "IN_STOCK",
            ownership_type: "OWNED",
            purchase_price: null,
            purchase_currency: null,
            purchase_price_source: null,
            purchase_price_batch_locked: false,
          },
        ],
      },
    ],
  };
}

function thrownBy(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected action to throw");
}

function dictionaryTranslator(dictionary: DictionaryNode) {
  return (key: string, fallback = "") => lookup(dictionary, key) ?? fallback;
}

test("snapshot adapter preserves the authoritative group key and price provenance", () => {
  const [row] = mapFilamentStandardsSnapshotRows(snapshot());
  assert.equal(row?.groupKey, 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]');
  assert.equal(row?.spoolId, "spool-white");
  assert.equal(row?.purchasePriceSource, null);
  assert.equal(row?.batchPriceLocked, false);
});

test("saving currency and group defaults preserves the rest of the versioned settings", () => {
  const current = snapshot();
  const withCurrency = settingsWithDefaultPurchaseCurrency(current, "EUR");
  assert.equal(withCurrency.default_purchase_currency, "EUR");
  assert.deepEqual(withCurrency.price_standards, []);

  const withPrice = settingsWithGroupPriceDefault(current, {
    groupKey: current.groups[0]!.group_key,
    price: 249,
    currency: "NOK",
  });
  assert.deepEqual(withPrice.price_standards, [
    {
      group_key: current.groups[0]!.group_key,
      vendor: "Bambu Lab",
      material: "PLA",
      filament_name: "PLA Basic",
      nominal_weight_g: 1000,
      price: 249,
      currency: "NOK",
    },
  ]);
});

test("stale filament groups retain their specific guidance in German", () => {
  const current = snapshot();
  current.groups = [];
  const error = thrownBy(() =>
    settingsWithGroupPriceDefault(current, {
      groupKey: 'v1:["BAMBU LAB","PLA","PLA BASIC",1000]',
      price: 249,
      currency: "NOK",
    }),
  );

  assert.equal(appErrorCode(error), "filament_price_batch.stale_review");
  assert.equal(
    toErrorMessage(
      error,
      "Could not save the filament group price.",
      dictionaryTranslator(deDictionary),
    ),
    "Die ausgewählten Rollen haben sich geändert. Prüfe die Filament-Preisgruppe erneut.",
  );
});

test("a role-resolution race retains its specific guidance in French", () => {
  const error = thrownBy(() =>
    requireWritableFilamentStandardsSnapshot({
      clientReadOnly: false,
      roleResolved: false,
      snapshot: snapshot(),
    }),
  );

  assert.equal(appErrorCode(error), "filament_standards.role_unresolved");
  assert.equal(
    toErrorMessage(
      error,
      "Could not apply the filament prices.",
      dictionaryTranslator(frDictionary),
    ),
    "Attendez la fin du chargement du rôle de la bibliothèque, puis réessayez.",
  );
});

test("writable snapshot preconditions expose stable host-managed and loading codes", () => {
  const hostManaged = thrownBy(() =>
    requireWritableFilamentStandardsSnapshot({
      clientReadOnly: true,
      roleResolved: true,
      snapshot: snapshot(),
    }),
  );
  assert.equal(appErrorCode(hostManaged), "filament_standards.host_managed");

  const notLoaded = thrownBy(() =>
    requireWritableFilamentStandardsSnapshot({
      clientReadOnly: false,
      roleResolved: true,
      snapshot: null,
    }),
  );
  assert.equal(appErrorCode(notLoaded), "filament_standards.not_loaded");
});

test("batch adapter sends an exact stale-review precondition and maps its receipt", () => {
  const current = snapshot();
  const request = {
    groupKey: current.groups[0]!.group_key,
    mode: "MISSING_ONLY" as const,
    price: 249,
    currency: "NOK",
    spoolIds: ["spool-white"],
    historicalMissingPriceSpoolIds: [],
  };
  assert.deepEqual(buildFilamentPriceBatchInput(current, request), {
    group_key: current.groups[0]!.group_key,
    mode: "MISSING_ONLY",
    price: 249,
    currency: "NOK",
    spools: [
      {
        spool_id: "spool-white",
        expected_master_id: "master-white",
        expected_status: "IN_STOCK",
        expected_ownership_type: "OWNED",
        expected_purchase_price: null,
        expected_purchase_currency: null,
        expected_purchase_price_source: null,
        expected_purchase_price_batch_locked: false,
        allow_historical_missing_price_fill: false,
      },
    ],
  });

  const receipt = mapFilamentPriceBatchReceipt(
    {
      batch_id: "batch-1",
      mode: "MISSING_ONLY",
      group_key: current.groups[0]!.group_key,
      committed: true,
      updated_count: 0,
      skipped_count: 1,
      updated: [],
      skipped: [
        {
          spool_id: "spool-white",
          master_id: "master-white",
          color_name: "Jade White",
          reason: "BATCH_LOCKED",
        },
      ],
    },
    request,
    current,
  );
  assert.equal(receipt.committed, true);
  assert.equal(receipt.skipped[0]?.spoolLabel, "PLA Basic · Jade White");
  assert.equal(receipt.skipped[0]?.reason, "BATCH_LOCKED");
});

test("batch adapter preserves explicit historical fill intent and protected receipt state", () => {
  const current = snapshot();
  current.groups[0]!.spools[0]!.status = "EMPTY";
  const request = {
    groupKey: current.groups[0]!.group_key,
    mode: "MISSING_ONLY" as const,
    price: 249,
    currency: "NOK",
    spoolIds: ["spool-white"],
    historicalMissingPriceSpoolIds: ["spool-white"],
  };
  const input = buildFilamentPriceBatchInput(current, request);
  assert.equal(input.spools[0]?.allow_historical_missing_price_fill, true);

  const receipt = mapFilamentPriceBatchReceipt(
    {
      batch_id: "batch-historical",
      mode: "MISSING_ONLY",
      group_key: current.groups[0]!.group_key,
      committed: true,
      updated_count: 1,
      skipped_count: 0,
      updated: [
        {
          spool_id: "spool-white",
          master_id: "master-white",
          color_name: "Jade White",
          previous_purchase_price: null,
          previous_purchase_currency: null,
          purchase_price: 249,
          purchase_currency: "NOK",
          purchase_price_source: "STANDARD_BATCH",
          purchase_price_batch_locked: true,
        },
      ],
      skipped: [],
    },
    request,
    current,
  );
  assert.equal(receipt.updated[0]?.protectedFromBatchPricing, true);
});

test("post-batch refresh failures never turn a committed batch into a failed receipt", async () => {
  const current = snapshot();
  const warnings: unknown[] = [];
  const refreshed = await refreshAfterFilamentPriceBatch({
    refreshInventory: async () => {
      throw new Error("inventory refresh failed");
    },
    refreshStandards: async () => current,
    reportWarning: (reason) => warnings.push(reason),
  });

  assert.equal(refreshed, current);
  assert.equal(warnings.length, 1);

  const withoutStandards = await refreshAfterFilamentPriceBatch({
    refreshInventory: () => undefined,
    refreshStandards: async () => {
      throw new Error("standards refresh failed");
    },
    reportWarning: (reason) => warnings.push(reason),
  });
  assert.equal(withoutStandards, null);
  assert.equal(warnings.length, 2);
});
