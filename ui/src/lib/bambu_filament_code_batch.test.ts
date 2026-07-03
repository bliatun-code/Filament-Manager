import assert from "node:assert/strict";
import test from "node:test";

import {
  appendBambuFilamentCodeBatchScanInput,
  appendBambuFilamentCodeBatchScanValues,
  appendBambuFilamentCodeBatchScanValuesOnce,
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

test("buildBambuFilamentCodeBatch creates single discontinued-only rows as old stock", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({
        id: "old-black",
        filament_name: "PETG Basic",
        color_name: "Black (65103)",
        is_discontinued: true,
      }),
    ],
    rawInput: "65103",
  });

  assert.equal(batch.rows[0]?.lookup.status, "discontinued_only");
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["old-black"],
  );
  assert.equal(batch.blockedRows.length, 0);
});

test("buildBambuFilamentCodeBatch blocks ambiguous, multiple discontinued, missing, and invalid rows", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "petg-black", material: "PETG", color_name: "Black (65103)" }),
      master({ id: "pla-black", material: "PLA", color_name: "Black (65103)" }),
      master({ id: "old-petg", material: "PETG", color_name: "Old (12345)", is_discontinued: true }),
      master({ id: "old-pla", material: "PLA", color_name: "Old (12345)", is_discontinued: true }),
    ],
    rawInput: "65103\n12345\n99999\nnot a code",
  });

  assert.equal(batch.creatableRows.length, 0);
  assert.deepEqual(
    batch.blockedRows.map((row) => row.lookup.status),
    ["multiple_active", "discontinued_only", "no_match", "no_code"],
  );
});

test("buildBambuFilamentCodeBatch creates a review row after a manual catalog selection", () => {
  const masters = [
    master({
      id: "old-petg",
      material: "PETG",
      filament_name: "PETG Basic",
      color_name: "Black (65103)",
      is_discontinued: true,
    }),
    master({
      id: "old-pla",
      material: "PLA",
      filament_name: "PLA Basic",
      color_name: "Black (65103)",
      is_discontinued: true,
    }),
  ];
  const pending = buildBambuFilamentCodeBatch({
    masters,
    rawInput: "65103",
  });
  const rowKey = pending.rows[0]?.key;

  assert.equal(pending.rows[0]?.lookup.status, "discontinued_only");
  assert.deepEqual(
    pending.rows[0]?.selectionMatches.map((match) => match.id),
    ["old-petg", "old-pla"],
  );
  assert.equal(pending.creatableRows.length, 0);
  assert.equal(pending.blockedRows.length, 1);
  assert.ok(rowKey);

  const selected = buildBambuFilamentCodeBatch({
    masters,
    rawInput: "65103",
    selectedMasterIds: { [rowKey]: "old-petg" },
  });

  assert.deepEqual(
    selected.creatableRows.map((row) => row.master?.id),
    ["old-petg"],
  );
  assert.equal(selected.blockedRows.length, 0);
});

test("buildBambuFilamentCodeBatch blocks non-code barcode values", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [master({ id: "yellow", color_name: "Yellow (53400)" })],
    rawInput: "6977252426206",
  });

  assert.equal(batch.rows.length, 1);
  assert.equal(batch.rows[0]?.sourceText, "6977252426206");
  assert.equal(batch.rows[0]?.code, null);
  assert.equal(batch.rows[0]?.lookup.status, "no_code");
  assert.equal(batch.creatableRows.length, 0);
  assert.equal(batch.blockedRows.length, 1);
});

test("buildBambuFilamentCodeBatch resolves known Bambu box barcode aliases", () => {
  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({
        id: "matte-charcoal",
        filament_name: "PLA Matte",
        color_name: "Charcoal (11101)",
      }),
    ],
    rawInput: "6975337031338\nSKU: A01-K1-1.75-1000-SPL",
  });

  assert.deepEqual(
    batch.rows.map((row) => row.code),
    ["11101", "11101"],
  );
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["matte-charcoal", "matte-charcoal"],
  );
  assert.equal(batch.blockedRows.length, 0);
});

test("appendBambuFilamentCodeBatchScanInput appends detected codes into batch input", () => {
  const append = appendBambuFilamentCodeBatchScanInput({
    currentInput: "53400\n",
    scanText: "Filament Code: 53600 / 65103",
  });

  assert.deepEqual(append.appendedLines, ["53600", "65103"]);
  assert.equal(append.input, "53400\n53600\n65103");

  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "yellow", color_name: "Yellow (53400)" }),
      master({ id: "blue", color_name: "Blue (53600)" }),
      master({ id: "black", color_name: "Black (65103)" }),
    ],
    rawInput: append.input,
  });

  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["yellow", "blue", "black"],
  );
});

test("appendBambuFilamentCodeBatchScanInput keeps duplicates and invalid scans reviewable", () => {
  const firstAppend = appendBambuFilamentCodeBatchScanInput({
    currentInput: "",
    scanText: "53400",
  });
  const secondAppend = appendBambuFilamentCodeBatchScanInput({
    currentInput: firstAppend.input,
    scanText: "53400",
  });
  const invalidAppend = appendBambuFilamentCodeBatchScanInput({
    currentInput: secondAppend.input,
    scanText: "6977252426206",
  });
  const emptyAppend = appendBambuFilamentCodeBatchScanInput({
    currentInput: invalidAppend.input,
    scanText: "   ",
  });

  assert.deepEqual(secondAppend.appendedLines, ["53400"]);
  assert.deepEqual(invalidAppend.appendedLines, ["6977252426206"]);
  assert.deepEqual(emptyAppend.appendedLines, []);
  assert.equal(emptyAppend.input, "53400\n53400\n6977252426206");

  const batch = buildBambuFilamentCodeBatch({
    masters: [master({ id: "yellow", color_name: "Yellow (53400)" })],
    rawInput: emptyAppend.input,
  });

  assert.deepEqual(
    batch.rows.map((row) => row.code),
    ["53400", "53400", null],
  );
  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["yellow", "yellow"],
  );
  assert.equal(batch.blockedRows[0]?.sourceText, "6977252426206");
  assert.equal(batch.blockedRows[0]?.lookup.status, "no_code");
});

test("appendBambuFilamentCodeBatchScanValues appends multiple image barcode values", () => {
  const append = appendBambuFilamentCodeBatchScanValues({
    currentInput: "53400",
    scanValues: ["Filament Code: 53600", "65103", "  "],
  });

  assert.deepEqual(append.appendedLines, ["53600", "65103"]);
  assert.deepEqual(append.appendedCodeLines, ["53600", "65103"]);
  assert.deepEqual(append.appendedReviewLines, []);
  assert.equal(append.input, "53400\n53600\n65103");
});

test("appendBambuFilamentCodeBatchScanValues keeps non-code image barcode values reviewable", () => {
  const append = appendBambuFilamentCodeBatchScanValues({
    currentInput: "",
    scanValues: ["6977252426206", "U02-Y0-1.75-1000-SPL"],
  });

  assert.deepEqual(append.appendedLines, [
    "6977252426206",
    "U02-Y0-1.75-1000-SPL",
  ]);
  assert.deepEqual(append.appendedCodeLines, []);
  assert.deepEqual(append.appendedReviewLines, [
    "6977252426206",
    "U02-Y0-1.75-1000-SPL",
  ]);

  const batch = buildBambuFilamentCodeBatch({
    masters: [master({ id: "yellow", color_name: "Yellow (53400)" })],
    rawInput: append.input,
  });

  assert.deepEqual(
    batch.blockedRows.map((row) => row.sourceText),
    ["6977252426206", "U02-Y0-1.75-1000-SPL"],
  );
  assert.deepEqual(
    batch.blockedRows.map((row) => row.lookup.status),
    ["no_code", "no_code"],
  );
});

test("appendBambuFilamentCodeBatchScanValues keeps mixed image barcode values reviewable", () => {
  const append = appendBambuFilamentCodeBatchScanValues({
    currentInput: "53400",
    scanValues: ["Filament Code: 53600", "6977252426206"],
  });

  assert.deepEqual(append.appendedLines, ["53600", "6977252426206"]);
  assert.deepEqual(append.appendedCodeLines, ["53600"]);
  assert.deepEqual(append.appendedReviewLines, ["6977252426206"]);
  assert.equal(append.input, "53400\n53600\n6977252426206");

  const batch = buildBambuFilamentCodeBatch({
    masters: [
      master({ id: "yellow", color_name: "Yellow (53400)" }),
      master({ id: "green", color_name: "Green (53600)" }),
    ],
    rawInput: append.input,
  });

  assert.deepEqual(
    batch.creatableRows.map((row) => row.master?.id),
    ["yellow", "green"],
  );
  assert.equal(batch.blockedRows[0]?.sourceText, "6977252426206");
  assert.equal(batch.blockedRows[0]?.lookup.status, "no_code");
});

test("appendBambuFilamentCodeBatchScanValues maps known box barcodes and ignores Bambu instruction URLs", () => {
  const append = appendBambuFilamentCodeBatchScanValues({
    currentInput: "",
    scanValues: [
      "6975337031338",
      "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
    ],
  });

  assert.deepEqual(append.appendedLines, ["11101"]);
  assert.deepEqual(append.appendedCodeLines, ["11101"]);
  assert.deepEqual(append.appendedReviewLines, []);
  assert.deepEqual(append.ignoredLines, [
    "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
  ]);
  assert.equal(append.input, "11101");
});

test("appendBambuFilamentCodeBatchScanValuesOnce adds each live scan value once per session", () => {
  const firstAppend = appendBambuFilamentCodeBatchScanValuesOnce({
    currentInput: "",
    scanValues: ["Filament Code: 53400", "6977252426206"],
  });
  const duplicateAppend = appendBambuFilamentCodeBatchScanValuesOnce({
    currentInput: firstAppend.input,
    scanValues: ["53400", "6977252426206"],
    seenKeys: firstAppend.nextSeenKeys,
  });
  const nextAppend = appendBambuFilamentCodeBatchScanValuesOnce({
    currentInput: duplicateAppend.input,
    scanValues: ["Filament Code: 53600"],
    seenKeys: duplicateAppend.nextSeenKeys,
  });

  assert.equal(firstAppend.status, "appended");
  assert.deepEqual(firstAppend.appendedLines, ["53400", "6977252426206"]);
  assert.deepEqual(firstAppend.appendedKeys, ["code:53400", "review:6977252426206"]);
  assert.equal(firstAppend.input, "53400\n6977252426206");

  assert.equal(duplicateAppend.status, "duplicate");
  assert.deepEqual(duplicateAppend.appendedLines, []);
  assert.deepEqual(duplicateAppend.skippedLines, ["53400", "6977252426206"]);
  assert.equal(duplicateAppend.input, "53400\n6977252426206");

  assert.equal(nextAppend.status, "appended");
  assert.deepEqual(nextAppend.appendedLines, ["53600"]);
  assert.equal(nextAppend.input, "53400\n6977252426206\n53600");
});

test("appendBambuFilamentCodeBatchScanValuesOnce reports ignored Bambu instruction QR values", () => {
  const append = appendBambuFilamentCodeBatchScanValuesOnce({
    currentInput: "",
    scanValues: ["https://wiki.bambulab.com/en/filament-acc/filament/pla-matte"],
  });

  assert.equal(append.status, "ignored");
  assert.deepEqual(append.appendedLines, []);
  assert.deepEqual(append.ignoredLines, [
    "https://wiki.bambulab.com/en/filament-acc/filament/pla-matte",
  ]);
  assert.equal(append.input, "");
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
      tauriAvailable: false,
      busy: false,
      isBambuMode: true,
      borrowedOwnerRequired: false,
    }).reason,
    "missing_runtime",
  );
  assert.equal(
    buildBambuFilamentCodeBatchCreateState({
      batch,
      tauriAvailable: true,
      busy: true,
      isBambuMode: true,
      borrowedOwnerRequired: false,
    }).reason,
    "busy",
  );
  assert.equal(
    buildBambuFilamentCodeBatchCreateState({
      batch,
      tauriAvailable: true,
      busy: false,
      isBambuMode: false,
      borrowedOwnerRequired: false,
    }).reason,
    "wrong_mode",
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
