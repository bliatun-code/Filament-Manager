import { normalizeLoanDirection, normalizeLoanStatus } from "./inventory_domain";
import type {
  ActiveSpoolLoanRow,
  SpoolLoanDetailsRow,
  SpoolLoanRow,
} from "./tauri_client";

export function normalizeSpoolLoanRow(loan: SpoolLoanRow): SpoolLoanRow {
  return {
    ...loan,
    loan_direction: normalizeLoanDirection(loan.loan_direction),
    loan_status: normalizeLoanStatus(loan.loan_status, loan.returned_at),
  };
}

export function normalizeLoanDetailsRow(row: SpoolLoanDetailsRow): SpoolLoanDetailsRow {
  return {
    ...row,
    loan: normalizeSpoolLoanRow(row.loan),
  };
}

export function normalizeActiveLoanRow(row: ActiveSpoolLoanRow): ActiveSpoolLoanRow {
  return {
    ...row,
    loan: normalizeSpoolLoanRow(row.loan),
  };
}
