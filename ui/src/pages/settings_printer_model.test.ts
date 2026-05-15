import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildPrinterSlotsByPrinterId,
  buildSettingsPrinterConfirmDeleteMessage,
  buildSettingsPrinterRemovedMessage,
  buildSettingsPrinterUpdatedMessage,
  derivePrinterMultiConfig,
  isBambuLabPrinter,
  preparePrinterReconfigure,
  sortSettingsPrinters,
} from "./settings_printer_model";
import type { PrinterOverviewRow, PrinterRow } from "../lib/tauri_client";

function printer(overrides: Partial<PrinterRow>): PrinterRow {
  return {
    id: "printer-1",
    name: "Printer",
    model: "Bambu Lab X1 Carbon",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function overviewRow(
  slots: Array<{ ams_id: string; slot_id: string }>,
): PrinterOverviewRow {
  return {
    printer: {
      id: "printer-1",
      name: "Printer",
      model: "Bambu Lab X1 Carbon",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    slots: slots.map((slot, index) => ({
      id: `slot-${index}`,
      printer_id: "printer-1",
      ams_id: slot.ams_id,
      slot_id: slot.slot_id,
      label: `Slot ${index + 1}`,
      spool_id: null,
      loaded_at: null,
      updated_at: "2026-01-01T00:00:00Z",
      spool: null,
      master: null,
    })),
  };
}

test("derivePrinterMultiConfig counts only internal multi-material units", () => {
  const config = derivePrinterMultiConfig({
    printerId: "printer-1",
    model: "Bambu Lab X1 Carbon",
    printerOverview: [
      overviewRow([
        { ams_id: "ams-1", slot_id: "1" },
        { ams_id: "ams-1", slot_id: "2" },
        { ams_id: "ams-2", slot_id: "1" },
        { ams_id: "printer_ext", slot_id: "external" },
      ]),
    ],
  });

  assert.deepEqual(config, { units: 2, slotsPerUnit: 2 });
});

test("buildPrinterSlotsByPrinterId indexes overview slots by printer id", () => {
  const overview = overviewRow([
    { ams_id: "ams-1", slot_id: "1" },
    { ams_id: "ams-1", slot_id: "2" },
  ]);

  const slotsByPrinterId = buildPrinterSlotsByPrinterId([overview]);

  assert.equal(slotsByPrinterId.get("printer-1"), overview.slots);
  assert.equal(slotsByPrinterId.get("missing"), undefined);
});

test("sortSettingsPrinters orders by name, then model, without mutating input", () => {
  const printers = [
    printer({ id: "printer-10", name: "Printer 10", model: "Prusa MK4" }),
    printer({ id: "alpha-p1s", name: "Alpha", model: "Bambu Lab P1S" }),
    printer({ id: "printer-2", name: "Printer 2", model: "Bambu Lab X1 Carbon" }),
    printer({ id: "alpha-a1", name: "alpha", model: "Bambu Lab A1" }),
  ];

  const sorted = sortSettingsPrinters(printers, "nb-NO");

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["alpha-a1", "alpha-p1s", "printer-2", "printer-10"],
  );
  assert.deepEqual(
    printers.map((item) => item.id),
    ["printer-10", "alpha-p1s", "printer-2", "alpha-a1"],
  );
});

test("derivePrinterMultiConfig falls back to model defaults without slots", () => {
  const config = derivePrinterMultiConfig({
    printerId: "missing",
    model: "Bambu Lab A1 mini",
    printerOverview: [],
  });

  assert.equal(config.units, 0);
  assert.equal(config.slotsPerUnit > 0, true);
});

test("isBambuLabPrinter handles casing and whitespace", () => {
  assert.equal(isBambuLabPrinter(" Bambu Lab P1S "), true);
  assert.equal(isBambuLabPrinter("Prusa MK4"), false);
});

test("preparePrinterReconfigure trims required fields and clamps model-specific slots", () => {
  const prepared = preparePrinterReconfigure({
    currentExists: true,
    draft: {
      id: "printer-1",
      model: " Bambu Lab A1 mini ",
      name: "  A1 Mini  ",
      amsUnits: "9",
      slotsPerUnit: "12",
      bambuLiveEnabled: true,
      bambuLiveHost: " 192.168.1.20 ",
      bambuLiveAccessCode: " 12345678 ",
      bambuLivePrinterSerial: " 00M09 ",
    },
  });

  assert.equal(prepared.ok, true);
  if (!prepared.ok) {
    return;
  }
  assert.deepEqual(prepared.printer, {
    id: "printer-1",
    model: "Bambu Lab A1 mini",
    name: "A1 Mini",
    ams_units: 1,
    slots_per_ams: 4,
  });
  assert.deepEqual(prepared.bambuLive, {
    enabled: true,
    host: "192.168.1.20",
    accessCode: "12345678",
    printerSerial: "00M09",
  });
});

test("preparePrinterReconfigure validates missing printer and Bambu live fields", () => {
  assert.deepEqual(
    preparePrinterReconfigure({
      currentExists: false,
      draft: {
        id: "printer-1",
        model: "Bambu Lab P1S",
        name: "P1S",
        amsUnits: "1",
        slotsPerUnit: "4",
        bambuLiveEnabled: false,
        bambuLiveHost: "",
        bambuLiveAccessCode: "",
        bambuLivePrinterSerial: "",
      },
    }),
    { ok: false, reason: "missing_printer" },
  );

  assert.deepEqual(
    preparePrinterReconfigure({
      currentExists: true,
      draft: {
        id: "printer-1",
        model: "Bambu Lab P1S",
        name: "P1S",
        amsUnits: "1",
        slotsPerUnit: "4",
        bambuLiveEnabled: true,
        bambuLiveHost: "192.168.1.20",
        bambuLiveAccessCode: "",
        bambuLivePrinterSerial: "00M09",
      },
    }),
    { ok: false, reason: "missing_bambu_live_fields" },
  );
});

test("settings printer messages quote the printer name consistently", () => {
  assert.equal(
    buildSettingsPrinterConfirmDeleteMessage("X1 Carbon", {
      confirmDeleteTapAgain: "Click Remove again to confirm deleting printer",
    }),
    'Click Remove again to confirm deleting printer "X1 Carbon".',
  );
  assert.equal(
    buildSettingsPrinterRemovedMessage("X1 Carbon", {
      removedPrinter: "Removed printer",
    }),
    'Removed printer "X1 Carbon".',
  );
  assert.equal(
    buildSettingsPrinterUpdatedMessage("X1 Carbon", {
      updatedPrinter: "Updated printer",
    }),
    'Updated printer "X1 Carbon".',
  );
});
