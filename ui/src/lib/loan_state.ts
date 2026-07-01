import { normalizeLoanDirection, normalizeLoanStatus } from "./inventory_domain";
import type { SpoolLoanDetailsRow } from "./tauri_client";

export function loanHasDeletedSpool(row: Pick<SpoolLoanDetailsRow, "spool_status">): boolean {
  return (row.spool_status ?? "").trim().toUpperCase() === "DELETED";
}

export function isLoanCurrentlyActive(
  row: Pick<SpoolLoanDetailsRow, "loan" | "spool_status">,
): boolean {
  return !row.loan.returned_at && !loanHasDeletedSpool(row);
}

export function isActiveOutboundLoan(
  row: Pick<SpoolLoanDetailsRow, "loan" | "spool_status">,
): boolean {
  const loanStatus = normalizeLoanStatus(row.loan.loan_status, row.loan.returned_at);
  const loanDirection = normalizeLoanDirection(row.loan.loan_direction);
  const currentlyActive = isLoanCurrentlyActive(row);
  return loanDirection === "OUTBOUND" && currentlyActive && loanStatus === "ACTIVE";
}
