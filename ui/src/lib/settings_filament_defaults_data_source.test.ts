import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFilamentPriceBatchInput,
  mapFilamentPriceBatchReceipt,
  mapFilamentStandardsSnapshotRows,
  refreshAfterFilamentPriceBatch,
  settingsWithDefaultPurchaseCurrency,
  settingsWithGroupPriceDefault,
} from "./settings_filament_defaults_data_source";
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

test("batch adapter sends an exact stale-review precondition and maps its receipt", () => {
  const current = snapshot();
  const request = {
    groupKey: current.groups[0]!.group_key,
    mode: "MISSING_ONLY" as const,
    price: 249,
    currency: "NOK",
    spoolIds: ["spool-white"],
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
