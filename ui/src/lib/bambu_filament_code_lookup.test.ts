import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildBambuFilamentCodeLookup,
  bambuFilamentCodeLookupRequiresExplicitSelection,
  catalogMasterBambuFilamentCode,
  extractBambuFilamentCode,
  extractBambuFilamentCodes,
  type BambuFilamentCodeLookupStatus,
} from "./bambu_filament_code_lookup";
import type { MasterCatalogRow } from "./tauri_client";

type SharedLookupFixture = {
  extractCases: Array<{
    input: string;
    codes: string[];
    first: string | null;
  }>;
  masters: MasterCatalogRow[];
  lookupCases: Array<{
    name: string;
    rawQuery: string;
    code: string | null;
    status: BambuFilamentCodeLookupStatus;
    matches: string[];
    activeMatches: string[];
    discontinuedMatches: string[];
    requiresExplicitSelection: boolean;
  }>;
};

const sharedFixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../test_fixtures/bambu_filament_code_lookup_cases.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as SharedLookupFixture;

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

test("shared Bambu filament code extraction cases match desktop expectations", () => {
  for (const testCase of sharedFixture.extractCases) {
    assert.deepEqual(
      extractBambuFilamentCodes(testCase.input),
      testCase.codes,
      testCase.input,
    );
    assert.equal(extractBambuFilamentCode(testCase.input), testCase.first, testCase.input);
  }
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

test("shared Bambu filament code lookup cases match desktop expectations", () => {
  for (const testCase of sharedFixture.lookupCases) {
    const lookup = buildBambuFilamentCodeLookup(
      sharedFixture.masters,
      testCase.rawQuery,
    );

    assert.equal(lookup.code, testCase.code, testCase.name);
    assert.equal(lookup.status, testCase.status, testCase.name);
    assert.deepEqual(
      lookup.matches.map((match) => match.id),
      testCase.matches,
      testCase.name,
    );
    assert.deepEqual(
      lookup.activeMatches.map((match) => match.id),
      testCase.activeMatches,
      testCase.name,
    );
    assert.deepEqual(
      lookup.discontinuedMatches.map((match) => match.id),
      testCase.discontinuedMatches,
      testCase.name,
    );
    assert.equal(
      bambuFilamentCodeLookupRequiresExplicitSelection(lookup),
      testCase.requiresExplicitSelection,
      testCase.name,
    );
  }
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

test("buildBambuFilamentCodeLookup prefers one active match over discontinued history", () => {
  const lookup = buildBambuFilamentCodeLookup(
    [
      master({
        id: "old-yellow",
        filament_name: "PLA Basic",
        color_name: "Old Yellow (53400)",
        is_discontinued: true,
      }),
      master({ id: "active-yellow", filament_name: "TPU for AMS", color_name: "Yellow (53400)" }),
    ],
    "53400",
  );

  assert.equal(lookup.status, "single_active");
  assert.deepEqual(
    lookup.matches.map((match) => match.id),
    ["active-yellow", "old-yellow"],
  );
  assert.deepEqual(
    lookup.activeMatches.map((match) => match.id),
    ["active-yellow"],
  );
  assert.deepEqual(
    lookup.discontinuedMatches.map((match) => match.id),
    ["old-yellow"],
  );
  assert.equal(bambuFilamentCodeLookupRequiresExplicitSelection(lookup), false);
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
