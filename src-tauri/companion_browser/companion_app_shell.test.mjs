import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionAppShellRenderer } from "./companion_app_shell.js";
import { createInitialCompanionState } from "./session_state.js";

function createSpoolRow(id, overrides = {}) {
  return {
    spool: {
      id,
      status: "IN_STOCK",
      ownership_type: "OWNED",
      owner_name: "",
      owner_contact: "",
      ownership_note: "",
      qr_code: "qr-1",
      location_id: "Shelf A",
      initial_weight_g: 1000,
      current_weight_g: 820,
      remaining_g: 820,
      ...overrides.spool,
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      vendor: "Bambu",
      hex_color: "#ffffff",
      ...overrides.master,
    },
  };
}

function createSelectedDetail(spoolId) {
  return {
    spool: {
      spool: {
        id: spoolId,
      },
    },
    usage: [],
    history: [],
  };
}

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
      },
    ],
    usage: {
      total_jobs: 12,
      total_used_g: 640,
      ...overrides.usage,
    },
  };
}

function createRenderer(overrides = {}) {
  const baseState = createInitialCompanionState();
  const state = {
    ...baseState,
    apiReady: true,
    selectedSpoolId: "spool-1",
    activeRootFlow: "storage",
    layoutMode: "phone",
    ...overrides.state,
  };
  const spools = overrides.spools ?? [createSpoolRow("spool-1")];
  const selectedSpool = overrides.selectedSpool ?? spools[0] ?? null;
  state.spools = overrides.state?.spools ?? spools;
  if (!state.selectedSpoolId && selectedSpool?.spool?.id) {
    state.selectedSpoolId = selectedSpool.spool.id;
  }

  return createCompanionAppShellRenderer({
    state,
    syncLegacySectionState: overrides.syncLegacySectionState ?? (() => {}),
    companionLogic: {
      canLoadSpoolIntoPrinter: overrides.canLoadSpoolIntoPrinter ?? (() => true),
      detailBusyStatusLabel: overrides.detailBusyStatusLabel ?? (() => "Opening spool-1"),
      filteredLoanRows: overrides.filteredLoanRows ?? (() => []),
      filteredSpools: overrides.filteredSpools ?? (() => spools),
      findAssignedSlotForSpool: overrides.findAssignedSlotForSpool ?? (() => null),
      heroRefreshButtonLabel: overrides.heroRefreshButtonLabel ?? (() => "Refresh companion data"),
      loanActionState: overrides.loanActionState ?? (() => ({ allowed: true, reason: "" })),
      loanHistorySummary: overrides.loanHistorySummary ?? (() => ({ active: 0, returned: 0, total: 0 })),
      openingSpoolLabel: overrides.openingSpoolLabel ?? ((id) => `Opening ${id}`),
      selectedSpoolRow: overrides.selectedSpoolRow ?? (() => selectedSpool),
      selectionClearedAfterBorrowedInHandBack:
        overrides.selectionClearedAfterBorrowedInHandBack ?? (() => false),
    },
  });
}

test("app shell renderer falls back to trusted-LAN pairing chrome before the browser session is ready", () => {
  const renderer = createRenderer({
    state: {
      apiReady: false,
      statusMessage: "Waiting for a trusted-LAN pairing link.",
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /Trusted-LAN browser companion/);
  assert.match(html, /trusted-LAN pairing link/i);
  assert.doesNotMatch(html, /phone-bottom-nav/);
});

test("app shell renderer composes the mobile shell with the four primary tabs", () => {
  const renderer = createRenderer({
    state: {
      activeRootFlow: "storage",
      loanHistory: [{ loan: { spool_id: "spool-1" } }],
      activeLoans: [{ id: "loan-1" }],
      printers: [{ printer: { id: "printer-1", name: "Bench Printer" }, slots: [], usage: {} }],
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /Storage/);
  assert.match(html, /Loans/);
  assert.match(html, /Printers/);
  assert.match(html, /Settings/);
  assert.match(html, /toggle-add-spool-form/);
  assert.match(html, /phone-bottom-nav/);
});

test("app shell renderer opens add-spool task sheets above the root flow when requested", () => {
  const renderer = createRenderer({
    state: {
      activeTaskSheet: { type: "storage-add" },
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Add filament/);
  assert.match(html, /Add spool to inventory/);
});

test("app shell renderer uses the shared task-sheet shell for slot-targeted printer loading", () => {
  const renderer = createRenderer({
    state: {
      activeRootFlow: "printers",
      activeTaskSheet: {
        type: "printer-picker",
        printerId: "printer-1",
        printerName: "X1C",
        slotId: "slot-1",
        slotIndex: "1",
        slotLabel: "AMS 1 · Slot 1",
      },
      pendingPrinterSlotTarget: {
        printerId: "printer-1",
        printerName: "X1C",
        slotId: "slot-1",
        slotIndex: "1",
        slotLabel: "AMS 1 · Slot 1",
      },
      printers: [createPrinterRow()],
    },
    spools: [
      createSpoolRow("spool-1"),
      createSpoolRow("spool-2", {
        spool: {
          location_id: "Shelf B",
          remaining_g: 640,
        },
        master: {
          material: "PETG",
          filament_name: "Tough",
          color_name: "Blue",
          vendor: "eSUN",
          hex_color: "#2563EB",
        },
      }),
    ],
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Load filament/);
  assert.match(html, /X1C · AMS 1 · Slot 1/);
  assert.match(html, /data-action="assign-selected-spool"/);
});

test("app shell renderer includes the selected spool detail modal when opened", () => {
  const renderer = createRenderer({
    state: {
      detailOpen: true,
      selectedDetail: createSelectedDetail("spool-1"),
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /detail-modal-backdrop/);
  assert.match(html, /Save weight/);
  assert.match(html, /QR code/);
});
