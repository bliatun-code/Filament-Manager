import test from "node:test";
import assert from "node:assert/strict";

import { createCompanionLogic } from "./companion_logic.js";
import { createInitialCompanionState, resetSessionState } from "./session_state.js";

const SECTIONS = new Set(["inventory", "printers", "detail", "loans"]);
const SECTION_LABELS = {
  inventory: "Inventory",
  printers: "Printers",
  detail: "Detail",
  loans: "Loans",
};

function createSpoolRow(id, overrides = {}) {
  return {
    spool: {
      id,
      owner_name: "",
      status: "IN_STOCK",
      qr_code: "",
      location_id: "",
      ownership_type: "OWNED",
      remaining_g: 850,
      ...overrides.spool,
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
      vendor: "Bambu",
      ...overrides.master,
    },
    location_name: overrides.location_name ?? null,
    home_location_name: overrides.home_location_name ?? null,
  };
}

function createLoanRow(spoolId, overrides = {}) {
  return {
    loan_direction: overrides.loan_direction ?? "OUTBOUND",
    material: "PLA",
    filament_name: "Basic",
    color_name: "White",
    vendor: "Bambu",
    ...overrides,
    loan: {
      id: `loan-${spoolId}`,
      spool_id: spoolId,
      borrower_name: "Alex",
      counterparty_name: "",
      returned_at: null,
      lent_note: "",
      return_note: "",
      ...overrides.loan,
    },
  };
}

function createPrinter(spoolId, overrides = {}) {
  return {
    printer: {
      id: "printer-1",
      name: "X1C",
      ...overrides.printer,
    },
    slots: [
      {
        slot_id: "slot-1",
        slot_index: 1,
        spool_id: spoolId,
        ...overrides.slot,
      },
    ],
  };
}

function createLogic(overrides = {}) {
  const state = {
    ...createInitialCompanionState(),
    ...overrides,
    borrowedInDraft: overrides.borrowedInDraft ?? createInitialCompanionState().borrowedInDraft,
  };
  const logic = createCompanionLogic({
    state,
    sections: SECTIONS,
    sectionLabels: SECTION_LABELS,
  });
  return { state, logic };
}

test("detail recovery stays anchored to the snapped recovery section in compact mode", () => {
  const { logic } = createLogic({
    selectionRecoveryReason: "borrowed_in_hand_back",
    detailBusy: true,
    compactLayout: true,
    activeSection: "detail",
    detailReturnSection: "inventory",
    recoveryOpeningTarget: {
      sectionId: "loans",
      spoolId: "spool-9",
      sourceTag: "Loan history",
      previewLabel: "spool-9 · Alex",
      buttonLabel: "Select suggested spool",
    },
  });

  assert.equal(logic.detailSectionMetaLabel(), "Opening spool-9");
  assert.equal(logic.activeRecoverySection(), "loans");
  assert.equal(logic.recoveryOpeningActiveForSection("loans"), true);
  assert.equal(logic.recoveryOpeningActiveForSection("inventory"), false);
  assert.equal(logic.recoveryOpeningSummary("loans"), "Opening spool-9 from Loan history now.");
});

test("printer recovery falls back to active inventory spools even when the current search hides them", () => {
  const { logic } = createLogic({
    search: "not-present",
    spools: [createSpoolRow("spool-2"), createSpoolRow("spool-1")],
    printers: [createPrinter("spool-2")],
  });

  const target = logic.recoveryTargetForSection("printers");
  assert.equal(target?.spoolId, "spool-2");
  assert.equal(target?.sourceTag, "Printer slot");
  assert.match(target?.previewLabel ?? "", /X1C slot 1/);
});

test("filteredSpools excludes EMPTY rows from storage visibility", () => {
  const { logic } = createLogic({
    spools: [
      createSpoolRow("spool-in-stock", {
        spool: { status: "IN_STOCK" },
      }),
      createSpoolRow("spool-empty", {
        spool: { status: "EMPTY" },
      }),
    ],
  });

  const visibleIds = logic.filteredSpools().map((row) => row.spool.id);
  assert.deepEqual(visibleIds, ["spool-in-stock"]);
});

test("filteredSpools searches human location names from Host DTOs", () => {
  const { logic } = createLogic({
    search: "dry box",
    spools: [
      createSpoolRow("spool-location", {
        spool: { location_id: "location_aaaaaaaa" },
        location_name: "Dry box",
      }),
      createSpoolRow("spool-other"),
    ],
  });

  assert.deepEqual(logic.filteredSpools().map((row) => row.spool.id), [
    "spool-location",
  ]);
});

test("printer load guard excludes inactive spool statuses", () => {
  const { logic } = createLogic();

  assert.equal(logic.canLoadSpoolIntoPrinter(createSpoolRow("spool-ready")), true);
  for (const status of ["BORROWED", "EMPTY", "LOST", "DELETED", "MISSING"]) {
    assert.equal(
      logic.canLoadSpoolIntoPrinter(createSpoolRow(`spool-${status}`, { spool: { status } })),
      false,
    );
  }
});

test("loan guard helper preserves browser-safe write constraints", () => {
  const { logic } = createLogic();

  const borrowedInState = logic.loanActionState(
    createSpoolRow("spool-4", {
      spool: { ownership_type: "BORROWED_IN" },
    }),
  );
  assert.equal(borrowedInState.allowed, false);
  assert.match(borrowedInState.reason, /Borrowed-in spools/);

});

test("loan filters and summary ignore legacy active rows for deleted spools", () => {
  const { state, logic } = createLogic({
    loanStatusFilter: "ACTIVE",
    loanHistory: [
      createLoanRow("active-spool"),
      createLoanRow("deleted-spool", {
        spool_status: "DELETED",
      }),
      createLoanRow("returned-spool", {
        loan: {
          returned_at: "2026-04-02 10:00:00",
        },
      }),
      createLoanRow("status-returned-spool", {
        loan: {
          loan_status: "RETURNED",
          returned_at: null,
        },
      }),
      createLoanRow("lost-spool", {
        loan: {
          loan_status: "LOST",
          returned_at: null,
        },
      }),
    ],
  });

  assert.deepEqual(
    logic.filteredLoanRows().map((row) => row.loan.spool_id),
    ["active-spool"],
  );
  assert.deepEqual(logic.loanHistorySummary(), {
    active: 1,
    returned: 2,
    total: 5,
  });

  state.loanStatusFilter = "ALL";
  assert.deepEqual(
    logic.filteredLoanRows().map((row) => row.loan.spool_id),
    ["active-spool", "deleted-spool", "returned-spool", "status-returned-spool", "lost-spool"],
  );

  state.loanStatusFilter = "RETURNED";
  assert.deepEqual(
    logic.filteredLoanRows().map((row) => row.loan.spool_id),
    ["returned-spool", "status-returned-spool"],
  );
});

test("hero refresh label reflects recovery-driven detail opens", () => {
  const { logic } = createLogic({
    detailBusy: true,
    selectedSpoolId: "",
    recoveryOpeningTarget: {
      sectionId: "inventory",
      spoolId: "spool-7",
    },
  });

  assert.equal(logic.heroRefreshButtonLabel(), "Opening spool-7...");
});

test("recovery and loan guard copy follows norwegian locale", () => {
  const { logic } = createLogic({
    locale: "nb",
    selectionRecoveryReason: "borrowed_in_hand_back",
    detailBusy: true,
    compactLayout: true,
    activeSection: "detail",
    recoveryOpeningTarget: {
      sectionId: "loans",
      spoolId: "spool-9",
      sourceTag: "Utlånshistorikk",
      previewLabel: "spool-9 · Alex",
      buttonLabel: "Velg foreslått spole",
    },
  });

  assert.equal(logic.recoveryTabNoteLabel("loans"), "Fra Utlånshistorikk");
  assert.equal(logic.recoveryOpeningSummary("loans"), "Åpner spool-9 fra Utlånshistorikk nå.");
  assert.equal(logic.detailSectionMetaLabel(), "Åpner spool-9");

  const borrowedInState = logic.loanActionState(
    createSpoolRow("spool-4", {
      spool: { ownership_type: "BORROWED_IN" },
    }),
  );
  assert.equal(borrowedInState.allowed, false);
  assert.match(borrowedInState.reason, /Innlånte spoler/);
});

test("session reset clears stale companion data but preserves the current layout mode", () => {
  const state = createInitialCompanionState();
  Object.assign(state, {
    apiReady: true,
    csrfToken: "csrf",
    search: "pla",
    loanSearch: "alex",
    spools: [createSpoolRow("spool-1")],
    printers: [createPrinter("spool-1")],
    activeLoans: [createLoanRow("spool-1")],
    loanHistory: [createLoanRow("spool-1")],
    selectedSpoolId: "spool-1",
    detailBusy: true,
    busy: true,
    compactLayout: true,
    borrowedInDraft: {
      ownerName: "Someone",
      ownerContact: "owner@example.com",
      material: "PETG",
      filamentName: "Tough",
      colorName: "Blue",
      vendor: "Generic",
      initialWeight: "750",
      qrCode: "qr-1",
      location: "Shelf A",
      note: "temp",
    },
  });

  resetSessionState(state);

  assert.equal(state.apiReady, false);
  assert.equal(state.csrfToken, "");
  assert.deepEqual(state.spools, []);
  assert.deepEqual(state.printers, []);
  assert.deepEqual(state.loanHistory, []);
  assert.equal(state.selectedSpoolId, "");
  assert.equal(state.detailBusy, false);
  assert.equal(state.busy, false);
  assert.equal(state.compactLayout, true);
  assert.deepEqual(state.borrowedInDraft, createInitialCompanionState().borrowedInDraft);
});
