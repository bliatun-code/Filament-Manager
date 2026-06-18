import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBambuFilamentCodeBatch,
  buildBambuFilamentCodeBatchCreateState,
} from "./bambu_filament_code_batch";
import type { MasterCatalogRow } from "./tauri_client";

function master(overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Black (10101)",
    hex_color: "#000000",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

test("buildBambuFilamentCodeBatch creates rows for pasted and scanner-style code lists", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "yellow", filament_name: "TPU for AMS", color_name: "Yellow (53400)" }),
      master({ id: "blue", filament_name: "PLA Basic", color_name: "Blue (53600)" }),
    ],
    rawInput: "Filament Code: 53400\n53600, scanned",
  });

  assert.deepEqual(
    batch.rows.map((row) => row.code),
    ["53400", "53600"],
  );
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["yellow", "blue"],
  );
  assert.equal(batch.blockedRows.length, 0);
});

test("buildBambuFilamentCodeBatch keeps duplicates as separate stock rows", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [master({ id: "yellow", color_name: "Yellow (53400)" })],
    rawInput: "53400\n53400",
  });

  assert.equal(batch.rows.length, 2);
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["yellow", "yellow"],
  );
});

test("buildBambuFilamentCodeBatch creates the active row when a code has discontinued history", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({
        id: "old-yellow",
        filament_name: "PLA Basic",
        color_name: "Old Yellow (53400)",
        is_discontinued: true,
      }),
      master({
        id: "active-yellow",
        filament_name: "TPU for AMS",
        color_name: "Yellow (53400)",
      }),
    ],
    rawInput: "53400",
  });

  assert.equal(batch.rows[0]?.lookup.status, "single_active");
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["active-yellow"],
  );
  assert.equal(batch.blockedRows.length, 0);
});

test("buildBambuFilamentCodeBatch blocks ambiguous, discontinued-only, missing, and invalid rows", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "petg-black", material: "PETG", color_name: "Black (65103)" }),
      master({ id: "pla-black", material: "PLA", color_name: "Black (65103)" }),
      master({ id: "old", color_name: "Old (12345)", is_discontinued: true }),
    ],
    rawInput: "65103\n12345\n99999\nnot a code",
  });

  assert.equal(batch.creatableRows.length, 0);
  assert.deepEqual(
    batch.blockedRows.map((row) => row.lookup.status),
    ["multiple_active", "discontinued_only", "no_match", "no_code"],
  );
});

test("buildBambuFilamentCodeBatchCreateState reports ready, partial, and borrowed-in blockers", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "yellow", color_name: "Yellow (53400)" }),
      master({ id: "petg-black", material: "PETG", color_name: "Black (65103)" }),
      master({ id: "pla-black", material: "PLA", color_name: "Black (65103)" }),
    ],
    rawInput: "53400\n65103",
  });

  assert.deepEqual(
    buildBambuFilamentCodeBatchCreateState({
      batch,
      tauriAvailable: true,
      busy: false,
      isBambuMode: true,
      borrowedOwnerRequired: false,
    }),
    {
      disabled: false,
      reason: null,
      readyCount: 1,
      reviewCount: 1,
      totalCount: 2,
      partial: true,
    },
  );

  assert.equal(
    buildBambuFilamentCodeBatchCreateState({
      batch,
      tauriAvailable: true,
      busy: false,
      isBambuMode: true,
      borrowedOwnerRequired: true,
    }).reason,
    "borrowed_owner_required",
  );
  assert.equal(
    buildBambuFilamentCodeBatchCreateState({
      batch: buildBambuFilamentCodeBatch({ masters: [], rawInput: "99999" }),
      tauriAvailable: true,
      busy: false,
      isBambuMode: true,
      borrowedOwnerRequired: false,
    }).reason,
    "no_ready_rows",
  );
});
