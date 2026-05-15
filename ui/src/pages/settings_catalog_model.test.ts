import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsCatalogState,
  buildSettingsSwatchDrafts,
} from "./settings_catalog_model";
import type { MasterCatalogRow } from "../lib/tauri_client";

function catalogMaster(overrides: Partial<MasterCatalogRow>): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Orange",
    hex_color: "#FFAA00",
    default_weight: 1000,
    vendor: "Bambu Lab",
    ...overrides,
  };
}

test("settings catalog state groups vendor catalogs and material filters", () => {
  const state = buildSettingsCatalogState({
    bambuRefreshMaterials: ["PLA"],
    catalogMasters: [
      catalogMaster({ id: "bambu-pla", material: "PLA", vendor: "Bambu Lab" }),
      catalogMaster({ id: "bambu-petg", material: " PETG ", vendor: "Bambu Lab" }),
      catalogMaster({ id: "esun-abs", material: "ABS", vendor: "eSUN" }),
      catalogMaster({ id: "other", material: "ASA", vendor: "Other" }),
    ],
    catalogVendor: "Bambu",
    esunRefreshMaterials: ["ABS"],
    swatchVendorFilter: "ALL",
  });

  assert.deepEqual(
    state.bambuCatalogMasters.map((master) => master.id),
    ["bambu-pla", "bambu-petg"],
  );
  assert.deepEqual(state.bambuCatalogMaterialOptions, ["PETG", "PLA"]);
  assert.deepEqual(
    state.esunCatalogMasters.map((master) => master.id),
    ["esun-abs"],
  );
  assert.deepEqual(state.esunCatalogMaterialOptions, ["ABS"]);
  assert.equal(state.activeCatalogMasterCount, 2);
  assert.deepEqual(state.activeCatalogMaterialOptions, ["PETG", "PLA"]);
  assert.deepEqual(state.activeCatalogRefreshMaterials, ["PLA"]);
});

test("settings catalog state tracks missing swatches and visible vendor count", () => {
  const state = buildSettingsCatalogState({
    bambuRefreshMaterials: [],
    catalogMasters: [
      catalogMaster({ id: "bambu-missing", hex_color: "", vendor: "Bambu Lab" }),
      catalogMaster({ id: "bambu-ok", hex_color: "#112233", vendor: "Bambu Lab" }),
      catalogMaster({ id: "esun-missing", hex_color: "nope", vendor: "eSUN" }),
      catalogMaster({ id: "other-missing", hex_color: null, vendor: "Other" }),
    ],
    catalogVendor: "eSUN",
    esunRefreshMaterials: ["ABS"],
    swatchVendorFilter: "esun",
  });

  assert.deepEqual(
    state.missingSwatchMasters.map((master) => master.id),
    ["bambu-missing", "esun-missing", "other-missing"],
  );
  assert.deepEqual(state.swatchVendorOptions, ["ALL", "Bambu Lab", "eSUN", "Other"]);
  assert.deepEqual(
    state.visibleMissingSwatchMasters.map((master) => master.id),
    ["esun-missing"],
  );
  assert.equal(state.visibleMissingSwatchVendorCount, 1);
  assert.equal(state.activeCatalogMasterCount, 1);
  assert.deepEqual(state.activeCatalogRefreshMaterials, ["ABS"]);
});

test("settings swatch drafts normalize saved colors and suggest missing swatches", () => {
  const drafts = buildSettingsSwatchDrafts([
    catalogMaster({ id: "short-hex", hex_color: "#abc", color_name: "Blue" }),
    catalogMaster({ id: "named-color", hex_color: "", color_name: "Orange" }),
    catalogMaster({ id: "unknown", hex_color: "not-a-color", color_name: "Mystery Fog" }),
  ]);

  assert.equal(drafts["short-hex"], "#ABC");
  assert.equal(drafts["named-color"], "#F97316");
  assert.match(drafts.unknown, /^#[0-9A-F]{6}$/);
});
