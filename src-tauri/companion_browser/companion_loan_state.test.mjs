import test from "node:test";
import assert from "node:assert/strict";

import {
  isActiveOutboundLoan,
  isLoanCurrentlyActive,
  loanHasDeletedSpool,
} from "./companion_loan_state.js";

function loanRow(overrides = {}) {
  return {
    loan: {
      loan_direction: "OUTBOUND",
      loan_status: "ACTIVE",
      returned_at: null,
      ...overrides.loan,
    },
    spool_status: "BORROWED",
    ...overrides,
  };
}

test("companion loan state ignores legacy active rows for deleted spools", () => {
  assert.equal(loanHasDeletedSpool(loanRow({ spool_status: "DELETED" })), true);
  assert.equal(isLoanCurrentlyActive(loanRow()), true);
  assert.equal(isLoanCurrentlyActive(loanRow({ spool_status: "DELETED" })), false);
  assert.equal(
    isLoanCurrentlyActive(
      loanRow({
        loan: {
          returned_at: "2026-04-02 10:00:00",
          loan_status: "RETURNED",
        },
      }),
    ),
    false,
  );
});

test("companion outbound active state rejects inbound, returned, and deleted rows", () => {
  assert.equal(isActiveOutboundLoan(loanRow()), true);
  assert.equal(
    isActiveOutboundLoan(
      loanRow({
        loan: {
          loan_direction: "INBOUND",
        },
      }),
    ),
    false,
  );
  assert.equal(
    isActiveOutboundLoan(
      loanRow({
        loan: {
          returned_at: "2026-04-02 10:00:00",
          loan_status: "RETURNED",
        },
      }),
    ),
    false,
  );
  assert.equal(isActiveOutboundLoan(loanRow({ spool_status: "DELETED" })), false);
});
