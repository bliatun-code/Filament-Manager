import test from "node:test";
import assert from "node:assert/strict";

import {
  isActiveOutboundLoan,
  isLoanClosed,
  isLoanCurrentlyActive,
  isLoanReturned,
  normalizeLoanDirection,
  loanHasDeletedSpool,
  normalizeLoanStatus,
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
  assert.equal(loanHasDeletedSpool(loanRow({ spool_status: " deleted " })), true);
  assert.equal(loanHasDeletedSpool(loanRow({ spool_status: "MISSING" })), false);
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

test("companion loan state normalizes closed loan status tokens", () => {
  assert.equal(normalizeLoanStatus(loanRow({ loan: { loan_status: "returned" } })), "RETURNED");
  assert.equal(normalizeLoanStatus(loanRow({ loan: { loan_status: "loan-cancelled" } })), "ACTIVE");
  assert.equal(isLoanReturned(loanRow({ loan: { loan_status: "RETURNED", returned_at: null } })), true);
  assert.equal(isLoanClosed(loanRow({ loan: { loan_status: "RETURNED", returned_at: null } })), true);
  assert.equal(isLoanClosed(loanRow({ loan: { loan_status: "lost", returned_at: null } })), true);
  assert.equal(isLoanClosed(loanRow({ loan: { loan_status: "cancelled", returned_at: null } })), true);
  assert.equal(isLoanCurrentlyActive(loanRow({ loan: { loan_status: "RETURNED", returned_at: null } })), false);
  assert.equal(isLoanCurrentlyActive(loanRow({ loan: { loan_status: "LOST", returned_at: null } })), false);
  assert.equal(isLoanCurrentlyActive(loanRow({ loan: { loan_status: "CANCELLED", returned_at: null } })), false);
});

test("companion outbound active state rejects inbound, returned, and deleted rows", () => {
  assert.equal(isActiveOutboundLoan(loanRow()), true);
  assert.equal(normalizeLoanDirection(loanRow({ loan: { loan_direction: "inbound" } })), "INBOUND");
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
  assert.equal(
    isActiveOutboundLoan(
      loanRow({
        loan: {
          returned_at: "2026-04-02 10:00:00",
          loan_status: "ACTIVE",
        },
      }),
    ),
    false,
  );
  assert.equal(isActiveOutboundLoan(loanRow({ spool_status: "DELETED" })), false);
});
