import {
  isInboundLoanDirection,
  isOutboundLoanDirection,
  isSpoolStatusDeleted,
  normalizeLoanStatus,
} from "./inventory_domain";
import type { SpoolLoanDetailsRow } from "./tauri_client";

export function loanHasDeletedSpool(row: Pick<SpoolLoanDetailsRow, "spool_status">): boolean {
  return isSpoolStatusDeleted(row.spool_status);
}

export function isLoanReturned(row: Pick<SpoolLoanDetailsRow, "loan">): boolean {
  return normalizeLoanStatus(row.loan.loan_status, row.loan.returned_at) === "RETURNED";
}

export function isLoanCurrentlyActive(
  row: Pick<SpoolLoanDetailsRow, "loan" | "spool_status">,
): boolean {
  return (
    normalizeLoanStatus(row.loan.loan_status, row.loan.returned_at) === "ACTIVE" &&
    !loanHasDeletedSpool(row)
  );
}

export function isInboundLoan(row: Pick<SpoolLoanDetailsRow, "loan">): boolean {
  return isInboundLoanDirection(row.loan.loan_direction);
}

export function isOutboundLoan(row: Pick<SpoolLoanDetailsRow, "loan">): boolean {
  return isOutboundLoanDirection(row.loan.loan_direction);
}

export function isActiveOutboundLoan(
  row: Pick<SpoolLoanDetailsRow, "loan" | "spool_status">,
): boolean {
  const currentlyActive = isLoanCurrentlyActive(row);
  return isOutboundLoan(row) && currentlyActive;
}
