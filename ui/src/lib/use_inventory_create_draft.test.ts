import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCreateCatalogMasters,
  selectedCreateCatalogMaster,
} from "./use_inventory_create_draft";
import type { MasterCatalogRow } from "./tauri_client";

function master(id: string, overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id,
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Black",
    hex_color: "#000000",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

test("selectedCreateCatalogMaster can require an explicit catalog row", () => {
  const masters = [master("first"), master("second")];

  assert.equal(selectedCreateCatalogMaster(masters, ""), masters[0]);
  assert.equal(
    selectedCreateCatalogMaster(masters, "", { allowFallback: false }),
    null,
  );
  assert.equal(
    selectedCreateCatalogMaster(masters, "second", { allowFallback: false }),
    masters[1],
  );
});

test("filterCreateCatalogMasters keeps active Bambu code matches ahead of discontinued history", () => {
  const results = filterCreateCatalogMasters(
    [
      master("old-yellow", {
        color_name: "Old Yellow (53400)",
        is_discontinued: true,
        discontinued_at: "2024-01-01T00:00:00Z",
      }),
      master("active-yellow", {
        color_name: "Yellow (53400)",
        filament_name: "TPU for AMS",
      }),
    ],
    "bambu",
    "53400",
  );

  assert.deepEqual(
    results.map((entry) => entry.id),
    ["active-yellow", "old-yellow"],
  );
});

test("filterCreateCatalogMasters keeps discontinued-only Bambu code matches selectable", () => {
  const results = filterCreateCatalogMasters(
    [
      master("archived-red", {
        color_name: "Old Red (12345)",
        is_discontinued: true,
        discontinued_at: "2024-01-01T00:00:00Z",
      }),
      master("active-yellow", {
        color_name: "Yellow (53400)",
        filament_name: "TPU for AMS",
      }),
    ],
    "bambu",
    "12345",
  );

  assert.deepEqual(
    results.map((entry) => entry.id),
    ["archived-red"],
  );
  assert.equal(
    selectedCreateCatalogMaster(results, "", { allowFallback: false }),
    null,
  );
  assert.equal(
    selectedCreateCatalogMaster(results, "archived-red", { allowFallback: false })?.id,
    "archived-red",
  );
});
