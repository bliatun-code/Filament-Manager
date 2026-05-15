import assert from "node:assert/strict";
import test from "node:test";

import {
  activeCatalogMastersForMode,
  buildInventoryCreateSpoolRequest,
  currentCreateSwatchHexForMode,
  formatInventoryCreateAddedLabel,
  isInventoryCatalogCreateMode,
  isInventoryCreateDisabled,
  selectedCatalogMasterForMode,
} from "./inventory_create_model";
import type { MasterCatalogRow } from "./tauri_client";

function master(overrides: Partial<MasterCatalogRow> = {}): MasterCatalogRow {
  return {
    id: "master-1",
    material: "PLA",
    filament_name: "PLA Basic",
    color_name: "Gray",
    hex_color: "#808080",
    product_url: null,
    default_weight: 1000,
    vendor: "Bambu",
    is_discontinued: false,
    discontinued_at: null,
    ...overrides,
  };
}

test("inventory create mode helpers select catalog state by mode", () => {
  const bambu = master({ id: "bambu", vendor: "Bambu" });
  const esun = master({ id: "esun", vendor: "eSUN" });

  assert.equal(isInventoryCatalogCreateMode("bambu"), true);
  assert.equal(isInventoryCatalogCreateMode("manual"), false);
  assert.deepEqual(activeCatalogMastersForMode("bambu", [bambu], [esun]), [bambu]);
  assert.deepEqual(activeCatalogMastersForMode("manual", [bambu], [esun]), []);
  assert.equal(selectedCatalogMasterForMode("esun", bambu, esun), esun);
  assert.equal(selectedCatalogMasterForMode("manual", bambu, esun), null);
});

test("currentCreateSwatchHexForMode normalizes manual hex and uses catalog swatches", () => {
  assert.equal(
    currentCreateSwatchHexForMode({
      mode: "manual",
      manualHexColor: "abc",
    }),
    "#abc",
  );
  assert.equal(
    currentCreateSwatchHexForMode({
      mode: "manual",
      manualHexColor: "not-a-color",
    }),
    null,
  );
  assert.equal(
    currentCreateSwatchHexForMode({
      mode: "bambu",
      selectedCatalogMaster: master({ hex_color: "#2563EB" }),
    }),
    "#2563EB",
  );
});

test("isInventoryCreateDisabled guards runtime, required selection, and borrowed-in owner", () => {
  assert.equal(
    isInventoryCreateDisabled({
      tauriAvailable: false,
      busy: false,
      mode: "manual",
      manualFilamentName: "PLA",
      manualColorName: "Blue",
      ownershipType: "OWNED",
    }),
    true,
  );
  assert.equal(
    isInventoryCreateDisabled({
      tauriAvailable: true,
      busy: false,
      mode: "bambu",
      selectedBambuMaster: null,
      ownershipType: "OWNED",
    }),
    true,
  );
  assert.equal(
    isInventoryCreateDisabled({
      tauriAvailable: true,
      busy: false,
      mode: "manual",
      manualFilamentName: "PLA",
      manualColorName: "Blue",
      ownershipType: "BORROWED_IN",
      borrowedFromName: " ",
    }),
    true,
  );
  assert.equal(
    isInventoryCreateDisabled({
      tauriAvailable: true,
      busy: false,
      mode: "manual",
      manualFilamentName: "PLA",
      manualColorName: "Blue",
      ownershipType: "BORROWED_IN",
      borrowedFromName: "Ada",
    }),
    false,
  );
});

test("formatInventoryCreateAddedLabel mirrors catalog and manual success labels", () => {
  assert.equal(
    formatInventoryCreateAddedLabel({
      mode: "bambu",
      selectedBambuMaster: master({ filament_name: "PLA Matte", color_name: "Ivory" }),
    }),
    "PLA Matte · Ivory",
  );
  assert.equal(
    formatInventoryCreateAddedLabel({
      mode: "manual",
      manualFilamentName: " Tough ",
      manualColorName: " Blue ",
    }),
    "Tough · Blue",
  );
});

test("buildInventoryCreateSpoolRequest builds catalog create payloads", () => {
  assert.deepEqual(
    buildInventoryCreateSpoolRequest({
      id: "spool-1",
      mode: "bambu",
      selectedBambuMaster: master({ id: "master-bambu", default_weight: 750 }),
      initialWeightRaw: "900",
      ownershipType: "BORROWED_IN",
      borrowedFromName: " Ada ",
      borrowedFromContact: " ada@example.com ",
      borrowedInNote: " Return later ",
      location: " Shelf A ",
    }),
    {
      ok: true,
      kind: "catalog",
      addedLabel: "PLA Basic · Gray",
      input: {
        id: "spool-1",
        master_id: "master-bambu",
        qr_code: null,
        status: "IN_STOCK",
        ownership_type: "BORROWED_IN",
        owner_name: "Ada",
        owner_contact: "ada@example.com",
        ownership_note: "Return later",
        initial_weight_g: 900,
        current_weight_g: 900,
        location_id: "Shelf A",
        purchase_date: null,
        purchase_price: null,
        batch_code: null,
      },
    },
  );
});

test("buildInventoryCreateSpoolRequest builds manual create payloads with defaults", () => {
  assert.deepEqual(
    buildInventoryCreateSpoolRequest({
      id: "spool-manual",
      mode: "manual",
      manualVendor: " ",
      manualMaterial: " ",
      manualFilamentName: " Tough ",
      manualColorName: " Blue ",
      manualHexColor: "2563eb",
      initialWeightRaw: "invalid",
      ownershipType: "OWNED",
      location: " ",
    }),
    {
      ok: true,
      kind: "manual",
      addedLabel: "Tough · Blue",
      input: {
        id: "spool-manual",
        vendor: "Generic",
        material: "PLA",
        filament_name: "Tough",
        color_name: "Blue",
        hex_color: "#2563eb",
        product_url: null,
        default_weight_g: 1000,
        qr_code: null,
        status: "IN_STOCK",
        ownership_type: "OWNED",
        owner_name: null,
        owner_contact: null,
        ownership_note: null,
        initial_weight_g: 1000,
        location: null,
      },
    },
  );
});

test("buildInventoryCreateSpoolRequest reports validation failures", () => {
  assert.deepEqual(
    buildInventoryCreateSpoolRequest({
      id: "spool-1",
      mode: "manual",
      manualFilamentName: "PLA",
      manualColorName: "Blue",
      initialWeightRaw: "1000",
      ownershipType: "BORROWED_IN",
      borrowedFromName: " ",
    }),
    { ok: false, error: "BORROWED_OWNER_REQUIRED" },
  );
  assert.deepEqual(
    buildInventoryCreateSpoolRequest({
      id: "spool-1",
      mode: "bambu",
      selectedBambuMaster: null,
      initialWeightRaw: "1000",
      ownershipType: "OWNED",
    }),
    { ok: false, error: "BAMBU_MASTER_REQUIRED" },
  );
  assert.deepEqual(
    buildInventoryCreateSpoolRequest({
      id: "spool-1",
      mode: "manual",
      manualFilamentName: " ",
      manualColorName: "Blue",
      initialWeightRaw: "1000",
      ownershipType: "OWNED",
    }),
    { ok: false, error: "MANUAL_FIELDS_REQUIRED" },
  );
});
