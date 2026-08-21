import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInventoryExportCsv,
  buildInventoryExportJson,
  buildInventorySpoolExportCsv,
  buildInventorySpoolExportJson,
} from "./inventory_export";
import type { InventorySpool } from "./inventory_list_model";
import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import type { SpoolWithMasterRow } from "./tauri_client";

function createRow(overrides: Partial<SpoolWithMasterRow> = {}): SpoolWithMasterRow {
  const row: SpoolWithMasterRow = {
    spool: {
      id: "spool-1",
      master_id: "master-1",
      status: "IN_STOCK",
      remaining_g: 842,
      location_id: "Shelf A",
      qr_code: "QR-1",
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2026-08-21",
      batch_code: "LOT-7",
      supplier_reference: "PO-42",
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      default_weight: 1000,
      vendor: "Bambu",
    },
  };

  return {
    spool: { ...row.spool, ...overrides.spool },
    master: { ...row.master, ...overrides.master },
  };
}

test("buildInventoryExportCsv writes stable inventory headers and values", () => {
  assert.equal(
    buildInventoryExportCsv(normalizeSpoolWithMasterRows([createRow()])),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference",
      "spool-1,PLA,Basic PLA,Blue,IN_STOCK,842,Shelf A,QR-1,249.5,NOK,2026-08-21,LOT-7,PO-42",
    ].join("\n"),
  );
});

test("buildInventoryExportCsv escapes delimiters, newlines, and edge whitespace", () => {
  const rows = normalizeSpoolWithMasterRows([
    createRow({
      master: {
        filament_name: "PLA, Matte",
        color_name: 'Ocean "Blue"',
      },
      spool: {
        location_id: "Shelf\nA",
        qr_code: null,
        remaining_g: null,
        batch_code: "line 1\rline 2",
        supplier_reference: " PO-42 ",
      },
    }),
  ]);

  assert.equal(
    buildInventoryExportCsv(rows),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference",
      'spool-1,PLA,"PLA, Matte","Ocean ""Blue""",IN_STOCK,0,"Shelf\nA",,249.5,NOK,2026-08-21,"line 1\rline 2"," PO-42 "',
    ].join("\n"),
  );
});

test("buildInventoryExportJson mirrors the settings export payload", () => {
  assert.deepEqual(
    JSON.parse(buildInventoryExportJson(normalizeSpoolWithMasterRows([createRow()]))),
    [
      {
        spool_id: "spool-1",
        material: "PLA",
        filament_name: "Basic PLA",
        color_name: "Blue",
        status: "IN_STOCK",
        remaining_g: 842,
        location: "Shelf A",
        qr_code: "QR-1",
        purchase_price: 249.5,
        purchase_currency: "NOK",
        purchase_date: "2026-08-21",
        batch_code: "LOT-7",
        supplier_reference: "PO-42",
      },
    ],
  );
});

test("inventory export normalizes legacy spool status values", () => {
  const legacyRow = createRow({ spool: { status: "loaned out" } });
  const normalizedRows = normalizeSpoolWithMasterRows([legacyRow]);
  const normalizedRow = normalizedRows[0];
  assert.ok(normalizedRow);
  normalizedRow.spool.status = "IN_STOCK";

  assert.equal(
    buildInventoryExportCsv(normalizedRows),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference",
      "spool-1,PLA,Basic PLA,Blue,BORROWED,842,Shelf A,QR-1,249.5,NOK,2026-08-21,LOT-7,PO-42",
    ].join("\n"),
  );
  assert.deepEqual(JSON.parse(buildInventoryExportJson(normalizedRows)), [
    {
      spool_id: "spool-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      status: "BORROWED",
      remaining_g: 842,
      location: "Shelf A",
      qr_code: "QR-1",
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2026-08-21",
      batch_code: "LOT-7",
      supplier_reference: "PO-42",
    },
  ]);
  assert.equal(legacyRow.spool.status, "loaned out");
});

test("selected inventory-spool export preserves only the resolved plan rows", () => {
  const selected: InventorySpool[] = [
    {
      id: "spool-a",
      masterId: "master-a",
      vendor: "Bambu",
      material: "PLA",
      filamentName: "Basic, Matte",
      colorName: "Blue",
      initialWeightGrams: 1000,
      status: "EMPTY",
      ownershipType: "OWNED",
      remainingGrams: 0,
      location: "Renamed shelf",
      locationId: "location-a",
      qrCode: "QR-A",
      purchasePrice: 199,
      purchaseCurrency: "EUR",
      purchaseDate: "2026-08-20",
      batchCode: "BATCH-A",
      supplierReference: "ORDER-A",
    },
  ];

  assert.equal(
    buildInventorySpoolExportCsv(selected),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference",
      'spool-a,PLA,"Basic, Matte",Blue,EMPTY,0,location-a,QR-A,199,EUR,2026-08-20,BATCH-A,ORDER-A',
    ].join("\n"),
  );
  assert.deepEqual(JSON.parse(buildInventorySpoolExportJson(selected)), [
    {
      spool_id: "spool-a",
      material: "PLA",
      filament_name: "Basic, Matte",
      color_name: "Blue",
      status: "EMPTY",
      remaining_g: 0,
      location: "location-a",
      qr_code: "QR-A",
      purchase_price: 199,
      purchase_currency: "EUR",
      purchase_date: "2026-08-20",
      batch_code: "BATCH-A",
      supplier_reference: "ORDER-A",
    },
  ]);
});
