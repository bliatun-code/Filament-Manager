import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import { renderPrintersShell } from "./printers_shell.js";

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

function renderShell(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    activeRootFlow: "printers",
    activePrinterId: "printer-1",
    printers: [createPrinterRow()],
    ...overrides.state,
  };
  const selectedSpool =
    Object.prototype.hasOwnProperty.call(overrides, "selectedSpool")
      ? overrides.selectedSpool
      : createSelectedSpool();

  return renderPrintersShell({
    state,
    activePrinter: overrides.activePrinter ?? state.printers[0],
    printerSpoolOptions: overrides.printerSpoolOptions ?? (selectedSpool ? [selectedSpool] : []),
    selectedSpool,
    selectedAssignment: overrides.selectedAssignment ?? null,
    selectedSpoolCanLoad: overrides.selectedSpoolCanLoad ?? true,
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });
}

test("printers shell renders a focused printer roster plus active board", () => {
  const secondPrinter = createPrinterRow({
    printer: {
      id: "printer-2",
      name: "Brutus",
      model: "Bambu Lab P1S",
    },
  });
  const html = renderShell();
  const multiHtml = renderShell({
    state: {
      printers: [createPrinterRow(), secondPrinter],
    },
  });

  assert.match(html, /Printers/);
  assert.match(html, /X1C/);
  assert.match(html, /Slot 1/);
  assert.match(html, /Slot 2/);
  assert.match(html, /1 loaded · 1 open/);
  assert.match(html, /printer-brand-surface/);
  assert.match(html, /--brand-rgb:0 177 64/);
  assert.match(html, /slot-card-loaded swatch-surface/);
  assert.doesNotMatch(html, /data-action="select-printer"/);
  assert.match(multiHtml, /data-action="select-printer"/);
  assert.match(multiHtml, /printer-roster/);
});

test("printers shell hides the roster when only one printer is configured", () => {
  const html = renderShell();

  assert.match(html, /printers-workspace--single/);
  assert.doesNotMatch(html, /class="surface-panel printer-roster"/);
});

test("printers shell keeps a compact top roster when multiple printers are configured", () => {
  const html = renderShell({
    state: {
      printers: [
        createPrinterRow(),
        createPrinterRow({
          printer: {
            id: "printer-2",
            name: "Brutus",
            model: "Bambu Lab P1S",
          },
        }),
      ],
    },
  });

  assert.match(html, /printers-workspace--with-roster/);
  assert.match(html, /class="surface-panel printer-roster"/);
  assert.match(html, /Brutus/);
});

test("printers shell keeps empty slots and loaded slots on different action paths", () => {
  const html = renderShell();

  assert.doesNotMatch(html, /Ready on X1C/);
  assert.doesNotMatch(html, /Change filament/);
  assert.match(html, /Load filament/);
  assert.match(html, /Update weight/);
  assert.match(html, /Clear slot/);
});

test("printers shell keeps the board calm even when picker state is active", () => {
  const html = renderShell();

  assert.doesNotMatch(html, /Ready on X1C/);
  assert.doesNotMatch(html, /Change slot filament/);
  assert.match(html, /Load filament/);
});

test("printers shell does not depend on a selected spool for empty-slot actions", () => {
  const html = renderShell({
    selectedSpool: null,
    printerSpoolOptions: [
      {
        spool: {
          id: "spool-9",
          remaining_g: 810,
          status: "IN_STOCK",
          location_id: "Shelf B",
        },
        master: {
          material: "PETG",
          filament_name: "Tough",
          color_name: "Blue",
          vendor: "eSUN",
          hex_color: "#2563EB",
        },
      },
    ],
    selectedSpoolCanLoad: false,
  });

  assert.doesNotMatch(html, /No filament selected for slot work/);
  assert.match(html, /start-printer-slot-assignment/);
  assert.match(html, /Load filament/);
  assert.doesNotMatch(html, /select-printer-spool/);
});

test("printers shell marks the targeted slot without inlining the filament picker", () => {
  const html = renderShell({
    selectedSpool: null,
    state: {
      pendingPrinterSlotTarget: {
        printerId: "printer-1",
        printerName: "X1C",
        slotId: "slot-1",
        slotIndex: "1",
      },
    },
    printerSpoolOptions: [
      {
        spool: {
          id: "spool-9",
          remaining_g: 810,
          status: "IN_STOCK",
          location_id: "Shelf B",
        },
        master: {
          material: "PETG",
          filament_name: "Tough",
          color_name: "Blue",
          vendor: "eSUN",
          hex_color: "#2563EB",
        },
      },
    ],
    selectedSpoolCanLoad: false,
  });

  assert.match(html, /data-slot-targeted="true"/);
  assert.match(html, /Choose filament below\./);
  assert.doesNotMatch(html, /data-action="assign-selected-spool"/);
});

test("printers shell falls back to human slot labels when ams ids are raw internal values", () => {
  const html = renderShell({
    activePrinter: createPrinterRow({
      slots: [
        {
          slot_id: "slot-1",
          ams_id: "ams_1773326181381",
          slot_index: 1,
          spool_id: null,
          spool_remaining_g: null,
        },
      ],
    }),
    state: {
      printers: [
        createPrinterRow({
          slots: [
            {
              slot_id: "slot-1",
              ams_id: "ams_1773326181381",
              slot_index: 1,
              spool_id: null,
              spool_remaining_g: null,
            },
          ],
        }),
      ],
    },
  });

  assert.match(html, />Slot 1</);
  assert.doesNotMatch(html, /AMS 1773326181381/);
});

test("printers shell localizes primary headings in norwegian", () => {
  const html = renderShell({
    state: {
      locale: "nb",
    },
  });

  assert.match(html, /Printere/);
});
