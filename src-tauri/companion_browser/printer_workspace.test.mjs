import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import {
  formatPrinterSlotLabel,
  renderPrinterBoard,
  renderPrinterPickerTaskSheetBody,
  renderPrinterWeightTaskSheetBody,
} from "./printer_workspace.js";

function createPrinterRow(overrides = {}) {
  return {
    printer: {
      id: "printer-1",
      name: "X1C",
      model: "Bambu X1 Carbon",
      ...overrides.printer,
    },
    slots: overrides.slots ?? [
      {
        slot_id: "slot-1",
        ams_id: "ams_1",
        slot_index: 1,
        spool_id: null,
        spool_remaining_g: null,
      },
      {
        slot_id: "slot-2",
        ams_id: "ams_1",
        slot_index: 2,
        spool_id: "spool-1",
        spool_material: "PLA",
        spool_filament_name: "Basic",
        spool_color_name: "White",
        spool_remaining_g: 720,
      },
    ],
    usage: {
      total_jobs: 42,
      successful_jobs: 39,
      failed_jobs: 3,
      total_used_g: 1280,
      ...overrides.usage,
    },
  };
}

function createSelectedSpool() {
  return {
    spool: {
      id: "spool-1",
      remaining_g: 720,
      status: "IN_STOCK",
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      vendor: "Bambu",
      hex_color: "#ffffff",
    },
  };
}

function renderBoard(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    activeRootFlow: "printers",
    activePrinterId: "printer-1",
    printers: [createPrinterRow()],
    ...overrides.state,
  };

  return renderPrinterBoard({
    state,
    activePrinter: overrides.activePrinter ?? state.printers[0],
    printerSpoolOptions: overrides.printerSpoolOptions ?? [createSelectedSpool()],
    selectedSpool:
      Object.prototype.hasOwnProperty.call(overrides, "selectedSpool")
        ? overrides.selectedSpool
        : createSelectedSpool(),
    selectedAssignment: overrides.selectedAssignment ?? null,
    selectedSpoolCanLoad: overrides.selectedSpoolCanLoad ?? true,
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });
}

test("printer workspace uses human slot labels when ams ids are raw internal values", () => {
  assert.equal(
    formatPrinterSlotLabel({
      ams_id: "ams_1773326181381",
      slot_index: 1,
    }),
    "Slot 1",
  );
});

test("printer workspace labels prusa mmu printers as MMU3 channels", () => {
  assert.equal(
    formatPrinterSlotLabel(
      {
        ams_id: "printer_1_ams_1",
        slot_index: 2,
      },
      "en",
      "Prusa MK4S",
    ),
    "MMU3 · Channel 2",
  );
});

test("printer workspace labels prusa xl slots as toolheads", () => {
  assert.equal(
    formatPrinterSlotLabel(
      {
        ams_id: "printer_1_ams_1",
        slot_index: 3,
      },
      "nb",
      "Prusa XL (Dual Toolhead)",
    ),
    "Verktøyhode 3",
  );
});

test("printer workspace keeps the board focused on slots instead of readiness banners", () => {
  const html = renderBoard();

  assert.doesNotMatch(html, /Ready on X1C/);
  assert.doesNotMatch(html, /Change slot filament/);
  assert.match(html, /Load filament/);
  assert.match(html, /Update weight/);
  assert.match(html, /Clear slot/);
  assert.match(html, /slot-card-loaded/);
  assert.match(html, /slot-card-empty/);
});

test("printer workspace gives loaded slot cards a filament tint even without explicit hex colors", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-2",
          ams_id: "ams_1",
          slot_index: 2,
          spool_id: "spool-1",
          spool_material: "ABS",
          spool_filament_name: "Basic",
          spool_color_name: "Green",
          spool_hex_color: "",
          spool_remaining_g: 720,
        },
      ],
    }),
  });

  assert.match(html, /slot-card-loaded swatch-surface/);
  assert.match(html, /--swatch-rgb:/);
});

test("printer workspace shows a live badge when host live data is present", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: null,
          live_mqtt_connected: true,
        },
      ],
    }),
  });

  assert.match(html, /printer-live-dot/);
  assert.match(html, /Live ·/);
  assert.doesNotMatch(html, /printer-live-strip/);
  assert.match(html, /0 loaded · 1 open/);
});

test("printer workspace renders live telemetry from host MQTT snapshots", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: "spool-1",
          spool_material: "PLA",
          spool_filament_name: "Basic",
          spool_color_name: "Black",
          spool_remaining_g: 640,
          live_mqtt_connected: true,
          live_loaded: true,
          live_is_active: true,
          live_progress_percent: 17,
          live_remaining_minutes: 88,
          live_nozzle_temp_c: 220.2,
          live_bed_temp_c: 55.4,
          live_ams_humidity_index: 4,
          live_ams_temperature_c: 38.1,
        },
      ],
    }),
  });

  assert.match(html, /printer-live-strip/);
  assert.match(html, /Printing/);
  assert.match(html, /17% · 1 h 28 min/);
  assert.match(html, /Nozzle/);
  assert.match(html, /220 °C/);
  assert.match(html, /Bed/);
  assert.match(html, /55 °C/);
  assert.match(html, /AMS/);
  assert.match(html, />B</);
  assert.match(html, /Dry/);
  assert.match(html, /38 °C/);
});

test("printer workspace hides impossible AMS air temperatures", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: "spool-1",
          spool_material: "PLA",
          spool_filament_name: "Basic",
          spool_color_name: "Black",
          spool_remaining_g: 640,
          live_mqtt_connected: true,
          live_loaded: true,
          live_is_active: true,
          live_nozzle_temp_c: 220.2,
          live_bed_temp_c: 55.4,
          live_ams_humidity_index: 4,
          live_ams_temperature_c: 134.7,
        },
      ],
    }),
  });

  assert.match(html, /printer-live-strip/);
  assert.match(html, />B</);
  assert.doesNotMatch(html, /135 °C/);
});

test("printer workspace does not show stale job timing when only a loaded slot remains active", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-4",
          ams_id: "ams_1",
          slot_index: 4,
          spool_id: "spool-4",
          spool_material: "PLA",
          spool_filament_name: "Basic",
          spool_color_name: "White",
          spool_remaining_g: 0,
          live_mqtt_connected: true,
          live_loaded: true,
          live_is_active: true,
          live_progress_percent: 41,
          live_remaining_minutes: 25,
          live_nozzle_temp_c: 44.2,
          live_bed_temp_c: 44.1,
        },
      ],
    }),
  });

  assert.match(html, /printer-live-strip/);
  assert.match(html, /Active/);
  assert.match(html, /44 °C/);
  assert.doesNotMatch(html, /Printing/);
  assert.doesNotMatch(html, /41%/);
  assert.doesNotMatch(html, /25 min/);
});

test("printer workspace shows live slot status for unassigned observed trays", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: null,
          live_loaded: true,
          live_filament_type: "PLA",
          live_filament_name: "Basic",
          live_color_hex: "#81FB80",
          live_match_status: "unknown_rfid",
          live_remaining_percent: 74,
        },
      ],
    }),
  });

  assert.match(html, /RFID not registered/);
  assert.match(html, /PLA · Basic/);
  assert.match(html, /74%/);
  assert.match(html, /slot-card-loaded swatch-surface/);
});

test("printer workspace suggests Bambu inventory candidates for unknown live RFID", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: null,
          live_loaded: true,
          live_filament_type: "PLA",
          live_filament_name: "PLA Matte",
          live_color_hex: "#000000",
          live_match_status: "unknown_rfid",
          live_tray_uuid: "UNREGISTERED-RFID",
          live_matched_inventory_spool_id: "spool-bambu",
        },
      ],
    }),
    printerSpoolOptions: [
      {
        spool: {
          id: "spool-bambu",
          remaining_g: 940,
          status: "IN_STOCK",
          rfid_tag: null,
        },
        master: {
          material: "PLA",
          filament_name: "PLA Matte",
          color_name: "Matte Black",
          vendor: "Bambu",
          hex_color: "#000000",
        },
      },
      {
        spool: {
          id: "spool-esun",
          remaining_g: 940,
          status: "IN_STOCK",
          rfid_tag: null,
        },
        master: {
          material: "PLA",
          filament_name: "PLA+HS",
          color_name: "Black",
          vendor: "eSUN",
          hex_color: "#000000",
        },
      },
      {
        spool: {
          id: "spool-deleted",
          remaining_g: 940,
          status: "DELETED",
          rfid_tag: null,
        },
        master: {
          material: "PLA",
          filament_name: "PLA Matte",
          color_name: "Black",
          vendor: "Bambu",
          hex_color: "#000000",
        },
      },
      {
        spool: {
          id: "spool-loaned-out",
          remaining_g: 940,
          status: "BORROWED",
          rfid_tag: null,
        },
        master: {
          material: "PLA",
          filament_name: "PLA Matte",
          color_name: "Black",
          vendor: "Bambu",
          hex_color: "#000000",
        },
      },
    ],
  });

  assert.match(html, /Likely inventory roll/);
  assert.match(html, /PLA Matte · Matte Black/);
  assert.match(html, /data-action="inspect-slot-spool"/);
  assert.match(html, /data-spool-id="spool-bambu"/);
  assert.doesNotMatch(html, /spool-esun/);
  assert.doesNotMatch(html, /spool-deleted/);
  assert.doesNotMatch(html, /spool-loaned-out/);
});

test("printer workspace marks borrowed-in Bambu candidates for unknown live RFID", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: null,
          live_loaded: true,
          live_filament_type: "PLA",
          live_filament_name: "PLA Matte",
          live_color_hex: "#000000",
          live_match_status: "unknown_rfid",
          live_tray_uuid: "UNREGISTERED-RFID",
        },
      ],
    }),
    printerSpoolOptions: [
      {
        spool: {
          id: "spool-borrowed-in",
          remaining_g: 820,
          status: "IN_STOCK",
          rfid_tag: null,
          ownership_type: "BORROWED_IN",
        },
        master: {
          material: "PLA",
          filament_name: "PLA Matte",
          color_name: "Black",
          vendor: "Bambu",
          hex_color: "#000000",
        },
      },
    ],
  });

  assert.match(html, /data-spool-id="spool-borrowed-in"/);
  assert.match(html, /Borrowed-in/);
});

test("printer workspace hides implausible live remaining percentages", () => {
  const html = renderBoard({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1",
          slot_index: 1,
          spool_id: null,
          live_loaded: true,
          live_filament_type: "PLA",
          live_filament_name: "Basic",
          live_match_status: "loaded",
          live_remaining_percent: 105,
        },
      ],
    }),
  });

  assert.doesNotMatch(html, /105%/);
  assert.match(html, /PLA · Basic/);
  assert.match(html, /slot-card-loaded swatch-surface/);
});

test("printer workspace highlights the targeted empty slot without rendering an inline picker", () => {
  const html = renderBoard({
    state: {
      pendingPrinterSlotTarget: {
        printerId: "printer-1",
        printerName: "X1C",
        slotId: "slot-1",
        slotIndex: "1",
      },
    },
  });

  assert.doesNotMatch(html, /Change slot filament/);
  assert.match(html, /data-slot-targeted="true"/);
  assert.match(html, /Choose filament below\./);
});

test("printer workspace renders a direct load picker body for the targeted slot", () => {
  const html = renderPrinterPickerTaskSheetBody({
    state: {
      pendingPrinterSlotTarget: {
        printerId: "printer-1",
        printerName: "X1C",
        slotId: "slot-1",
        slotIndex: "1",
      },
      printerSpoolSearch: "",
    },
    printerSpoolOptions: [createSelectedSpool()],
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /1 ready to load/);
  assert.match(html, /data-action="assign-selected-spool"/);
  assert.match(html, /printer-picker-row/);
  assert.match(html, /Bambu · #1/);
  assert.doesNotMatch(html, /Tap to load/);
});

test("printer workspace renders a dedicated weight task sheet body for loaded slots", () => {
  const html = renderPrinterWeightTaskSheetBody({
    state: {
      locale: "nb",
      busy: false,
    },
    activeTaskSheet: {
      type: "printer-weight",
      mode: "clear",
      printerName: "Brutus",
      slotLabel: "AMS 1 · Spor 2",
      currentSpoolId: "spool-1",
      currentSpoolTitle: "ABS Azure (40601)",
      currentVendor: "Bambu",
      currentReference: "#ebcb0",
      currentLocationId: "Hylle 3",
      currentRemainingWeight: "825",
      currentMeasuredWeight: "1075",
      currentSwatchColor: "#3B82F6",
    },
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /Utgående vekt \(g\)/);
  assert.match(html, /data-action="printer-slot-operation-form"/);
  assert.match(html, /Brutus · AMS 1 · Spor 2/);
  assert.match(html, /1075/);
});

test("printer workspace localizes slot labels in norwegian", () => {
  assert.equal(
    formatPrinterSlotLabel(
      {
        ams_id: "ams_1",
        slot_index: 3,
      },
      "nb",
    ),
    "AMS 1 · Spor 3",
  );
});
