import assert from "node:assert/strict";
import test from "node:test";

import { buildBambuLiveCatalogMatchResult } from "./bambu_live_catalog_match";
import type { BambuLiveObservedTray, MasterCatalogRow } from "./tauri_client";

function master(
  id: string,
  overrides: Partial<MasterCatalogRow> = {},
): MasterCatalogRow {
  return {
    id,
    vendor: overrides.vendor ?? "Bambu Lab",
    material: overrides.material ?? "PLA",
    filament_name: overrides.filament_name ?? "PLA Matte",
    color_name: overrides.color_name ?? "Black",
    hex_color: overrides.hex_color ?? "#000000",
    default_weight: overrides.default_weight ?? 1000,
    is_discontinued: overrides.is_discontinued ?? false,
    product_url: overrides.product_url ?? null,
    discontinued_at: overrides.discontinued_at ?? null,
  };
}

function tray(
  overrides: Partial<BambuLiveObservedTray> = {},
): BambuLiveObservedTray {
  return {
    tray_index: 0,
    loaded: true,
    filament_type: "PLA",
    filament_name: "PLA Matte",
    color_hex: "#000000",
    tray_uuid: "UNREGISTERED-RFID",
    last_identity_seen_at: "2099-01-01T00:00:00Z",
    ...overrides,
  };
}

test("buildBambuLiveCatalogMatchResult finds one Bambu catalog match from live AMS metadata", () => {
  const result = buildBambuLiveCatalogMatchResult(
    [
      master("matte-black"),
      master("matte-white", { color_name: "White", hex_color: "#FFFFFF" }),
      master("esun-black", { vendor: "eSUN", filament_name: "PLA+HS" }),
    ],
    tray(),
  );

  assert.equal(result.kind, "catalog_single");
  assert.deepEqual(result.candidates.map((row) => row.id), ["matte-black"]);
});

test("buildBambuLiveCatalogMatchResult can shortlist multiple Bambu catalog matches", () => {
  const result = buildBambuLiveCatalogMatchResult(
    [
      master("basic-black", { filament_name: "PLA Basic" }),
      master("matte-black"),
    ],
    tray({ filament_name: null }),
  );

  assert.equal(result.kind, "catalog_multiple");
  assert.deepEqual(result.candidates.map((row) => row.id), ["basic-black", "matte-black"]);
});

test("buildBambuLiveCatalogMatchResult includes discontinued Bambu rows as historical references", () => {
  const result = buildBambuLiveCatalogMatchResult(
    [
      master("old-black", { is_discontinued: true, discontinued_at: "2025-01-01T00:00:00Z" }),
    ],
    tray(),
  );

  assert.equal(result.kind, "catalog_single");
  assert.deepEqual(result.candidates.map((row) => row.id), ["old-black"]);
});

test("buildBambuLiveCatalogMatchResult ignores unloaded or empty live trays", () => {
  assert.equal(
    buildBambuLiveCatalogMatchResult([master("matte-black")], tray({ loaded: false })).kind,
    "none",
  );
  assert.equal(
    buildBambuLiveCatalogMatchResult(
      [master("matte-black")],
      tray({ filament_type: null, filament_name: null, color_hex: null }),
    ).kind,
    "none",
  );
});
