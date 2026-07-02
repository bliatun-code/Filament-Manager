import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInventoryExportCsv,
  buildInventoryExportJson,
} from "./inventory_export";
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
    buildInventoryExportCsv([createRow()]),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code",
      "spool-1,PLA,Basic PLA,Blue,IN_STOCK,842,Shelf A,QR-1",
    ].join("\n"),
  );
});

test("buildInventoryExportCsv escapes commas, quotes, and newlines", () => {
  assert.equal(
    buildInventoryExportCsv([
      createRow({
        master: {
          filament_name: "PLA, Matte",
          color_name: 'Ocean "Blue"',
        },
        spool: {
          location_id: "Shelf\nA",
          qr_code: null,
          remaining_g: null,
        },
      }),
    ]),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code",
      'spool-1,PLA,"PLA, Matte","Ocean ""Blue""",IN_STOCK,0,"Shelf\nA",',
    ].join("\n"),
  );
});

test("buildInventoryExportJson mirrors the settings export payload", () => {
  assert.deepEqual(JSON.parse(buildInventoryExportJson([createRow()])), [
    {
      spool_id: "spool-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      status: "IN_STOCK",
      remaining_g: 842,
      location: "Shelf A",
      qr_code: "QR-1",
    },
  ]);
});

test("inventory export normalizes legacy spool status values", () => {
  const legacyRow = createRow({ spool: { status: "loaned out" } });

  assert.equal(
    buildInventoryExportCsv([legacyRow]),
    [
      "spool_id,material,filament_name,color_name,status,remaining_g,location,qr_code",
      "spool-1,PLA,Basic PLA,Blue,BORROWED,842,Shelf A,QR-1",
    ].join("\n"),
  );
  assert.deepEqual(JSON.parse(buildInventoryExportJson([legacyRow])), [
    {
      spool_id: "spool-1",
      material: "PLA",
      filament_name: "Basic PLA",
      color_name: "Blue",
      status: "BORROWED",
      remaining_g: 842,
      location: "Shelf A",
      qr_code: "QR-1",
    },
  ]);
  assert.equal(legacyRow.spool.status, "loaned out");
});
