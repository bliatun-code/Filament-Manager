import {
  isSpoolStatusDeleted,
  normalizeLoanDirection as normalizeLoanDirectionValue,
  normalizeLoanStatus as normalizeLoanStatusValue,
} from "./companion_domain.js";
import { LOAN_STATUSES } from "./shared_contracts.generated.js";

const CLOSED_LOAN_STATUSES = new Set(LOAN_STATUSES.filter((status) => status !== "ACTIVE"));

export function normalizeLoanStatus(row) {
  return normalizeLoanStatusValue(row?.loan?.loan_status, row?.loan?.returned_at);
}

export function normalizeLoanDirection(row) {
  return normalizeLoanDirectionValue(row?.loan?.loan_direction);
}

export function loanHasDeletedSpool(row) {
  return isSpoolStatusDeleted(row?.spool_status);
}

export function isLoanReturned(row) {
  return normalizeLoanStatus(row) === "RETURNED";
}

export function isLoanClosed(row) {
  return CLOSED_LOAN_STATUSES.has(normalizeLoanStatus(row));
}

export function isLoanCurrentlyActive(row) {
  return !isLoanClosed(row) && !loanHasDeletedSpool(row);
}

export function isActiveOutboundLoan(row) {
  return (
    normalizeLoanDirection(row) === "OUTBOUND" &&
    isLoanCurrentlyActive(row) &&
    normalizeLoanStatus(row) === "ACTIVE"
  );
}
