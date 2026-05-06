import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLoanableSpoolCandidates,
  loadLoanableSpoolCandidates,
} from "./loan_out_data_source";
import type { PrinterOverviewRow, SpoolWithMasterRow } from "./tauri_client";

function spoolRow(
  id: string,
  overrides: Partial<SpoolWithMasterRow["spool"]> = {},
): SpoolWithMasterRow {
  return {
    spool: {
      id,
      master_id: `master-${id}`,
      qr_code: null,
      status: "IN_STOCK",
      initial_weight_g: 1000,
      current_weight_g: 900,
      remaining_g: 850,
      location_id: "Shelf 1",
      purchase_date: null,
      purchase_price: null,
      batch_code: null,
      archived_at: null,
      deleted_at: null,
      spool_tare_weight_g: 200,
      ownership_type: "OWNED",
      ownership_note: null,
      ...overrides,
    },
    master: {
      id: `master-${id}`,
      vendor: id === "spool-b" ? "Bambu" : "Generic",
      material: "PLA",
      filament_name: `Basic ${id}`,
      color_name: "Gray",
      hex_color: "#808080",
      product_url: null,
      default_weight_g: 1000,
      density: null,
      spool_tare_weight_g: null,
      source: "manual",
    },
  } as SpoolWithMasterRow;
}

function printerOverview(assignedSpoolId: string | null): PrinterOverviewRow[] {
  return [
    {
      printer: {
        id: "printer-1",
        name: "Printer",
        model: "generic",
        ams_units: 1,
        slots_per_ams: 4,
      },
      slots: [
        {
          slot_id: "ams_0_0",
          printer_id: "printer-1",
          ams_id: "ams_0",
          slot_index: 0,
          spool_id: assignedSpoolId,
          spool_remaining_g: null,
          material: null,
          filament_name: null,
          color_name: null,
          vendor: null,
          hex_color: null,
          rfid_tag: null,
          rfid_override_tray_uuid: null,
          rfid_override_color_hex: null,
        },
      ],
    },
  ] as PrinterOverviewRow[];
}

test("buildLoanableSpoolCandidates skips assigned, borrowed-in, and unavailable spools", () => {
  const candidates = buildLoanableSpoolCandidates(
    [
      spoolRow("spool-a"),
      spoolRow("spool-b"),
      spoolRow("spool-c", { ownership_type: "BORROWED_IN" }),
      spoolRow("spool-d", { status: "EMPTY" }),
    ],
    printerOverview("spool-a"),
  );

  assert.deepEqual(candidates.map((spool) => spool.id), ["spool-b"]);
  assert.equal(candidates[0]?.remainingGrams, 850);
  assert.equal(candidates[0]?.spoolTareWeightGrams, 200);
});

test("loadLoanableSpoolCandidates uses shared spool and printer data sources", async () => {
  const candidates = await loadLoanableSpoolCandidates(
    { clientReadOnly: true, clientHostBaseUrl: "http://host", clientLibraryId: "library-1" },
    {
      loadSpoolRows: async (options, limit, offset) => {
        assert.equal(options.clientReadOnly, true);
        assert.equal(limit, 1200);
        assert.equal(offset, 0);
        return [spoolRow("spool-a"), spoolRow("spool-b")];
      },
      loadPrinterOverview: async (options) => {
        assert.equal(options.clientHostBaseUrl, "http://host");
        return {
          printers: printerOverview("spool-a"),
          bambuLiveIntegrations: {},
          source: "LIVE",
          updatedAt: null,
        };
      },
    },
  );

  assert.deepEqual(candidates.map((spool) => spool.id), ["spool-b"]);
});
