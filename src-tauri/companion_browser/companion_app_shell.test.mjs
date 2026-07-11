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

  assert.match(html, /Inventory/);
  assert.match(html, /Loans/);
  assert.match(html, /Printers/);
  assert.match(html, /Settings/);
  assert.match(html, /toggle-add-spool-form/);
  assert.match(html, /phone-bottom-nav/);
  assert.doesNotMatch(html, /class="shell-scaffold"[^>]* inert/);
});

test("app shell formats displayed grams with the selected Norwegian locale", () => {
  const spool = createSpoolRow("spool-1", {
    spool: {
      current_weight_g: 1000,
      remaining_g: 1000,
    },
  });
  const renderer = createRenderer({
    spools: [spool],
    selectedSpool: spool,
    state: {
      activeRootFlow: "storage",
      locale: "nb",
      spools: [spool],
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /1\u00a0000 g/);
  assert.doesNotMatch(html, /1,000 g/);
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
  assert.match(html, /task-sheet-shell task-sheet-shell-wide/);
  assert.match(html, /task-sheet surface-panel add-filament-sheet/);
  assert.match(html, /class="shell-scaffold"[^>]* inert aria-hidden="true"/);
});

test("app shell renderer uses the shared task-sheet shell for loan picking", () => {
  const renderer = createRenderer({
    state: {
      activeRootFlow: "loans",
      activeTaskSheet: {
        type: "loan-picker",
      },
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Lend spool/);
  assert.match(html, /Choose a spool to lend out/);
  assert.match(html, /data-action="select-loan-spool"/);
});

test("app shell renderer uses the shared task-sheet shell for loan creation", () => {
  const renderer = createRenderer({
    state: {
      activeRootFlow: "loans",
      activeTaskSheet: {
        type: "loan-create",
        spoolId: "spool-1",
      },
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Lend spool/);
  assert.match(html, /Outgoing total weight incl\. spool \(g\)/);
  assert.match(html, /data-action="loan-spool-form"/);
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
      createSpoolRow("spool-deleted", {
        spool: { status: "DELETED" },
      }),
      createSpoolRow("spool-borrowed", {
        spool: { status: "BORROWED" },
      }),
    ],
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Load filament/);
  assert.match(html, /X1C · AMS 1 · Slot 1/);
  assert.match(html, /data-action="assign-selected-spool"/);
  assert.doesNotMatch(html, /data-spool-id="spool-deleted"/);
  assert.doesNotMatch(html, /data-spool-id="spool-borrowed"/);
});

test("app shell renderer uses the shared task-sheet shell for printer slot weight updates", () => {
  const renderer = createRenderer({
    state: {
      activeRootFlow: "printers",
      activeTaskSheet: {
        type: "printer-weight",
        printerId: "printer-1",
        printerName: "Brutus",
        slotId: "slot-2",
        slotIndex: "2",
        slotLabel: "AMS 1 · Slot 2",
        spoolId: "spool-1",
        spoolTitle: "ABS Azure (40601)",
        vendor: "Bambu",
        reference: "#a1d37b",
        locationId: "Shelf B",
        remainingWeight: "825",
        currentWeight: "1075",
        swatchColor: "#3B82F6",
      },
      printers: [createPrinterRow()],
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /task-sheet-backdrop/);
  assert.match(html, /Update weight/);
  assert.match(html, /Brutus · AMS 1 · Slot 2/);
  assert.match(html, /data-action="printer-slot-operation-form"/);
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
  assert.match(html, /class="shell-scaffold"[^>]* inert aria-hidden="true"/);
});

test("app shell renderer uses observed tag uid as RFID capture fallback", () => {
  const renderer = createRenderer({
    state: {
      detailOpen: true,
      selectedDetail: createSelectedDetail("spool-1"),
      printers: [
        createPrinterRow({
          printer: {
            name: "Brutus",
          },
          slots: [
            {
              slot_id: "slot-1",
              ams_id: "ams_1",
              slot_index: 1,
              spool_id: null,
              live_loaded: true,
              live_observed_rfid_tag: "TAG-ONLY-123",
              live_tray_uuid: "",
              live_match_status: "unknown_rfid",
              live_filament_type: "PLA",
              live_filament_name: "Basic",
              live_last_identity_seen_at: "2026-06-16T12:00:00Z",
            },
          ],
        }),
      ],
    },
  });

  const html = renderer.renderRoot();

  assert.match(html, /data-action="update-spool-rfid-form"/);
  assert.match(html, /TAG-ONLY-123/);
  assert.match(html, /name="rfid-tag" value="TAG-ONLY-123"/);
  assert.match(html, /RFID not registered/);
});
