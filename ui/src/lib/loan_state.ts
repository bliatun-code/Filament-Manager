import {
  isInboundLoanDirection,
  isOutboundLoanDirection,
  isSpoolStatusDeleted,
  normalizeLoanStatus,
} from "./inventory_domain";
import type { NormalizedLoanDetailsRow } from "./loan_row_normalization";

export type LoanStateRow = Pick<NormalizedLoanDetailsRow, "loan" | "spool_status">;

export function loanHasDeletedSpool(
  row: Pick<NormalizedLoanDetailsRow, "spool_status">,
): boolean {
  return isSpoolStatusDeleted(row.spool_status);
}

export function isLoanReturned(
  row: Pick<NormalizedLoanDetailsRow, "loan">,
): boolean {
  return normalizeLoanStatus(row.loan.loan_status, row.loan.returned_at) === "RETURNED";
}

export function isLoanCurrentlyActive(row: LoanStateRow): boolean {
  return (
    normalizeLoanStatus(row.loan.loan_status, row.loan.returned_at) === "ACTIVE" &&
    !loanHasDeletedSpool(row)
  );
}

export function isInboundLoan(row: Pick<NormalizedLoanDetailsRow, "loan">): boolean {
  return isInboundLoanDirection(row.loan.loan_direction);
}

export function isOutboundLoan(row: Pick<NormalizedLoanDetailsRow, "loan">): boolean {
  return isOutboundLoanDirection(row.loan.loan_direction);
}

export function isActiveOutboundLoan(row: LoanStateRow): boolean {
  const currentlyActive = isLoanCurrentlyActive(row);
  return isOutboundLoan(row) && currentlyActive;
}
