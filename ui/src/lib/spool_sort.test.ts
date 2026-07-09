import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSpoolWithMasterRows } from "./spool_row_normalization";
import { sortSpoolsAlphabetically } from "./spool_sort";
import type { SpoolWithMasterRow } from "./tauri_client";

function buildRow(
  spoolId: string,
  material: string,
  filamentName: string,
  colorName: string,
  vendor: string,
): SpoolWithMasterRow {
  return {
    spool: {
      id: spoolId,
      master_id: `master-${spoolId}`,
      qr_code: null,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: null,
      owner_contact: null,
      ownership_note: null,
      initial_weight_g: 1000,
      current_weight_g: 1000,
      remaining_g: 1000,
      spool_tare_weight_g: null,
      location_id: null,
      purchase_date: null,
      purchase_price: null,
      batch_code: null,
      last_used_at: null,
    },
    master: {
      id: `master-${spoolId}`,
      material,
      filament_name: filamentName,
      color_name: colorName,
      hex_color: null,
      product_url: null,
      default_weight: 1000,
      vendor,
    },
  };
}

test("sortSpoolsAlphabetically orders rows by material, filament, color, vendor, and spool id", () => {
  const rows = [
    buildRow("spool-10", "PLA", "Basic", "White", "Bambu Lab"),
    buildRow("spool-2", "PETG", "Translucent", "Orange", "Generic"),
    buildRow("spool-1", "PLA", "Basic", "Black", "Bambu Lab"),
    buildRow("spool-3", "PLA", "Matte", "Blue", "eSUN"),
  ];

  assert.deepEqual(
    sortSpoolsAlphabetically(rows).map((row) => row.spool.id),
    ["spool-2", "spool-1", "spool-10", "spool-3"],
  );
});

test("sortSpoolsAlphabetically keeps same-name rows stable with vendor and numeric spool fallback", () => {
  const rows = [
    buildRow("spool-10", "PLA", "Basic", "White", "Zeta"),
    buildRow("spool-2", "PLA", "Basic", "White", "Alpha"),
    buildRow("spool-1", "PLA", "Basic", "White", "Alpha"),
  ];

  assert.deepEqual(
    sortSpoolsAlphabetically(rows).map((row) => row.spool.id),
    ["spool-1", "spool-2", "spool-10"],
  );
});

test("sortSpoolsAlphabetically preserves normalized spool row fields", () => {
  const rows = normalizeSpoolWithMasterRows([
    buildRow("spool-2", "PLA", "Basic", "White", "Bambu Lab"),
    buildRow("spool-1", "PLA", "Basic", "Black", "Bambu Lab"),
  ]);
  rows[0].spool.status = "IN_USE";
  rows[0].spool.normalized_status = "ASSIGNED";

  const sortedRows = sortSpoolsAlphabetically(rows);

  assert.equal(sortedRows[1]?.spool.id, "spool-2");
  assert.equal(sortedRows[1]?.spool.normalized_status, "ASSIGNED");
});
