import type { SpoolLoanDetailsRow } from "./tauri_client";

export function loanHasDeletedSpool(row: Pick<SpoolLoanDetailsRow, "spool_status">): boolean {
  return (row.spool_status ?? "").trim().toUpperCase() === "DELETED";
}

export function isLoanCurrentlyActive(
  row: Pick<SpoolLoanDetailsRow, "loan" | "spool_status">,
): boolean {
  return !row.loan.returned_at && !loanHasDeletedSpool(row);
}
