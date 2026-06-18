import assert from "node:assert/strict";
import test from "node:test";

import { selectedCreateCatalogMaster } from "./use_inventory_create_draft";
import type { MasterCatalogRow } from "./tauri_client";

function master(id: string): MasterCatalogRow {
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
