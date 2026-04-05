import test from "node:test";
import assert from "node:assert/strict";

import { createInitialCompanionState } from "./session_state.js";
import { renderLoanReturnTaskSheetBody, renderLoansShell } from "./loans_shell.js";

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
    hex_color: "#ffffff",
    ...overrides,
  };
}

function createSelectedSpool() {
  return {
    spool: {
      id: "spool-1",
      remaining_g: 500,
    },
    master: {
      material: "PLA",
      filament_name: "Basic",
      color_name: "White",
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
  assert.match(html, /#1/);
  assert.match(html, /Active/);
  assert.match(html, /Open spool/);
  assert.match(html, /Return loan/);
  assert.match(html, /Track loans and finish returns\./);
  assert.match(html, /loan-card compact-loan-card swatch-surface/);
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
  assert.match(html, /Returned weight \(grams\)/);
  assert.doesNotMatch(html, /Marks the loan returned in local data\./);
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
});
