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
      initial_weight_g: 900,
      current_weight_g: 850,
      remaining_g: 842,
      spool_tare_weight_g: 221,
      location_id: "location-a",
      home_location_id: "location-home",
      qr_code: "QR-1",
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2026-08-21",
      batch_code: "LOT-7",
      supplier_reference: "PO-42",
      purchase_price_batch_locked: true,
      purchase_price_source: "STANDARD_BATCH",
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      default_weight: 900,
      vendor: "Bambu",
    },
    location_name: "Shelf A",
    location_type: "GENERIC",
    home_location_name: "Home Shelf",
    home_location_type: "GENERIC",
  };

  return {
    ...row,
    ...overrides,
    spool: { ...row.spool, ...overrides.spool },
    master: { ...row.master, ...overrides.master },
  };
}

test("buildInventoryExportCsv writes stable inventory headers and values", () => {
  assert.equal(
    buildInventoryExportCsv(normalizeSpoolWithMasterRows([createRow()])),
    [
      "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source",
      "spool-1,PLA,Basic PLA,Blue,Bambu,IN_STOCK,OWNED,,,,900,850,842,221,Shelf A,location-a,Shelf A,GENERIC,location-home,Home Shelf,GENERIC,QR-1,249.5,NOK,2026-08-21,LOT-7,PO-42,true,STANDARD_BATCH",
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
        qr_code: null,
        remaining_g: null,
        batch_code: "line 1\rline 2",
        supplier_reference: " PO-42 ",
      },
      location_name: "Shelf\nA",
    }),
  ]);

  assert.equal(
    buildInventoryExportCsv(rows),
    [
      "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source",
      'spool-1,PLA,"PLA, Matte","Ocean ""Blue""",Bambu,IN_STOCK,OWNED,,,,900,850,0,221,"Shelf\nA",location-a,"Shelf\nA",GENERIC,location-home,Home Shelf,GENERIC,,249.5,NOK,2026-08-21,"line 1\rline 2"," PO-42 ",true,STANDARD_BATCH',
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
        vendor: "Bambu",
        status: "IN_STOCK",
        ownership_type: "OWNED",
        owner_name: null,
        owner_contact: null,
        ownership_note: null,
        initial_weight_g: 900,
        current_weight_g: 850,
        remaining_g: 842,
        spool_tare_weight_g: 221,
        location: "Shelf A",
        location_id: "location-a",
        location_name: "Shelf A",
        location_type: "GENERIC",
        home_location_id: "location-home",
        home_location_name: "Home Shelf",
        home_location_type: "GENERIC",
        qr_code: "QR-1",
        purchase_price: 249.5,
        purchase_currency: "NOK",
        purchase_date: "2026-08-21",
        batch_code: "LOT-7",
        supplier_reference: "PO-42",
        purchase_price_batch_locked: true,
        purchase_price_source: "STANDARD_BATCH",
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
      "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source",
      "spool-1,PLA,Basic PLA,Blue,Bambu,BORROWED,OWNED,,,,900,850,842,221,Shelf A,location-a,Shelf A,GENERIC,location-home,Home Shelf,GENERIC,QR-1,249.5,NOK,2026-08-21,LOT-7,PO-42,true,STANDARD_BATCH",
    ].join("\n"),
  );
  assert.deepEqual(JSON.parse(buildInventoryExportJson(normalizedRows)), [
    {
      spool_id: "spool-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      vendor: "Bambu",
      status: "BORROWED",
      ownership_type: "OWNED",
      owner_name: null,
      owner_contact: null,
      ownership_note: null,
      initial_weight_g: 900,
      current_weight_g: 850,
      remaining_g: 842,
      spool_tare_weight_g: 221,
      location: "Shelf A",
      location_id: "location-a",
      location_name: "Shelf A",
      location_type: "GENERIC",
      home_location_id: "location-home",
      home_location_name: "Home Shelf",
      home_location_type: "GENERIC",
      qr_code: "QR-1",
      purchase_price: 249.5,
      purchase_currency: "NOK",
      purchase_date: "2026-08-21",
      batch_code: "LOT-7",
      supplier_reference: "PO-42",
      purchase_price_batch_locked: true,
      purchase_price_source: "STANDARD_BATCH",
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
      currentWeightGrams: 0,
      spoolTareWeightGrams: 230,
      status: "EMPTY",
      ownershipType: "BORROWED_IN",
      ownerName: "Mina",
      ownerContact: "mina@example.test",
      ownershipNote: "Need, dry",
      remainingGrams: 0,
      location: "Renamed shelf",
      locationId: "location-a",
      locationType: "GENERIC",
      homeLocation: "Home shelf",
      homeLocationId: "location-home",
      homeLocationType: "GENERIC",
      qrCode: "QR-A",
      purchasePrice: 199,
      purchaseCurrency: "EUR",
      purchaseDate: "2026-08-20",
      batchCode: "BATCH-A",
      supplierReference: "ORDER-A",
      purchasePriceBatchLocked: true,
      purchasePriceSource: "MANUAL",
    },
  ];

  assert.equal(
    buildInventorySpoolExportCsv(selected),
    [
      "spool_id,material,filament_name,color_name,vendor,status,ownership_type,owner_name,owner_contact,ownership_note,initial_weight_g,current_weight_g,remaining_g,spool_tare_weight_g,location,location_id,location_name,location_type,home_location_id,home_location_name,home_location_type,qr_code,purchase_price,purchase_currency,purchase_date,batch_code,supplier_reference,purchase_price_batch_locked,purchase_price_source",
      'spool-a,PLA,"Basic, Matte",Blue,Bambu,EMPTY,BORROWED_IN,Mina,mina@example.test,"Need, dry",1000,0,0,230,Renamed shelf,location-a,Renamed shelf,GENERIC,location-home,Home shelf,GENERIC,QR-A,199,EUR,2026-08-20,BATCH-A,ORDER-A,true,MANUAL',
    ].join("\n"),
  );
  assert.deepEqual(JSON.parse(buildInventorySpoolExportJson(selected)), [
    {
      spool_id: "spool-a",
      material: "PLA",
      filament_name: "Basic, Matte",
      color_name: "Blue",
      vendor: "Bambu",
      status: "EMPTY",
      ownership_type: "BORROWED_IN",
      owner_name: "Mina",
      owner_contact: "mina@example.test",
      ownership_note: "Need, dry",
      initial_weight_g: 1000,
      current_weight_g: 0,
      remaining_g: 0,
      spool_tare_weight_g: 230,
      location: "Renamed shelf",
      location_id: "location-a",
      location_name: "Renamed shelf",
      location_type: "GENERIC",
      home_location_id: "location-home",
      home_location_name: "Home shelf",
      home_location_type: "GENERIC",
      qr_code: "QR-A",
      purchase_price: 199,
      purchase_currency: "EUR",
      purchase_date: "2026-08-20",
      batch_code: "BATCH-A",
      supplier_reference: "ORDER-A",
      purchase_price_batch_locked: true,
      purchase_price_source: "MANUAL",
    },
  ]);
});
