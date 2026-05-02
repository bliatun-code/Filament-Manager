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
  const loanStatus = (row.loan.loan_status ?? "").trim().toUpperCase();
  const loanDirection = (row.loan.loan_direction ?? "OUTBOUND").trim().toUpperCase();
  return (
    loanDirection === "OUTBOUND" &&
    (loanStatus === "ACTIVE" || isLoanCurrentlyActive(row)) &&
    !loanHasDeletedSpool(row)
  );
}
