import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBambuFilamentCodeLookup,
  bambuFilamentCodeLookupRequiresExplicitSelection,
  catalogMasterBambuFilamentCode,
  extractBambuFilamentCode,
  extractBambuFilamentCodes,
} from "./bambu_filament_code_lookup";
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

test("extractBambuFilamentCode reads standalone five digit filament codes only", () => {
  assert.equal(extractBambuFilamentCode("Filament Code: 53400"), "53400");
  assert.equal(extractBambuFilamentCode("TPU for AMS Yellow (53400)"), "53400");
  assert.equal(extractBambuFilamentCode("6977252426206"), null);
  assert.equal(extractBambuFilamentCode("U02-Y0-1.75-1000-SPL"), null);
});

test("extractBambuFilamentCodes reads multiple standalone five digit filament codes", () => {
  assert.deepEqual(extractBambuFilamentCodes("53400, 53600\n65103"), [
    "53400",
    "53600",
    "65103",
  ]);
  assert.deepEqual(extractBambuFilamentCodes("6977252426206 123456"), []);
});

test("catalogMasterBambuFilamentCode reads codes from Bambu catalog colors", () => {
  assert.equal(catalogMasterBambuFilamentCode(master({ color_name: "Yellow (53400)" })), "53400");
  assert.equal(
    catalogMasterBambuFilamentCode(master({ vendor: "eSUN", color_name: "Black (10101)" })),
    null,
  );
});

test("buildBambuFilamentCodeLookup reports single active match", () => {
  const lookup = buildBambuFilamentCodeLookup(
    [
      master({ id: "yellow", filament_name: "TPU for AMS", color_name: "Yellow (53400)" }),
      master({ id: "blue", filament_name: "TPU for AMS", color_name: "Blue (53600)" }),
    ],
    "Filament Code: 53400",
  );

  assert.equal(lookup.code, "53400");
  assert.equal(lookup.status, "single_active");
  assert.deepEqual(
    lookup.activeMatches.map((match) => match.id),
    ["yellow"],
  );
});

test("buildBambuFilamentCodeLookup keeps ambiguous reused codes visible", () => {
  const lookup = buildBambuFilamentCodeLookup(
    [
      master({ id: "petg-black", material: "PETG", color_name: "Black (65103)" }),
      master({ id: "pla-black", material: "PLA", color_name: "Black (65103)" }),
    ],
    "65103",
  );

  assert.equal(lookup.status, "multiple_active");
  assert.deepEqual(
    lookup.activeMatches.map((match) => match.id),
    ["petg-black", "pla-black"],
  );
});

test("buildBambuFilamentCodeLookup distinguishes discontinued-only matches", () => {
  const lookup = buildBambuFilamentCodeLookup(
    [master({ id: "archived", color_name: "Old Color (12345)", is_discontinued: true })],
    "12345",
  );

  assert.equal(lookup.status, "discontinued_only");
  assert.equal(lookup.activeMatches.length, 0);
  assert.equal(lookup.discontinuedMatches.length, 1);
});

test("bambuFilamentCodeLookupRequiresExplicitSelection flags ambiguous and discontinued codes", () => {
  const single = buildBambuFilamentCodeLookup(
    [master({ id: "yellow", color_name: "Yellow (53400)" })],
    "53400",
  );
  const multiple = buildBambuFilamentCodeLookup(
    [
      master({ id: "petg-black", material: "PETG", color_name: "Black (65103)" }),
      master({ id: "pla-black", material: "PLA", color_name: "Black (65103)" }),
    ],
    "65103",
  );
  const discontinued = buildBambuFilamentCodeLookup(
    [master({ id: "archived", color_name: "Old Color (12345)", is_discontinued: true })],
    "12345",
  );

  assert.equal(bambuFilamentCodeLookupRequiresExplicitSelection(single), false);
  assert.equal(bambuFilamentCodeLookupRequiresExplicitSelection(multiple), true);
  assert.equal(bambuFilamentCodeLookupRequiresExplicitSelection(discontinued), true);
});
