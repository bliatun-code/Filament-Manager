import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import {
  renderLoanCreateTaskSheetBody,
  renderLoanPickerTaskSheetBody,
  renderLoanReturnTaskSheetBody,
  renderLoansShell,
} from "./loans_shell.js";

function createLoanRow(overrides = {}) {
  return {
    loan: {
      id: "loan-1",
      spool_id: "spool-1",
      borrower_name: "Alex",
      returned_at: null,
      lent_at: "2026-03-22T10:00:00Z",
      grams_out: 640,
      lent_note: "",
      return_note: "",
      ...overrides.loan,
    },
    material: "PLA",
    filament_name: "Basic",
    color_name: "White",
    vendor: "Bambu",
    spool_remaining_g: 500,
    spool_tare_weight_g: 250,
    hex_color: "#ffffff",
    ...overrides,
  };
}

function createSelectedSpool() {
  return {
    spool: {
      id: "spool-1",
      remaining_g: 500,
      spool_tare_weight_g: 250,
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
    activeRootFlow: "loans",
    loanHistory: [createLoanRow()],
    activeLoans: [createLoanRow()],
    ...overrides.state,
  };

  return renderLoansShell({
    state,
    loanRows: overrides.loanRows ?? state.loanHistory,
    loanSummary: overrides.loanSummary ?? { active: 1, returned: 0, total: 1 },
    loanSpoolOptions: overrides.loanSpoolOptions ?? [createSelectedSpool()],
    selectedSpool:
      Object.prototype.hasOwnProperty.call(overrides, "selectedSpool")
        ? overrides.selectedSpool
        : createSelectedSpool(),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
  });
}

test("loans shell renders outbound history as its own primary flow", () => {
  const html = renderShell();

  assert.match(html, /Loans/);
  assert.match(html, /data-action="set-loan-status"/);
  assert.match(html, /filter-chip-button loan-filter-button/);
  assert.match(html, /#1/);
  assert.match(html, /Active/);
  assert.match(html, /Return loan/);
  assert.match(html, /Track loans and finish returns\./);
  assert.match(html, /loan-card compact-loan-card swatch-surface/);
  assert.match(html, /primary-button swatch-action-button loan-action-button/);
  assert.match(html, /data-action="start-loan-picker"/);
});

test("loans shell keeps return UI out of the row until a task sheet opens", () => {
  const html = renderShell({
    state: {
      expandedLoanReturnId: "",
    },
  });

  assert.match(html, />\s*Return loan\s*</);
  assert.doesNotMatch(html, /Returned weight \(g\)/);
});

test("loans shell marks deleted active history inactive without return action", () => {
  const html = renderShell({
    state: {
      activeLoans: [],
    },
    loanRows: [createLoanRow({ spool_status: "DELETED" })],
    loanSummary: { active: 0, returned: 0, total: 1 },
  });

  assert.match(html, /Inactive/);
  assert.doesNotMatch(html, />\s*Return loan\s*</);
  assert.doesNotMatch(html, /on spool/);
});

test("loans shell treats returned status without timestamp as returned", () => {
  const html = renderShell({
    state: {
      activeLoans: [],
    },
    loanRows: [
      createLoanRow({
        loan: {
          loan_status: "RETURNED",
          returned_at: null,
        },
      }),
    ],
    loanSummary: { active: 0, returned: 1, total: 1 },
  });

  assert.match(html, /Returned/);
  assert.doesNotMatch(html, />\s*Return loan\s*</);
  assert.doesNotMatch(html, /on spool/);
});

test("loan return task sheet renders the compact return form", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
  };
  const html = renderLoanReturnTaskSheetBody({
    state,
    loanRow: createLoanRow(),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /Complete return/);
  assert.match(html, /class="primary-button swatch-action-button" type="submit" style="--swatch-rgb:/);
  assert.match(html, /Returned total weight incl\. spool \(g\)/);
  assert.match(html, /value="750"/);
  assert.doesNotMatch(html, /Marks the loan returned in local data\./);
});

test("loan picker uses the same swatch list row language as add filament", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
  };
  const html = renderLoanPickerTaskSheetBody({
    state,
    loanSpoolOptions: [createSelectedSpool()],
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /list-row dense-list-row spool-list-row swatch-surface loan-picker-option/);
  assert.match(html, /data-action="select-loan-spool"/);
  assert.match(html, /--swatch-rgb/);
  assert.doesNotMatch(html, /loan-card compact-loan-card swatch-surface loan-picker-option/);
});

test("loan create task sheet renders outgoing measured weight and slot warning", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
  };
  const html = renderLoanCreateTaskSheetBody({
    state,
    selectedSpool: createSelectedSpool(),
    selectedAssignment: {
      printerName: "Brutus",
      slotIndex: 2,
    },
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /Lend spool/);
  assert.match(html, /surface-card companion-selection-card swatch-surface compact-loan-card loan-create-card/);
  assert.match(html, /companion-selection-card-head/);
  assert.match(html, /primary-button swatch-action-button/);
  assert.match(html, /data-action="loan-spool-form"/);
  assert.match(html, /Outgoing total weight incl\. spool \(g\)/);
  assert.match(html, /value="750"/);
  assert.match(html, /Loaded in slot 2 on Brutus/);
});

test("loans shell shows cross-flow recovery actions when filters hide the selected spool history", () => {
  const html = renderShell({
    state: {
      selectedSpoolId: "spool-1",
      loanStatusFilter: "RETURNED",
    },
    loanRows: [],
    loanSummary: { active: 1, returned: 0, total: 1 },
  });

  assert.match(html, /Selected spool hidden/);
  assert.match(html, /#1/);
  assert.match(html, /500 g/);
  assert.match(html, /Active 1/);
  assert.match(html, /data-root-flow="storage"/);
  assert.match(html, /Detail/);
  assert.match(html, /Show all loans/);
});

test("loans shell localizes core copy in norwegian", () => {
  const html = renderShell({
    state: {
      locale: "nb",
    },
  });

  assert.match(html, /Utlån/);
  assert.match(html, /Aktive 1/);
  assert.match(html, /Registrer retur/);
  assert.match(html, /aria-label="Utlånsfiltre"/);
});

test("loan return task sheet switches inbound records to hand-back flow", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
    locale: "nb",
  };
  const html = renderLoanReturnTaskSheetBody({
    state,
    loanRow: createLoanRow({
      loan: {
        loan_direction: "INBOUND",
        borrower_name: "",
        counterparty_name: "Riley",
      },
    }),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  assert.match(html, /hand-back-loan-form/);
  assert.match(html, /Tilbakelevert totalvekt inkl\. spole \(g\)/);
  assert.match(html, /Lever tilbake spole/);
});
