import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createInitialCompanionState } from "./session_state.js";
import {
  renderLoanCreateTaskSheetBody,
  renderLoanPickerTaskSheetBody,
  renderLoanReturnTaskSheetBody,
  renderLoansShell,
} from "./loans_shell.js";

const loansShellSource = readFileSync(new URL("./loans_shell.js", import.meta.url), "utf8");

function createLoanRow(overrides = {}) {
  const { loan: loanOverrides = {}, ...rowOverrides } = overrides;
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
      ...loanOverrides,
    },
    material: "PLA",
    filament_name: "Basic",
    color_name: "White",
    vendor: "Bambu",
    spool_remaining_g: 500,
    spool_tare_weight_g: 250,
    hex_color: "#ffffff",
    ...rowOverrides,
  };
}

function createSelectedSpool(overrides = {}) {
  return {
    spool: {
      id: "spool-1",
      remaining_g: 500,
      spool_tare_weight_g: 250,
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

test("loans shell routes empty and info states through shared companion cards", () => {
  assert.match(loansShellSource, /renderCompanionStateCard/);
  assert.doesNotMatch(loansShellSource, /<div class="(?:empty-card|info-card)"/);

  const html = renderShell({
    loanRows: [],
    loanSpoolOptions: [],
  });

  assert.match(html, /class="info-card">No spools are currently available for outbound loan\./);
  assert.match(html, /class="empty-card">No loans match this search or filter\./);
});

test("loan lists and the loan picker render large candidate sets progressively", () => {
  const loanRows = Array.from({ length: 5_000 }, (_, index) =>
    createLoanRow({
      loan: {
        id: `loan-${index}`,
        spool_id: `spool-${index}`,
      },
    }),
  );
  const loanSpoolOptions = Array.from({ length: 10_000 }, (_, index) =>
    createSelectedSpool({ spool: { id: `candidate-${index}` } }),
  );
  const shellHtml = renderShell({
    loanRows,
    loanSummary: { active: 5_000, returned: 0, total: 5_000 },
    loanSpoolOptions,
    selectedSpool: null,
  });
  assert.equal((shellHtml.match(/loan-card compact-loan-card swatch-surface/g) || []).length, 150);
  assert.match(shellHtml, /data-action="show-more-loans"/);

  const pickerHtml = renderLoanPickerTaskSheetBody({
    state: createInitialCompanionState(),
    loanSpoolOptions,
    escapeHtml: (value) => String(value ?? ""),
    formatGrams: (value) => `${value ?? 0} g`,
  });
  assert.equal((pickerHtml.match(/data-action="select-loan-spool"/g) || []).length, 150);
  assert.match(pickerHtml, /data-action="show-more-loan-picker"/);
  assert.match(pickerHtml, />\+150 · 300\/10000</);
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
  assert.match(html, /surface-card companion-selection-card swatch-surface compact-loan-card loan-return-card/);
  assert.match(html, /companion-selection-card-head/);
  assert.match(html, /PLA · Basic · White/);
  assert.match(html, /Bambu · #1 · Borrower: Alex/);
  const returnButton = html.match(/<button[^>]*>Complete return<\/button>/)?.[0] ?? "";
  assert.match(returnButton, /class="primary-button" type="submit"/);
  assert.doesNotMatch(returnButton, /swatch-action-button|disabled/);
  assert.match(html, /class="metric-card loan-date-metric"/);
  assert.match(html, /Returned total weight incl\. spool \(g\)/);
  assert.match(html, /data-form-key="loan-return:loan-1"/);
  assert.match(html, /aria-describedby="loan-return-calculation"/);
  assert.match(html, /Suggested return calculation/);
  assert.doesNotMatch(html, /role="status"|aria-live=/);
  assert.match(html, /750 g total − 250 g spool tare = 500 g returned filament/);
  assert.match(html, /Estimated used: 140 g/);
  assert.match(html, /value="750"/);
  assert.doesNotMatch(html, /^\s*<div class="stack loan-return-task-sheet">\s*<div class="metric-grid compact-loan-metadata">/);
  assert.doesNotMatch(html, /Marks the loan returned in local data\./);
});

test("loan return task sheet explains the real Bambu total-weight calculation", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
  };
  const html = renderLoanReturnTaskSheetBody({
    state,
    loanRow: createLoanRow({
      loan: {
        id: "loan-gray",
        spool_id: "spool-gray",
        borrower_name: "Erik",
        returned_at: null,
        lent_at: "2026-05-20T14:47:36Z",
        grams_out: 1000,
        lent_note: "",
        return_note: "",
      },
      color_name: "Matte Ash Gray (11102)",
      hex_color: "#9B9EA0",
      spool_remaining_g: 1000,
      spool_tare_weight_g: null,
    }),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  const returnButton = html.match(/<button[^>]*>Complete return<\/button>/)?.[0] ?? "";
  assert.match(html, /value="1250"/);
  assert.match(html, /1250 g total − 250 g spool tare = 1000 g returned filament/);
  assert.match(html, /Estimated used: 0 g/);
  assert.match(returnButton, /class="primary-button" type="submit"/);
  assert.doesNotMatch(returnButton, /swatch-action-button|disabled|style=/);
  assert.match(html, /class="surface-card companion-selection-card swatch-surface compact-loan-card loan-return-card"/);
});

test("loan return task sheet disables its stable primary action while busy", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: true,
  };
  const html = renderLoanReturnTaskSheetBody({
    state,
    loanRow: createLoanRow(),
    escapeHtml: (value) => String(value ?? ""),
    formatDate: (value) => (value ? `date:${value}` : "Unknown"),
    formatGrams: (value) => `${value ?? 0} g`,
  });

  const returnButton = html.match(/<button[^>]*>Complete return<\/button>/)?.[0] ?? "";
  assert.match(returnButton, /class="primary-button" type="submit" disabled/);
  assert.doesNotMatch(returnButton, /swatch-action-button|style=/);
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
  assert.match(html, /aria-describedby="loan-outgoing-calculation"/);
  assert.match(html, /id="loan-outgoing-calculation"/);
  assert.match(html, /Suggested outgoing calculation/);
  assert.match(html, /750 g total − 250 g spool tare = 500 g filament lent out/);
  assert.doesNotMatch(html, /id="loan-outgoing-calculation"[\s\S]*?role="status"|aria-live=/);
  assert.match(html, /value="750"/);
  assert.match(html, /Loaded in slot 2 on Brutus/);
});

test("loan create task sheet explains the real eSUN fallback tare without formatting the raw input", () => {
  const state = {
    ...createInitialCompanionState(),
    busy: false,
    locale: "nb",
  };
  const numberFormat = new Intl.NumberFormat("nb-NO");
  const formatGrams = (value) => `${numberFormat.format(Number(value))} g`;
  const html = renderLoanCreateTaskSheetBody({
    state,
    selectedSpool: createSelectedSpool({
      spool: {
        id: "spool-esun-blue",
        remaining_g: 1000,
        spool_tare_weight_g: null,
      },
      master: {
        material: "PETG+HS",
        filament_name: "",
        color_name: "Blue",
        vendor: "eSUN",
        hex_color: "#5593D9",
      },
    }),
    selectedAssignment: null,
    escapeHtml: (value) => String(value ?? ""),
    formatGrams,
  });

  assert.match(html, /Utgående totalvekt inkl\. spole \(g\)/);
  assert.match(html, /aria-describedby="loan-outgoing-calculation"/);
  assert.match(html, /Regnestykke for foreslått utgående vekt/);
  assert.ok(
    html.includes(
      `${formatGrams(1224)} totalvekt − ${formatGrams(224)} rullens tomvekt = ${formatGrams(1000)} filament lånes ut`,
    ),
  );
  assert.match(html, /value="1224"/);
  assert.doesNotMatch(html, /value="1[^\d]224"/);
  assert.doesNotMatch(html, /role="status"|aria-live=/);
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
