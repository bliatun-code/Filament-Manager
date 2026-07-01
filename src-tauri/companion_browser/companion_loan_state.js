import { isSpoolStatusDeleted } from "./companion_domain.js";

const CLOSED_LOAN_STATUSES = new Set(["RETURNED", "LOST", "CANCELLED"]);

export function normalizeLoanStatus(row) {
  return String(row?.loan?.loan_status || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]+/g, "_");
}

export function loanHasDeletedSpool(row) {
  return isSpoolStatusDeleted(row?.spool_status);
}

export function isLoanReturned(row) {
  return Boolean(row?.loan?.returned_at) || normalizeLoanStatus(row) === "RETURNED";
}

export function isLoanClosed(row) {
  return Boolean(row?.loan?.returned_at) || CLOSED_LOAN_STATUSES.has(normalizeLoanStatus(row));
}

export function isLoanCurrentlyActive(row) {
  return !isLoanClosed(row) && !loanHasDeletedSpool(row);
}

export function isActiveOutboundLoan(row) {
  const direction = String(row?.loan?.loan_direction || "OUTBOUND").trim().toUpperCase();
  const status = normalizeLoanStatus(row);
  const currentlyActive = isLoanCurrentlyActive(row);
  return direction === "OUTBOUND" && currentlyActive && (status === "" || status === "ACTIVE");
}
