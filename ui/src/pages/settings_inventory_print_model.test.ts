import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSettingsInventoryOverviewPrintErrorMessage,
  buildSettingsInventoryOverviewPrintRows,
  buildSettingsInventoryOverviewPrintSuccessMessage,
} from "./settings_inventory_print_model";
import type { MasterRow, SpoolRow, SpoolWithMasterRow } from "../lib/tauri_client";

function row(
  overrides: {
    spool?: Partial<SpoolRow>;
    master?: Partial<MasterRow>;
  } = {},
): SpoolWithMasterRow {
  const base: SpoolWithMasterRow = {
    spool: {
      id: "spool-1",
      master_id: "master-1",
      status: "IN_STOCK",
      ownership_type: "OWNED",
      current_weight_g: 500,
      home_location_id: "Shelf 1",
    },
    master: {
      id: "master-1",
      material: "PLA",
      filament_name: "Basic",
      color_name: "Black",
      hex_color: "#111111",
      default_weight: 1000,
      vendor: "Bambu",
    },
  };

  return {
    spool: { ...base.spool, ...overrides.spool },
    master: { ...base.master, ...overrides.master },
  };
}

test("settings inventory overview print rows skip empty spools and sort by filament identity", async () => {
  const qrPayloads: string[] = [];
  const rows = await buildSettingsInventoryOverviewPrintRows({
    rows: [
      row({
        spool: { id: "petg", master_id: "petg", status: "IN_STOCK" },
        master: { id: "petg", material: "PETG", filament_name: "Clear", color_name: "Blue" },
      }),
      row({
        spool: { id: "empty", master_id: "empty", status: "empty" },
        master: { id: "empty", material: "ABS", filament_name: "Hidden", color_name: "Grey" },
      }),
      row({
        spool: { id: "pla-a", master_id: "pla-a", status: "IN_STOCK" },
        master: { id: "pla-a", material: "PLA", filament_name: "Basic", color_name: "Amber" },
      }),
    ],
    locale: "en",
    companionShellUrl: "http://host/companion",
    labels: { borrowedIn: "Borrowed in", unknown: "Unknown" },
    buildFilamentQrPayload: (reference, options) => {
      assert.equal(options.mode, "companion");
      assert.equal(options.companionShellUrl, "http://host/companion");
      qrPayloads.push(reference);
      return { mode: "companion", payload: `qr:${reference}`, target: reference };
    },
    buildFilamentLabelQrDataUrl: async (payload) => `data:image/png;base64,${payload}`,
  });

  assert.deepEqual(rows.map((printRow) => printRow.reference), ["petg", "pla-a"]);
  assert.deepEqual(qrPayloads, ["petg", "pla-a"]);
  assert.equal(rows[0].qrDataUrl, "data:image/png;base64,qr:petg");
});

test("settings inventory overview print rows map borrowed and missing display fields", async () => {
  const rows = await buildSettingsInventoryOverviewPrintRows({
    rows: [
      row({
        spool: {
          id: "",
          master_id: "missing",
          ownership_type: "BORROWED_IN",
          home_location_id: null,
        },
        master: {
          id: "missing",
          vendor: "",
          material: "",
          filament_name: "",
          color_name: "",
          hex_color: null,
        },
      }),
    ],
    locale: "en",
    companionShellUrl: null,
    labels: { borrowedIn: "Borrowed in", unknown: "Unknown" },
    buildFilamentQrPayload: (reference) => ({
      mode: "portable",
      payload: `qr:${reference}`,
      target: reference,
    }),
    buildFilamentLabelQrDataUrl: async (payload) => `data:image/png;base64,${payload}`,
  });

  assert.equal(rows[0].reference, "Unknown");
  assert.equal(rows[0].vendor, "Unknown");
  assert.equal(rows[0].ownershipMarker, "Borrowed in");
  assert.equal(rows[0].material, "Unknown");
  assert.equal(rows[0].swatchHex, "#CBD5E1");
});

test("settings inventory overview print success message returns stable copy", () => {
  const labels = {
    inventoryOverviewPrintDone: "A4 inventory overview PDF opened for printing.",
    inventoryOverviewPrintFailed: "Failed to print inventory overview.",
  };

  assert.equal(
    buildSettingsInventoryOverviewPrintSuccessMessage(labels),
    labels.inventoryOverviewPrintDone,
  );
  assert.equal(
    buildSettingsInventoryOverviewPrintErrorMessage(labels),
    labels.inventoryOverviewPrintFailed,
  );
});
