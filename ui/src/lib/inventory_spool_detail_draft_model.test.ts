import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInventorySpoolDetailDraftBaseline,
  inventorySpoolCommonDetailsDraftChanged,
  inventorySpoolMasterMetadataDraftChanged,
  parseInventorySpoolCommonDetailsDraft,
} from "./inventory_spool_detail_draft_model";
import type { InventorySpool } from "./inventory_list_model";

function spool(overrides: Partial<InventorySpool> = {}): InventorySpool {
  return {
    id: "spool-1",
    masterId: "master-1",
    vendor: "Bambu Lab",
    material: "PLA",
    filamentName: "Basic",
    colorName: "Jade White",
    hexColor: "#FFFFFF",
    initialWeightGrams: 1000,
    status: "IN_STOCK",
    ownershipType: "OWNED",
    remainingGrams: 700,
    spoolTareWeightGrams: 250,
    homeLocation: "Shelf A",
    ...overrides,
  };
}

test("common detail dirty comparison normalizes harmless whitespace and owned-only fields", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(spool()).common;
  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(baseline, {
      ...baseline,
      homeLocation: "  Shelf A  ",
      ownerName: "ignored for owned rolls",
      tareWeight: "0250",
    }),
    false,
  );
});

test("common detail parsing fails closed for invalid tare and missing borrowed-in owner", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(spool()).common;
  assert.deepEqual(
    parseInventorySpoolCommonDetailsDraft({ ...baseline, tareWeight: "250.5" }),
    { ok: false, error: "invalid-tare-weight" },
  );
  assert.deepEqual(
    parseInventorySpoolCommonDetailsDraft({
      ...baseline,
      ownershipType: "BORROWED_IN",
      ownerName: " ",
    }),
    { ok: false, error: "borrowed-owner-required" },
  );
});

test("detail baseline captures borrowed-in counterparty and detects real common changes", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(
    spool({
      ownershipType: "BORROWED_IN",
      ownerName: "Ada",
      ownerContact: "ada@example.test",
      ownershipNote: "Return Friday",
    }),
  );
  assert.equal(baseline.common.ownerName, "Ada");
  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(baseline.common, {
      ...baseline.common,
      homeLocation: "Shelf B",
    }),
    true,
  );
});

test("detail baseline captures purchase metadata and includes it in the dirty guard", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(
    spool({
      purchasePrice: 249.5,
      purchaseCurrency: "NOK",
      purchaseDate: "2026-08-21",
      batchCode: "LOT-7",
      supplierReference: "PO-42",
    }),
  );

  assert.deepEqual(baseline.common.purchaseMetadata, {
    pricePerRoll: "249.5",
    currency: "NOK",
    purchaseDate: "2026-08-21",
    batchCode: "LOT-7",
    supplierReference: "PO-42",
  });
  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(baseline.common, {
      ...baseline.common,
      purchaseMetadata: {
        ...baseline.common.purchaseMetadata,
        supplierReference: "PO-43",
      },
    }),
    true,
  );
});

test("detail baseline defaults legacy price protection off and tracks lock changes", () => {
  const legacyBaseline = buildInventorySpoolDetailDraftBaseline(
    spool({ purchasePriceBatchLocked: undefined }),
  ).common;
  const lockedBaseline = buildInventorySpoolDetailDraftBaseline(
    spool({ purchasePriceBatchLocked: true }),
  ).common;

  assert.equal(legacyBaseline.purchasePriceBatchLocked, false);
  assert.equal(lockedBaseline.purchasePriceBatchLocked, true);
  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(legacyBaseline, {
      ...legacyBaseline,
      purchasePriceBatchLocked: true,
    }),
    true,
  );
});

test("legacy currency-less prices stay clean until their numeric value changes", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(
    spool({ purchasePrice: 199, purchaseCurrency: null }),
  ).common;

  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(baseline, {
      ...baseline,
      purchaseMetadata: { ...baseline.purchaseMetadata, pricePerRoll: "199.0" },
    }),
    false,
  );
  assert.equal(
    inventorySpoolCommonDetailsDraftChanged(baseline, {
      ...baseline,
      purchaseMetadata: { ...baseline.purchaseMetadata, pricePerRoll: "200" },
    }),
    true,
  );
});

test("metadata dirty comparison treats casing in hex values and whitespace as presentation only", () => {
  const baseline = buildInventorySpoolDetailDraftBaseline(spool()).master;
  assert.equal(
    inventorySpoolMasterMetadataDraftChanged(baseline, {
      ...baseline,
      vendor: " Bambu Lab ",
      hexColor: "#ffffff",
    }),
    false,
  );
  assert.equal(
    inventorySpoolMasterMetadataDraftChanged(baseline, {
      ...baseline,
      colorName: "Black",
    }),
    true,
  );
});
